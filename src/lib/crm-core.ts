// Server-only building blocks shared by the CRM data modules (crm.ts,
// crm-companies.ts, crm-import.ts). Kept apart so those modules never import
// each other in a circle.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { companyKey, type CrmEventKind } from "./crm-types";

/** Who did it — null for things the system did on its own (an inbound message creating a contact, an automatic stage move). */
export type CrmActor = { userId: string; userName: string } | null;

/** A validation failure worth showing the user as-is (pt-BR), unlike an unexpected error. */
export class CrmInputError extends Error {}

export function iso(d: Date | string | null): string | null {
  if (!d) return null;
  return d instanceof Date ? d.toISOString() : new Date(d).toISOString();
}

export function cleanText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed ? trimmed.slice(0, max) : null;
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
 * The company id for a typed name: the existing one when the normalized name
 * matches (companyKey), else a new company. Empty name → null. A segment/city
 * given here only fills fields the company doesn't have yet.
 */
export async function resolveCompanyId(
  client: PoolClient,
  rawName: unknown,
  extra: { segment?: string | null; city?: string | null; importId?: string | null },
  actor: CrmActor
): Promise<string | null> {
  const name = cleanText(rawName, 120)?.replace(/\s+/g, " ") ?? null;
  if (!name) return null;
  const key = companyKey(name);
  if (!key) return null;
  const found = await client.query<{ id: string }>(`SELECT id FROM crm_companies WHERE name_key = $1`, [key]);
  if (found.rows[0]) {
    const id = found.rows[0].id;
    if (extra.segment || extra.city) {
      await client.query(
        `UPDATE crm_companies SET segment = COALESCE(segment, $2), city = COALESCE(city, $3), updated_at = now() WHERE id = $1`,
        [id, extra.segment ?? null, extra.city ?? null]
      );
    }
    return id;
  }
  // ON CONFLICT: two requests creating the same company at once both end up on one row.
  const inserted = await client.query<{ id: string }>(
    `INSERT INTO crm_companies (id, name, name_key, segment, city, import_id, created_by)
     VALUES ($1, $2, $3, $4, $5, $6, $7)
     ON CONFLICT (name_key) DO UPDATE SET updated_at = crm_companies.updated_at
     RETURNING id`,
    [randomUUID(), name, key, extra.segment ?? null, extra.city ?? null, extra.importId ?? null, actor?.userId ?? null]
  );
  return inserted.rows[0].id;
}
