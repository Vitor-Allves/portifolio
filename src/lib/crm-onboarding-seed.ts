// Server-only. The onboarding checklist a new client starts with (evolução
// v1.0, item 9). Kept apart so both the clients module and the operations
// module use it without importing each other.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { ONBOARDING_ITEMS } from "./crm-operation-types";

/** Adds the missing items (none twice); returns how many were added. */
export async function seedOnboarding(q: Pick<PoolClient, "query">, clientId: string, ownerId: string | null): Promise<number> {
  let added = 0;
  for (const [i, it] of ONBOARDING_ITEMS.entries()) {
    const r = await q.query(
      `INSERT INTO crm_client_onboarding (id, client_id, item, label, sort, owner_id) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (client_id, item) DO NOTHING`,
      [randomUUID(), clientId, it.id, it.label, i, ownerId],
    );
    added += r.rowCount ?? 0;
  }
  return added;
}
