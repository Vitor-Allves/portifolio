// Server-only: companies (empresas) in the CRM. A company is found by its
// normalized name (companyKey), so typing "clinica ribeiro" on a new lead
// links to the existing "Clínica Ribeiro" instead of creating a twin — see
// resolveCompanyId in crm-core.ts.

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { requireSegment } from "./crm-options";
import {
  companyKey,
  type CrmCompanyDetail,
  type CrmCompanyRow,
  type CrmContactCard,
  type CrmPage,
} from "./crm-types";
import { listContactsPage } from "./crm";
import { CrmInputError, cleanText, escapeLike, iso, type CrmActor } from "./crm-core";

type CompanyRow = {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  website: string | null;
  notes: string | null;
  contact_count: string;
  open_count: string;
  won_count: string;
  last_activity_at: Date | null;
  created_at: Date;
};

const COMPANY_SELECT = `
  SELECT co.id, co.name, co.segment, co.city, co.website, co.notes, co.created_at,
         count(c.id) FILTER (WHERE c.archived_at IS NULL) AS contact_count,
         count(c.id) FILTER (WHERE c.archived_at IS NULL AND c.stage NOT IN ('ganho', 'perdido')) AS open_count,
         count(c.id) FILTER (WHERE c.archived_at IS NULL AND c.stage = 'ganho') AS won_count,
         max(COALESCE(c.last_message_at, c.updated_at)) AS last_activity_at
  FROM crm_companies co
  LEFT JOIN crm_contacts c ON c.company_id = co.id`;

function mapCompany(r: CompanyRow): CrmCompanyRow {
  return {
    id: r.id,
    name: r.name,
    segment: r.segment,
    city: r.city,
    website: r.website,
    notes: r.notes,
    contactCount: Number(r.contact_count),
    openCount: Number(r.open_count),
    wonCount: Number(r.won_count),
    lastActivityAt: iso(r.last_activity_at),
    createdAt: iso(r.created_at)!,
  };
}

export type CompanyFilters = { q?: string; segment?: string; city?: string };

export async function listCompanies(filters: CompanyFilters, page: number, pageSize: number): Promise<CrmPage<CrmCompanyRow>> {
  const where: string[] = ["co.archived_at IS NULL"];
  const values: unknown[] = [];
  const add = (sql: (n: number) => string, value: unknown) => {
    values.push(value);
    where.push(sql(values.length));
  };
  if (filters.q?.trim()) add((n) => `co.name ILIKE $${n}`, `%${escapeLike(filters.q.trim())}%`);
  if (filters.segment) add((n) => `co.segment = $${n}`, filters.segment);
  if (filters.city) add((n) => `co.city = $${n}`, filters.city);

  const db = await getDb();
  const whereSql = `WHERE ${where.join(" AND ")}`;
  const total = await db.query<{ n: string }>(`SELECT count(*) AS n FROM crm_companies co ${whereSql}`, values);
  const { rows } = await db.query<CompanyRow>(
    `${COMPANY_SELECT} ${whereSql} GROUP BY co.id ORDER BY lower(co.name) LIMIT $${values.length + 1} OFFSET $${values.length + 2}`,
    [...values, pageSize, (page - 1) * pageSize]
  );
  return { rows: rows.map(mapCompany), total: Number(total.rows[0].n), page, pageSize };
}

/** `visibleTo` (Comercial) limits the contacts listed to that user's leads and the unowned ones. */
export async function getCompanyDetail(id: string, visibleTo: string | null = null): Promise<CrmCompanyDetail | null> {
  const db = await getDb();
  const { rows } = await db.query<CompanyRow>(`${COMPANY_SELECT} WHERE co.id = $1 GROUP BY co.id`, [id]);
  if (!rows[0]) return null;
  const contacts: CrmContactCard[] = (await listContactsPage({ companyId: id, visibleTo }, 1, 200, "name")).rows;
  return { ...mapCompany(rows[0]), contacts };
}

/** Up to 8 names for the company field's suggestions. */
export async function suggestCompanies(q: string): Promise<{ id: string; name: string }[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string }>(
    `SELECT id, name FROM crm_companies WHERE archived_at IS NULL AND name ILIKE $1 ORDER BY lower(name) LIMIT 8`,
    [`%${escapeLike(q.trim())}%`]
  );
  return rows;
}

export type CompanyInput = { name?: unknown; segment?: unknown; city?: unknown; website?: unknown; notes?: unknown };

function cleanWebsite(value: unknown): string | null {
  const w = cleanText(value, 200);
  if (!w) return null;
  return /^https?:\/\//i.test(w) ? w : `https://${w}`;
}

export async function createCompany(input: CompanyInput, actor: CrmActor): Promise<string> {
  const name = cleanText(input.name, 120)?.replace(/\s+/g, " ");
  if (!name || !companyKey(name)) throw new CrmInputError("Informe o nome da empresa.");
  return withTransaction(async (client) => {
    const dup = await client.query<{ name: string }>(`SELECT name FROM crm_companies WHERE name_key = $1`, [companyKey(name)]);
    if (dup.rows[0]) throw new CrmInputError(`Essa empresa já está cadastrada como "${dup.rows[0].name}".`);
    await requireSegment(client, cleanText(input.segment, 80));
    const id = randomUUID();
    await client.query(
      `INSERT INTO crm_companies (id, name, name_key, segment, city, website, notes, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [id, name, companyKey(name), cleanText(input.segment, 80), cleanText(input.city, 80), cleanWebsite(input.website), cleanText(input.notes, 2000), actor?.userId ?? null]
    );
    return id;
  });
}

/** false = no such company. Renaming onto another company's name is refused (merge is a separate, deliberate step). */
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
    if (patch.segment !== undefined) {
      const segment = cleanText(patch.segment, 80);
      await requireSegment(client, segment, rows[0].segment);
      set("segment", segment);
    }
    if (patch.city !== undefined) set("city", cleanText(patch.city, 80));
    if (patch.website !== undefined) set("website", cleanWebsite(patch.website));
    if (patch.notes !== undefined) set("notes", cleanText(patch.notes, 2000));
    if (sets.length === 0) return true;
    sets.push("updated_at = now()");
    values.push(id);
    await client.query(`UPDATE crm_companies SET ${sets.join(", ")} WHERE id = $${values.length}`, values);
    return true;
  });
}
