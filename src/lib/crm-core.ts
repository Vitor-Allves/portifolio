// Server-only building blocks shared by the CRM data modules (crm.ts,
// crm-companies.ts, crm-import.ts). Kept apart so those modules never import
// each other in a circle.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { companyKey, formatCnpj, isCrmTemperature, normalizeCnpj, type CrmEventKind, type CrmTemperature } from "./crm-types";

/** Who did it — null for things the system did on its own (an inbound message creating a contact, an automatic stage move). */
export type CrmActor = { userId: string; userName: string } | null;

/** A validation failure worth showing the user as-is (pt-BR), unlike an unexpected error. */
export class CrmInputError extends Error {}

/** The acting profile may not do this (→ 403, message shown as-is). */
export class CrmForbiddenError extends Error {}

/** The record doesn't exist — or isn't visible to this profile, which reads the same (→ 404). */
export class CrmNotFoundError extends Error {}

export function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
}

/** CNPJ typed by someone → normalized; empty → null; invalid → a pt-BR error. */
export function parseCnpj(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") throw new CrmInputError("CNPJ inválido.");
  if (!value.trim()) return null;
  const cnpj = normalizeCnpj(value);
  if (!cnpj) throw new CrmInputError(`CNPJ inválido: ${value.trim()}. Confira os números (os dois últimos são dígitos verificadores).`);
  return cnpj;
}

/** "2026-12-20" → the same string after checking it's a real day; empty → null. */
export function parseDateOnly(value: unknown, what = "Data"): string | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new CrmInputError(`${what} inválida.`);
  const d = new Date(`${value}T12:00:00Z`);
  if (Number.isNaN(d.getTime()) || d.toISOString().slice(0, 10) !== value) throw new CrmInputError(`${what} inválida.`);
  return value;
}

/** "2026-12-20" → "20/12/2026" (for history entries). */
export function brDate(value: string | null): string | null {
  return value ? value.split("-").reverse().join("/") : null;
}

export function parseTemperature(value: unknown): CrmTemperature | null {
  if (value === null || value === undefined || value === "") return null;
  if (!isCrmTemperature(value)) throw new CrmInputError("Temperatura inválida — use frio, morno ou quente.");
  return value;
}

/** For ILIKE patterns built from user input: % and _ match literally. */
export function escapeLike(value: string): string {
  return value.replace(/[\\%_]/g, (c) => `\\${c}`);
}

export async function addEvent(client: PoolClient, contactId: string, kind: CrmEventKind, payload: Record<string, unknown>, actor: CrmActor) {
  await client.query(
    `INSERT INTO crm_events (id, contact_id, kind, payload, user_id, user_name) VALUES ($1, $2, $3, $4, $5, $6)`,
    [randomUUID(), contactId, kind, JSON.stringify(payload), actor?.userId ?? null, actor?.userName ?? "Sistema"]
  );
}

/**
 * The company id for a typed name (and CNPJ, when known): a company with that
 * CNPJ wins; else the one whose normalized name matches (companyKey); else a
 * new company in "Prospecção". Empty name and no CNPJ match → null. A
 * segment/city/CNPJ given here only fills fields the company doesn't have yet;
 * a name match that already has a different CNPJ is refused (two companies,
 * one name — the team decides which one).
 */
export async function resolveCompanyId(
  client: PoolClient,
  rawName: unknown,
  extra: { segment?: string | null; city?: string | null; importId?: string | null; cnpj?: string | null },
  actor: CrmActor
): Promise<string | null> {
  const cnpj = extra.cnpj ?? null;
  const fill = async (id: string) => {
    if (extra.segment || extra.city || cnpj) {
      await client.query(
        `UPDATE crm_companies SET segment = COALESCE(segment, $2), city = COALESCE(city, $3), cnpj = COALESCE(cnpj, $4), updated_at = now() WHERE id = $1`,
        [id, extra.segment ?? null, extra.city ?? null, cnpj]
      );
    }
    return id;
  };
  if (cnpj) {
    const byCnpj = await client.query<{ id: string }>(`SELECT id FROM crm_companies WHERE cnpj = $1`, [cnpj]);
    if (byCnpj.rows[0]) return fill(byCnpj.rows[0].id);
  }
  const name = cleanText(rawName, 120)?.replace(/\s+/g, " ") ?? null;
  if (!name) {
    if (cnpj) throw new CrmInputError(`Nenhuma empresa com o CNPJ ${formatCnpj(cnpj)} — informe também o nome da empresa.`);
    return null;
  }
  const key = companyKey(name);
  if (!key) return null;
  const found = await client.query<{ id: string; name: string; cnpj: string | null }>(`SELECT id, name, cnpj FROM crm_companies WHERE name_key = $1`, [key]);
  if (found.rows[0]) {
    const row = found.rows[0];
    if (cnpj && row.cnpj && row.cnpj !== cnpj) {
      throw new CrmInputError(`A empresa ${row.name} já está cadastrada com outro CNPJ (${formatCnpj(row.cnpj)}).`);
    }
    return fill(row.id);
  }
  // ON CONFLICT: two requests creating the same company at once both end up on one row.
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO crm_companies (id, name, name_key, segment, city, cnpj, status, import_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, 'prospeccao', $7, $8)
     ON CONFLICT (name_key) DO UPDATE SET updated_at = crm_companies.updated_at
     RETURNING id`,
    [randomUUID(), name, key, extra.segment ?? null, extra.city ?? null, cnpj, extra.importId ?? null, actor?.userId ?? null]
  );
  return inserted.rows[0].id;
}
