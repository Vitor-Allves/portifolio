// Server-only. Documentos e anexos (evolução v1.0, item 2.1; contratos
// assinados no item 8): files attached to a contact, a company or an active
// client, kept in the database (crm_files), up to 4 MB each (what one request
// to the server can carry). Only documents and images: PDF, Word, Excel,
// PowerPoint, text/CSV, JPEG, PNG, WebP — recognized by their first bytes,
// not only the name. They are served only to who can see the record, always
// as a download. Nothing is deleted: removing archives it (and who did it).

import { createHash, randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { CrmInputError, CrmNotFoundError, addEvent, cleanText, iso, type CrmActor } from "./crm-core";

export const MAX_FILE_BYTES = 4 * 1024 * 1024;

const TYPES: { ext: string[]; mime: string; magic?: (b: Buffer) => boolean }[] = [
  { ext: ["pdf"], mime: "application/pdf", magic: (b) => b.subarray(0, 5).toString("latin1") === "%PDF-" },
  { ext: ["png"], mime: "image/png", magic: (b) => b.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) },
  { ext: ["jpg", "jpeg"], mime: "image/jpeg", magic: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff },
  { ext: ["webp"], mime: "image/webp", magic: (b) => b.subarray(0, 4).toString("latin1") === "RIFF" && b.subarray(8, 12).toString("latin1") === "WEBP" },
  // Office files are zip packages (docx/xlsx/pptx) or the old binary format (doc/xls/ppt).
  { ext: ["docx"], mime: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", magic: isZip },
  { ext: ["xlsx"], mime: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", magic: isZip },
  { ext: ["pptx"], mime: "application/vnd.openxmlformats-officedocument.presentationml.presentation", magic: isZip },
  { ext: ["doc"], mime: "application/msword", magic: isOle },
  { ext: ["xls"], mime: "application/vnd.ms-excel", magic: isOle },
  { ext: ["ppt"], mime: "application/vnd.ms-powerpoint", magic: isOle },
  { ext: ["txt"], mime: "text/plain", magic: isText },
  { ext: ["csv"], mime: "text/csv", magic: isText },
];
function isZip(b: Buffer) {
  return b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}
function isOle(b: Buffer) {
  return b.subarray(0, 8).equals(Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]));
}
function isText(b: Buffer) {
  // No NUL bytes in the first 4 KB: text, not a binary renamed .txt.
  return !b.subarray(0, 4096).includes(0);
}

export const ACCEPTED_EXTENSIONS = TYPES.flatMap((t) => t.ext);

/** The file's type from its name, checked against its first bytes; refused otherwise. */
export function detectType(name: string, bytes: Buffer): string {
  const ext = name.toLowerCase().split(".").pop() ?? "";
  const t = TYPES.find((x) => x.ext.includes(ext));
  if (!t) throw new CrmInputError(`Tipo de arquivo não aceito. Envie ${ACCEPTED_EXTENSIONS.map((e) => e.toUpperCase()).join(", ")}.`);
  if (t.magic && !t.magic(bytes)) throw new CrmInputError(`O conteúdo do arquivo não confere com a extensão .${ext}.`);
  return t.mime;
}

export type FileTarget = { contactId?: string | null; companyId?: string | null; clientId?: string | null; dealId?: string | null };

export type CrmFile = {
  id: string;
  name: string;
  mime: string;
  sizeBytes: number;
  dealId: string | null;
  uploadedByName: string | null;
  createdAt: string;
  archivedAt: string | null;
  archivedByName: string | null;
};

type Row = {
  id: string;
  name: string;
  mime: string;
  size_bytes: number;
  deal_id: string | null;
  uploaded_by_name: string | null;
  created_at: Date;
  archived_at: Date | null;
  archived_by_name: string | null;
  contact_id: string | null;
  company_id: string | null;
  client_id: string | null;
};
const COLS = `id, name, mime, size_bytes, deal_id, uploaded_by_name, created_at, archived_at, archived_by_name, contact_id, company_id, client_id`;
const map = (r: Row): CrmFile => ({
  id: r.id,
  name: r.name,
  mime: r.mime,
  sizeBytes: Number(r.size_bytes),
  dealId: r.deal_id,
  uploadedByName: r.uploaded_by_name,
  createdAt: iso(r.created_at)!,
  archivedAt: iso(r.archived_at),
  archivedByName: r.archived_by_name,
});

/** A file name safe to show and to put in a download header. */
export function cleanFileName(name: unknown): string {
  const n = (cleanText(name, 160) ?? "").replace(/[\\/\u0000-\u001f"<>|:*?]/g, "_").trim();
  if (!n || n === "." || n === "..") throw new CrmInputError("Arquivo sem nome.");
  return n;
}

/** Attaches a file to one record (contact, company or client); the contact's history records it. */
export async function attachFile(target: FileTarget, file: { name: unknown; bytes: Buffer }, actor: CrmActor): Promise<CrmFile> {
  const kinds = [target.contactId, target.companyId, target.clientId].filter(Boolean);
  if (kinds.length !== 1) throw new CrmInputError("Escolha onde anexar o arquivo.");
  if (file.bytes.length === 0) throw new CrmInputError("O arquivo está vazio.");
  if (file.bytes.length > MAX_FILE_BYTES) throw new CrmInputError("Arquivo grande demais: o limite é 4 MB.");
  const name = cleanFileName(file.name);
  const mime = detectType(name, file.bytes);
  const sha = createHash("sha256").update(file.bytes).digest("hex");
  const id = randomUUID();
  await withTransaction(async (client) => {
    if (target.dealId) {
      const d = await client.query(`SELECT 1 FROM crm_deals WHERE id = $1 AND contact_id = $2`, [target.dealId, target.contactId ?? ""]);
      if (!d.rows.length) throw new CrmInputError("Oportunidade inválida para este contato.");
    }
    await client.query(
      `INSERT INTO crm_files (id, contact_id, company_id, client_id, deal_id, name, mime, size_bytes, sha256, content, uploaded_by, uploaded_by_name)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)`,
      [
        id,
        target.contactId ?? null,
        target.companyId ?? null,
        target.clientId ?? null,
        target.dealId ?? null,
        name,
        mime,
        file.bytes.length,
        sha,
        file.bytes,
        actor?.userId ?? null,
        actor?.userName ?? null,
      ],
    );
    if (target.contactId) await addEvent(client, target.contactId, "file", { action: "attached", fileId: id, name }, actor);
  });
  const db = await getDb();
  const { rows } = await db.query<Row>(`SELECT ${COLS} FROM crm_files WHERE id = $1`, [id]);
  return map(rows[0]);
}

/** The files of a record (archived ones only when asked). */
export async function listFiles(target: FileTarget, withArchived = false): Promise<CrmFile[]> {
  const db = await getDb();
  const [col, value] = target.contactId
    ? ["contact_id", target.contactId]
    : target.companyId
      ? ["company_id", target.companyId]
      : ["client_id", target.clientId];
  if (!value) return [];
  const { rows } = await db.query<Row>(
    `SELECT ${COLS} FROM crm_files WHERE ${col} = $1 ${withArchived ? "" : "AND archived_at IS NULL"} ORDER BY created_at DESC LIMIT 200`,
    [value],
  );
  return rows.map(map);
}

/** Where a file belongs (to check who may see / change it). */
export async function fileOwner(id: string): Promise<{ contactId: string | null; companyId: string | null; clientId: string | null; name: string } | null> {
  const db = await getDb();
  const { rows } = await db.query<Row>(`SELECT ${COLS} FROM crm_files WHERE id = $1`, [id]);
  return rows[0] ? { contactId: rows[0].contact_id, companyId: rows[0].company_id, clientId: rows[0].client_id, name: rows[0].name } : null;
}

/** The bytes, for a download. */
export async function readFile(id: string): Promise<{ name: string; mime: string; bytes: Buffer } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ name: string; mime: string; content: Buffer }>(`SELECT name, mime, content FROM crm_files WHERE id = $1`, [id]);
  return rows[0] ? { name: rows[0].name, mime: rows[0].mime, bytes: rows[0].content } : null;
}

/** Archives a file (nothing is deleted). */
export async function archiveFile(id: string, actor: CrmActor): Promise<void> {
  await withTransaction(async (client) => {
    const { rows } = await client.query<Row>(`SELECT ${COLS} FROM crm_files WHERE id = $1 FOR UPDATE`, [id]);
    const f = rows[0];
    if (!f) throw new CrmNotFoundError("Arquivo não encontrado.");
    if (f.archived_at) return;
    await client.query(`UPDATE crm_files SET archived_at = now(), archived_by_name = $2 WHERE id = $1`, [id, actor?.userName ?? null]);
    if (f.contact_id) await addEvent(client, f.contact_id, "file", { action: "archived", fileId: id, name: f.name }, actor);
  });
}
