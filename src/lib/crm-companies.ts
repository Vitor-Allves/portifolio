// Server-only: companies (empresas) in the CRM. A company is found by its
// normalized name (companyKey), so typing "clinica ribeiro" on a new lead
// links to the existing "Clínica Ribeiro" instead of creating a twin — see
// resolveCompanyId in crm-core.ts.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { requireSegment } from "./crm-options";
import {
  BR_STATES,
  companyKey,
  formatCnpj,
  isCrmCompanyStatus,
  type CrmCompanyDetail,
  type CrmCompanyRow,
  type CrmContactCard,
  type CrmPage,
} from "./crm-types";
import { listContactsPage } from "./crm";
import { listDealsForContacts } from "./crm-deals";
import { CrmInputError, cleanText, escapeLike, iso, parseCnpj, type CrmActor } from "./crm-core";

type CompanyRow = {
  id: string;
  name: string;
  legal_name: string | null;
  cnpj: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  owner_id: string | null;
  owner_name: string | null;
  status: string | null;
  tag_ids: string[];
  decision_makers: { id: string; name: string }[] | null;
  contact_count: string;
  open_count: string;
  won_count: string;
  last_activity_at: Date | null;
  created_at: Date;
  client_id: string | null;
};

const COMPANY_SELECT = `
  SELECT co.id, co.name, co.legal_name, co.cnpj, co.segment, co.city, co.state, co.address, co.website, co.notes,
         co.owner_id, ou.name AS owner_name, co.status, co.created_at,
         ARRAY(SELECT ct.tag_id FROM crm_company_tags ct WHERE ct.company_id = co.id ORDER BY ct.applied_at, ct.tag_id) AS tag_ids,
         (SELECT json_agg(json_build_object('id', dm.id, 'name', dm.name) ORDER BY lower(dm.name))
            FROM crm_contacts dm WHERE dm.company_id = co.id AND dm.is_decision_maker AND dm.archived_at IS NULL) AS decision_makers,
         count(c.id) FILTER (WHERE c.archived_at IS NULL) AS contact_count,
         count(c.id) FILTER (WHERE c.archived_at IS NULL AND c.stage NOT IN ('ganho', 'perdido')) AS open_count,
         count(c.id) FILTER (WHERE c.archived_at IS NULL AND c.stage = 'ganho') AS won_count,
         max(COALESCE(c.last_message_at, c.updated_at)) AS last_activity_at,
         (SELECT cl.id FROM crm_clients cl WHERE cl.company_id = co.id) AS client_id
  FROM crm_companies co
  LEFT JOIN internal_users ou ON ou.id = co.owner_id
  LEFT JOIN crm_contacts c ON c.company_id = co.id`;
const COMPANY_GROUP = `GROUP BY co.id, ou.name`;

function mapCompany(r: CompanyRow): CrmCompanyRow {
  return {
    id: r.id,
    name: r.name,
    legalName: r.legal_name,
    cnpj: r.cnpj,
    segment: r.segment,
    city: r.city,
    state: r.state,
    address: r.address,
    website: r.website,
    notes: r.notes,
    ownerId: r.owner_id,
    ownerName: r.owner_name,
    status: isCrmCompanyStatus(r.status) ? r.status : null,
    tagIds: r.tag_ids ?? [],
    decisionMakers: r.decision_makers ?? [],
    contactCount: Number(r.contact_count),
    openCount: Number(r.open_count),
    wonCount: Number(r.won_count),
    lastActivityAt: iso(r.last_activity_at),
    createdAt: iso(r.created_at)!,
    clientId: r.client_id ?? null,
  };
}

export type CompanyFilters = {
  q?: string;
  segment?: string;
  city?: string;
  state?: string;
  /** Situação comercial; "none" = not set. */
  status?: string;
  /** "mine" needs currentUserId; "none" = no account owner; else that user's id. */
  owner?: string;
  currentUserId?: string;
  tag?: string;
};

export async function listCompanies(filters: CompanyFilters, page: number, pageSize: number): Promise<CrmPage<CrmCompanyRow>> {
  const where: string[] = ["co.archived_at IS NULL"];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    values.push(value);
    where.push(sql(values.length));
  };
  const q = filters.q?.trim();
  if (q) {
    values.push(`%${escapeLike(q)}%`);
    const n = values.length;
    // CNPJ typed with or without punctuation.
    const bare = q.replace(/[\s./-]/g, "").toUpperCase();
    let cnpjSql = "";
    if (/^[0-9A-Z]{4,14}$/.test(bare) && /\d/.test(bare)) {
      values.push(`%${bare}%`);
      cnpjSql = ` OR co.cnpj LIKE $${values.length}`;
    }
    where.push(`(co.name ILIKE $${n} OR co.legal_name ILIKE $${n}${cnpjSql})`);
  }
  if (filters.segment) add((n) => `co.segment = $${n}`, filters.segment);
  if (filters.city) add((n) => `co.city = $${n}`, filters.city);
  if (filters.state) add((n) => `co.state = $${n}`, filters.state);
  if (filters.status === "none") where.push("co.status IS NULL");
  else if (filters.status && isCrmCompanyStatus(filters.status)) add((n) => `co.status = $${n}`, filters.status);
  if (filters.owner === "mine" && filters.currentUserId) add((n) => `co.owner_id = $${n}`, filters.currentUserId);
  else if (filters.owner === "none") where.push("co.owner_id IS NULL");
  else if (filters.owner && filters.owner !== "all" && filters.owner !== "mine") add((n) => `co.owner_id = $${n}`, filters.owner);
  if (filters.tag) add((n) => `EXISTS (SELECT 1 FROM crm_company_tags ct WHERE ct.company_id = co.id AND ct.tag_id = $${n})`, filters.tag);

  const db = await getDb();
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const total = await db.query<{ n: string }>(`SELECT count(*) AS n FROM crm_companies co ${whereSql}`, values);
  const { rows } = await db.query<CompanyRow>(
    `${COMPANY_SELECT} ${whereSql} ${COMPANY_GROUP} ORDER BY lower(co.name) LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize]
  );
  return { rows: rows.map(mapCompany), total: Number(total.rows[0].n), page, pageSize };
}

/** `visibleTo` (Comercial) limits the contacts (and their opportunities) listed to that user's leads and the unowned ones. */
export async function getCompanyDetail(id: string, visibleTo: string | null = null): Promise<CrmCompanyDetail | null> {
  const db = await getDb();
  const { rows } = await db.query<CompanyRow>(`${COMPANY_SELECT} WHERE co.id = $1 ${COMPANY_GROUP}`, [id]);
  if (!rows[0]) return null;
  const contacts: CrmContactCard[] = (await listContactsPage({ companyId: id, visibleTo }, 1, 200, "name")).rows;
  const names = new Map(contacts.map((c) => [c.id, c.name]));
  const deals = (await listDealsForContacts(db, contacts.map((c) => c.id))).map((d) => ({ ...d, contactName: names.get(d.contactId) ?? "" }));
  const links = await db.query<{ tag_id: string; applied_via: string; applied_by_name: string | null; applied_at: Date }>(
    `SELECT ct.tag_id, ct.applied_via, ct.applied_by_name, ct.applied_at FROM crm_company_tags ct JOIN crm_tags t ON t.id = ct.tag_id
     WHERE ct.company_id = $1 ORDER BY t.category, t.sort, lower(t.label)`,
    [id]
  );
  return {
    ...mapCompany(rows[0]),
    contacts,
    deals,
    tagLinks: links.rows.map((r) => ({ tagId: r.tag_id, via: r.applied_via, byName: r.applied_by_name, at: r.applied_at.toISOString() })),
  };
}

/** Up to 8 names for the company field's suggestions (by name, razão social or CNPJ). */
export async function suggestCompanies(q: string): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  const bare = q.replace(/[\s./-]/g, "").toUpperCase();
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM crm_companies
     WHERE archived_at IS NULL AND (name ILIKE $1 OR legal_name ILIKE $1 OR ($2 <> '' AND cnpj LIKE $2))
     ORDER BY lower(name) LIMIT 8`,
    [`%${escapeLike(q.trim())}%`, /^[0-9A-Z]{4,14}$/.test(bare) && /\d/.test(bare) ? `${bare}%` : ""]
  );
  return rows;
}

export type CompanyInput = {
  name?: unknown;
  legalName?: unknown;
  cnpj?: unknown;
  segment?: unknown;
  city?: unknown;
  state?: unknown;
  address?: unknown;
  website?: unknown;
  notes?: unknown;
  ownerId?: unknown;
  status?: unknown;
};

function cleanWebsite(value: unknown): string | null {
  const w = cleanText(value, 200);
  if (!w) return null;
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

function parseState(value: unknown): string | null {
  const v = cleanText(value, 2)?.toUpperCase() ?? null;
  if (v && !(BR_STATES as readonly string[]).includes(v)) throw new CrmInputError("Estado inválido — use a sigla (SP, RJ…).");
  return v;
}

function parseStatus(value: unknown): string | null {
  if (value === null || value === "") return null;
  if (!isCrmCompanyStatus(value)) throw new CrmInputError("Situação comercial inválida.");
  return value;
}

type Q = Pick<PoolClient, "query">;

async function requireUniqueCnpj(client: Q, cnpj: string | null, exceptId: string | null) {
  if (!cnpj) return;
  const dup = await client.query<{ name: string }>(`SELECT name FROM crm_companies WHERE cnpj = $1 AND id IS DISTINCT FROM $2`, [cnpj, exceptId]);
  if (dup.rows[0]) throw new CrmInputError(`O CNPJ ${formatCnpj(cnpj)} já está cadastrado na empresa "${dup.rows[0].name}".`);
}

async function requireUser(client: Q, ownerId: string | null) {
  if (!ownerId) return;
  const ok = await client.query(`SELECT 1 FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [ownerId]);
  if (ok.rows.length === 0) throw new CrmInputError("Responsável inválido.");
}

export async function createCompany(input: CompanyInput, actor: CrmActor): Promise<string> {
  const name = cleanText(input.name, 120)?.replace(/\s+/g, " ");
  if (!name || !companyKey(name)) throw new CrmInputError("Informe o nome da empresa.");
  const cnpj = parseCnpj(input.cnpj);
  const state = parseState(input.state);
  const status = input.status === undefined ? "prospeccao" : parseStatus(input.status);
  const ownerId = typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null;
  return withTransaction(async (client) => {
    const dup = await client.query<{ name: string }>(`SELECT name FROM crm_companies WHERE name_key = $1`, [companyKey(name)]);
    if (dup.rows[0]) throw new CrmInputError(`Essa empresa já está cadastrada como "${dup.rows[0].name}".`);
    await requireUniqueCnpj(client, cnpj, null);
    await requireSegment(client, cleanText(input.segment, 80));
    await requireUser(client, ownerId);
    const id = randomUUID();
    await client.query(
      `INSERT INTO crm_companies (id, name, name_key, legal_name, cnpj, segment, city, state, address, website, notes, owner_id, status, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
      [
        id,
        name,
        companyKey(name),
        cleanText(input.legalName, 160),
        cnpj,
        cleanText(input.segment, 80),
        cleanText(input.city, 80),
        state,
        cleanText(input.address, 240),
        cleanWebsite(input.website),
        cleanText(input.notes, 2000),
        ownerId,
        status,
        actor?.userId ?? null,
      ]
    );
    return id;
  });
}

/** false = no such company. Renaming onto another company's name (or CNPJ) is refused (merge is a separate, deliberate step). */
export async function updateCompany(id: string, patch: CompanyInput): Promise<boolean> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<{ segment: string | null }>(`SELECT segment FROM crm_companies WHERE id = $1 FOR UPDATE`, [id]);
    if (rows.length === 0) return false;
    const sets: string[] = [];
    const values: unknown[] = [];
    const set = (column: string, value: unknown) => {
      values.push(value);
      sets.push(`${column} = $${values.length}`);
    };
    if (patch.name !== undefined) {
      const name = cleanText(patch.name, 120)?.replace(/\s+/g, " ");
      if (!name || !companyKey(name)) throw new CrmInputError("O nome da empresa não pode ficar vazio.");
      const dup = await client.query<{ name: string }>(`SELECT name FROM crm_companies WHERE name_key = $1 AND id <> $2`, [companyKey(name), id]);
      if (dup.rows[0]) throw new CrmInputError(`Já existe a empresa "${dup.rows[0].name}".`);
      set("name", name);
      set("name_key", companyKey(name));
    }
    if (patch.cnpj !== undefined) {
      const cnpj = parseCnpj(patch.cnpj);
      await requireUniqueCnpj(client, cnpj, id);
      set("cnpj", cnpj);
    }
    if (patch.segment !== undefined) {
      const segment = cleanText(patch.segment, 80);
      await requireSegment(client, segment, rows[0].segment);
      set("segment", segment);
    }
    if (patch.legalName !== undefined) set("legal_name", cleanText(patch.legalName, 160));
    if (patch.city !== undefined) set("city", cleanText(patch.city, 80));
    if (patch.state !== undefined) set("state", parseState(patch.state));
    if (patch.address !== undefined) set("address", cleanText(patch.address, 240));
    if (patch.website !== undefined) set("website", cleanWebsite(patch.website));
    if (patch.notes !== undefined) set("notes", cleanText(patch.notes, 2000));
    if (patch.status !== undefined) set("status", parseStatus(patch.status));
    if (patch.ownerId !== undefined) {
      const ownerId = typeof patch.ownerId === "string" && patch.ownerId ? patch.ownerId : null;
      await requireUser(client, ownerId);
      set("owner_id", ownerId);
    }
    if (sets.length === 0) return true;
    sets.push("updated_at = now()");
    values.push(id);
    await client.query(`UPDATE crm_companies SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    return true;
  });
}

/** Current account owner (for the owner-change rule). null = no such company. */
export async function companyOwner(id: string): Promise<{ ownerId: string | null } | null> {
  const db = await getDb();
  const { rows } = await db.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_companies WHERE id = $1`, [id]);
  return rows[0] ? { ownerId: rows[0].owner_id } : null;
}

export async function addCompanyTag(companyId: string, tagId: string, actor: CrmActor): Promise<boolean> {
  return withTransaction(async (client) => {
    const tag = await client.query<{ label: string; archived: boolean }>(`SELECT label, archived_at IS NOT NULL AS archived FROM crm_tags WHERE id = $1`, [tagId]);
    if (!tag.rows[0]) throw new CrmInputError("Etiqueta não encontrada.");
    if (tag.rows[0].archived) throw new CrmInputError(`A etiqueta "${tag.rows[0].label}" foi arquivada.`);
    const res = await client.query(
      `INSERT INTO crm_company_tags (company_id, tag_id, applied_via, applied_by, applied_by_name) VALUES ($1, $2, 'manual', $3, $4)
       ON CONFLICT DO NOTHING`,
      [companyId, tagId, actor?.userId ?? null, actor?.userName ?? null]
    );
    return Boolean(res.rowCount);
  });
}

export async function removeCompanyTag(companyId: string, tagId: string): Promise<boolean> {
  const db = await getDb();
  const res = await db.query(`DELETE FROM crm_company_tags WHERE company_id = $1 AND tag_id = $2`, [companyId, tagId]);
  return Boolean(res.rowCount);
}
