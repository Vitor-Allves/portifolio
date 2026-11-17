// Server-only: spreadsheet import for the CRM. The browser reads the file
// and maps its columns (src/components/crm/crm-sheet.ts); here every row is
// validated against the base and against the rest of the sheet, then the new
// ones are written in a few bulk statements so a 5,000-row sheet fits well
// inside a serverless request.
//
// Rules: a row whose phone (either spelling of a BR mobile) or e-mail is
// already in the CRM, or earlier in the same sheet, is skipped — never merged
// or overwritten. Undoing an import removes only the contacts it created that
// nobody has touched since (no message, no stage/owner/field change).

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import {
  CRM_IMPORT_MAX_ROWS,
  CRM_SOURCES,
  companyKey,
  isCrmConsentStatus,
  isCrmSource,
  isPlausibleEmail,
  normalizePhone,
  phoneVariants,
  type CrmConsentStatus,
  type CrmImportDefaults,
  type CrmImportPreview,
  type CrmImportRow,
  type CrmImportRowResult,
  type CrmImportSummary,
  type CrmSource,
} from "./crm-types";
import { CrmInputError, cleanText, iso, type CrmActor } from "./crm-core";

function fold(value: string): string {
  return value
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/** Free text from an "Origem" column → one of the CRM's sources, or null when it doesn't say. */
export function matchSource(text: string | undefined): CrmSource | null {
  if (!text?.trim()) return null;
  const t = fold(text);
  const exact = CRM_SOURCES.find((s) => fold(s.label) === t || s.id === t);
  if (exact) return exact.id;
  if (/bni/.test(t)) return "bni";
  if (/indica/.test(t)) return "indicacao";
  if (/anunc|facebook|instagram|meta|google|ads|trafego|campanha/.test(t)) return "anuncio";
  if (/evento|feira|palestra|workshop/.test(t)) return "evento";
  if (/site|formul|landing|pagina/.test(t)) return "site";
  return "outro";
}

/** "sim", "s", "x", "aceitou"… → sim; "não", "n"… → não informado; blank → null (use the default). */
export function matchConsent(text: string | undefined): CrmConsentStatus | null {
  if (!text?.trim()) return null;
  const t = fold(text);
  if (/^(sim|s|x|yes|y|1|true|ok|aceit|autoriz|opt.?in)/.test(t)) return "sim";
  return "nao_informado";
}

type ParsedRow = {
  line: number;
  name: string;
  phone: string | null;
  email: string | null;
  company: string | null;
  companyKey: string | null;
  jobTitle: string | null;
  segment: string | null;
  city: string | null;
  source: CrmSource;
  referredBy: string | null;
  consentStatus: CrmConsentStatus;
  consentSource: string | null;
  notes: string | null;
};

type Checked = { results: CrmImportRowResult[]; fresh: ParsedRow[]; newCompanyKeys: Set<string> };

type Db = Pick<PoolClient, "query">;

async function checkRows(db: Db, rows: CrmImportRow[], defaults: CrmImportDefaults): Promise<Checked> {
  if (rows.length > CRM_IMPORT_MAX_ROWS) {
    throw new CrmInputError(`A planilha tem ${rows.length} linhas; o limite por importação é ${CRM_IMPORT_MAX_ROWS}. Divida em partes.`);
  }
  const defaultSource: CrmSource = isCrmSource(defaults.source) ? defaults.source : "outro";
  const defaultConsent: CrmConsentStatus = isCrmConsentStatus(defaults.consentStatus) ? defaults.consentStatus : "nao_informado";
  const defaultConsentSource = cleanText(defaults.consentSource, 200);

  const results: CrmImportRowResult[] = [];
  const parsed: ParsedRow[] = [];
  for (const row of rows) {
    const line = Number.isInteger(row.line) ? row.line : 0;
    const name = cleanText(row.name, 120);
    const fail = (message: string) => results.push({ line, name, status: "erro", message });
    if (!name) {
      fail("Sem nome.");
      continue;
    }
    let phone: string | null = null;
    if (row.phone?.trim()) {
      phone = normalizePhone(row.phone);
      if (phone.length < 10 || phone.length > 15) {
        fail(`Telefone inválido: "${row.phone.trim().slice(0, 30)}".`);
        continue;
      }
    }
    const email = cleanText(row.email, 160)?.toLowerCase() ?? null;
    if (email && !isPlausibleEmail(email)) {
      fail(`E-mail inválido: "${email.slice(0, 60)}".`);
      continue;
    }
    if (!phone && !email) {
      fail("Sem WhatsApp e sem e-mail.");
      continue;
    }
    const company = cleanText(row.company, 120)?.replace(/\s+/g, " ") ?? null;
    const consentFromSheet = matchConsent(row.consent);
    const consentSource = cleanText(row.consentSource, 200) ?? (consentFromSheet === "sim" || (!consentFromSheet && defaultConsent === "sim") ? defaultConsentSource : null);
    parsed.push({
      line,
      name,
      phone,
      email,
      company,
      companyKey: company ? companyKey(company) || null : null,
      jobTitle: cleanText(row.jobTitle, 80),
      segment: cleanText(row.segment, 80),
      city: cleanText(row.city, 80),
      source: matchSource(row.source) ?? defaultSource,
      referredBy: cleanText(row.referredBy, 120),
      consentStatus: consentFromSheet ?? defaultConsent,
      consentSource,
      notes: cleanText(row.notes, 2000),
    });
  }

  // Everything already in the CRM that any of these phones/e-mails could hit, in one query.
  const allPhones = [...new Set(parsed.flatMap((r) => (r.phone ? phoneVariants(r.phone) : [])))];
  const allEmails = [...new Set(parsed.flatMap((r) => (r.email ? [r.email] : [])))];
  const existing = await db.query<{ name: string; phone: string | null; email: string | null }>(
    `SELECT name, phone, lower(email) AS email FROM crm_contacts WHERE phone = ANY($1) OR lower(email) = ANY($2)`,
    [allPhones, allEmails]
  );
  const byPhone = new Map<string, string>();
  const byEmail = new Map<string, string>();
  for (const c of existing.rows) {
    if (c.phone) byPhone.set(c.phone, c.name);
    if (c.email) byEmail.set(c.email, c.name);
  }

  const seenPhone = new Map<string, number>();
  const seenEmail = new Map<string, number>();
  const fresh: ParsedRow[] = [];
  for (const r of parsed) {
    const dup = (message: string) => results.push({ line: r.line, name: r.name, status: "duplicado", message });
    const phoneHit = r.phone ? phoneVariants(r.phone).map((p) => byPhone.get(p)).find(Boolean) : undefined;
    if (phoneHit) {
      dup(`Telefone já cadastrado: ${phoneHit}.`);
      continue;
    }
    if (r.email && byEmail.has(r.email)) {
      dup(`E-mail já cadastrado: ${byEmail.get(r.email)}.`);
      continue;
    }
    const earlierPhone = r.phone ? phoneVariants(r.phone).map((p) => seenPhone.get(p)).find((n) => n !== undefined) : undefined;
    if (earlierPhone !== undefined) {
      dup(`Mesmo telefone da linha ${earlierPhone}.`);
      continue;
    }
    if (r.email && seenEmail.has(r.email)) {
      dup(`Mesmo e-mail da linha ${seenEmail.get(r.email)}.`);
      continue;
    }
    if (r.phone) for (const p of phoneVariants(r.phone)) seenPhone.set(p, r.line);
    if (r.email) seenEmail.set(r.email, r.line);
    fresh.push(r);
    results.push({ line: r.line, name: r.name, status: "novo", message: null });
  }

  const keys = [...new Set(fresh.flatMap((r) => (r.companyKey ? [r.companyKey] : [])))];
  const known = await db.query<{ name_key: string }>(`SELECT name_key FROM crm_companies WHERE name_key = ANY($1)`, [keys]);
  const knownKeys = new Set(known.rows.map((k) => k.name_key));
  const newCompanyKeys = new Set(keys.filter((k) => !knownKeys.has(k)));

  results.sort((a, b) => a.line - b.line);
  return { results, fresh, newCompanyKeys };
}

function summarize(checked: Checked): CrmImportPreview {
  const counts = { novo: 0, duplicado: 0, erro: 0 };
  for (const r of checked.results) counts[r.status] += 1;
  return { results: checked.results, counts, newCompanies: checked.newCompanyKeys.size };
}

/** Dry run: what would happen, row by row. Writes nothing. */
export async function previewImport(rows: CrmImportRow[], defaults: CrmImportDefaults): Promise<CrmImportPreview> {
  const db = await getDb();
  return summarize(await checkRows(db, rows, defaults));
}

export async function commitImport(
  fileName: string,
  rows: CrmImportRow[],
  defaults: CrmImportDefaults,
  actor: NonNullable<CrmActor>
): Promise<CrmImportPreview & { importId: string }> {
  return withTransaction(async (client) => {
    // One import at a time, so two people importing the same sheet can't both pass the duplicate check.
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('crm_import'))`);
    const ownerId = typeof defaults.ownerId === "string" && defaults.ownerId ? defaults.ownerId : null;
    if (ownerId) {
      const ok = await client.query(`SELECT 1 FROM internal_users WHERE id = $1 AND revoked_at IS NULL`, [ownerId]);
      if (ok.rows.length === 0) throw new CrmInputError("Responsável inválido.");
    }
    const checked = await checkRows(client, rows, defaults);
    const summary = summarize(checked);
    const importId = randomUUID();
    await client.query(
      `INSERT INTO crm_imports (id, file_name, created_by, created_by_name, row_count, created_count, skipped_count, error_count)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        importId,
        cleanText(fileName, 200) ?? "planilha",
        actor.userId,
        actor.userName,
        rows.length,
        summary.counts.novo,
        summary.counts.duplicado,
        summary.counts.erro,
      ]
    );
    if (checked.fresh.length === 0) return { ...summary, importId };

    // Companies: create the missing ones (first row's segment/city), then fill gaps on the existing.
    const firstByKey = new Map<string, ParsedRow>();
    for (const r of checked.fresh) if (r.companyKey && !firstByKey.has(r.companyKey)) firstByKey.set(r.companyKey, r);
    const companyRows = [...firstByKey.values()];
    if (companyRows.length > 0) {
      await client.query(
        `INSERT INTO crm_companies (id, name, name_key, segment, city, import_id, created_by)
         SELECT gen_random_uuid()::text, t.name, t.key, t.segment, t.city, $5, $6
         FROM unnest($1::text[], $2::text[], $3::text[], $4::text[]) AS t(name, key, segment, city)
         ON CONFLICT (name_key) DO UPDATE
           SET segment = COALESCE(crm_companies.segment, EXCLUDED.segment),
               city = COALESCE(crm_companies.city, EXCLUDED.city)`,
        [
          companyRows.map((r) => r.company),
          companyRows.map((r) => r.companyKey),
          companyRows.map((r) => r.segment),
          companyRows.map((r) => r.city),
          importId,
          actor.userId,
        ]
      );
    }
    const companyIds = new Map<string, string>();
    if (firstByKey.size > 0) {
      const { rows: found } = await client.query<{ id: string; name_key: string }>(
        `SELECT id, name_key FROM crm_companies WHERE name_key = ANY($1)`,
        [[...firstByKey.keys()]]
      );
      for (const f of found) companyIds.set(f.name_key, f.id);
    }

    const ids = checked.fresh.map(() => randomUUID());
    const col = <T,>(fn: (r: ParsedRow) => T) => checked.fresh.map(fn);
    await client.query(
      `INSERT INTO crm_contacts (id, name, phone, email, job_title, company_id, segment, city, source, referred_by,
                                 consent_status, consent_source, consent_at, owner_id, import_id)
       SELECT t.id, t.name, t.phone, t.email, t.job_title, t.company_id, t.segment, t.city, t.source, t.referred_by,
              t.consent_status, t.consent_source, CASE WHEN t.consent_status = 'sim' THEN now() END, $13, $14
       FROM unnest($1::text[], $2::text[], $3::text[], $4::text[], $5::text[], $6::text[], $7::text[], $8::text[],
                   $9::text[], $10::text[], $11::text[], $12::text[])
         AS t(id, name, phone, email, job_title, company_id, segment, city, source, referred_by, consent_status, consent_source)`,
      [
        ids,
        col((r) => r.name),
        col((r) => r.phone),
        col((r) => r.email),
        col((r) => r.jobTitle),
        col((r) => (r.companyKey ? companyIds.get(r.companyKey) ?? null : null)),
        // linked to a company → segment/city live on the company
        col((r) => (r.companyKey ? null : r.segment)),
        col((r) => (r.companyKey ? null : r.city)),
        col((r) => r.source),
        col((r) => r.referredBy),
        col((r) => r.consentStatus),
        col((r) => r.consentSource),
        ownerId,
        importId,
      ]
    );

    // One opportunity in "Novo" per imported contact (titled by company, else name).
    if (defaults.createDeals !== false) {
      await client.query(
        `INSERT INTO crm_deals (id, contact_id, title, stage, owner_id, import_id, created_by)
         SELECT gen_random_uuid()::text, t.contact_id, t.title, 'novo', $3, $4, $5
         FROM unnest($1::text[], $2::text[]) AS t(contact_id, title)`,
        [ids, col((r) => r.company ?? r.name), ownerId, importId, actor.userId]
      );
    }

    // History: "created via importação" for each, plus the sheet's observations as a note.
    const created = JSON.stringify({ via: "importacao", importId, fileName: cleanText(fileName, 200) });
    const noteRows = checked.fresh.map((r, i) => ({ id: ids[i], notes: r.notes })).filter((n) => n.notes);
    await client.query(
      `INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name)
       SELECT gen_random_uuid()::text, t.contact_id, 'created', $2::jsonb, $3, $4 FROM unnest($1::text[]) AS t(contact_id)`,
      [ids, created, actor.userId, actor.userName]
    );
    if (noteRows.length > 0) {
      await client.query(
        `INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name)
         SELECT gen_random_uuid()::text, t.contact_id, 'note', jsonb_build_object('text', t.notes, 'imported', true), $3, $4
         FROM unnest($1::text[], $2::text[]) AS t(contact_id, notes)`,
        [noteRows.map((n) => n.id), noteRows.map((n) => n.notes), actor.userId, actor.userName]
      );
    }
    return { ...summary, importId };
  });
}

export async function listImports(limit = 20): Promise<CrmImportSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    file_name: string;
    created_by_name: string;
    created_at: Date;
    row_count: number;
    created_count: number;
    skipped_count: number;
    error_count: number;
    undone_at: Date | null;
  }>(`SELECT * FROM crm_imports ORDER BY created_at DESC LIMIT $1`, [limit]);
  return rows.map((r) => ({
    id: r.id,
    fileName: r.file_name,
    createdByName: r.created_by_name,
    createdAt: iso(r.created_at)!,
    rowCount: r.row_count,
    createdCount: r.created_count,
    skippedCount: r.skipped_count,
    errorCount: r.error_count,
    undoneAt: iso(r.undone_at),
  }));
}

/**
 * Removes what an import created and nobody has worked on since: contacts
 * with no message and no history beyond their own "created"/imported note,
 * then companies it created that no contact uses anymore. Anything touched
 * stays and is reported as kept. null = no such import (or already undone).
 */
export async function undoImport(importId: string, actor: NonNullable<CrmActor>): Promise<{ removed: number; kept: number } | null> {
  return withTransaction(async (client) => {
    const imp = await client.query(`SELECT 1 FROM crm_imports WHERE id = $1 AND undone_at IS NULL FOR UPDATE`, [importId]);
    if (imp.rows.length === 0) return null;
    const removed = await client.query(
      `DELETE FROM crm_contacts c
       WHERE c.import_id = $1
         AND NOT EXISTS (SELECT 1 FROM crm_messages m WHERE m.contact_id = c.id)
         AND NOT EXISTS (
           SELECT 1 FROM crm_events e
           WHERE e.contact_id = c.id
             AND NOT (e.kind = 'created' OR (e.kind = 'note' AND e.payload->>'imported' = 'true'))
         )`,
      [importId]
    );
    const kept = await client.query<{ n: string }>(`SELECT count(*) AS n FROM crm_contacts WHERE import_id = $1`, [importId]);
    await client.query(
      `DELETE FROM crm_companies co
       WHERE co.import_id = $1 AND NOT EXISTS (SELECT 1 FROM crm_contacts c WHERE c.company_id = co.id)`,
      [importId]
    );
    await client.query(`UPDATE crm_imports SET undone_at = now(), undone_by_name = $2 WHERE id = $1`, [importId, actor.userName]);
    return { removed: removed.rowCount ?? 0, kept: Number(kept.rows[0].n) };
  });
}
