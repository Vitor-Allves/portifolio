// Server-only. Monthly media-budget bookkeeping per client (company) — one
// row per client_access_id/year/month in client_budgets (see db.ts). Pure
// data access; the pacing math (projection, "no ritmo"/acima/abaixo) lives
// in budget-pacing.ts so both the admin form and the live dashboard card
// can share it without importing this server-only module.

import { getDb } from "./db";

export async function getClientBudget(clientAccessId: string, year: number, month: number): Promise<number | null> {
  const db = await getDb();
  const { rows } = await db.query<{ amount: string }>(
    `SELECT amount FROM client_budgets WHERE client_access_id = $1 AND year = $2 AND month = $3`,
    [clientAccessId, year, month]
  );
  return rows.length > 0 ? Number(rows[0].amount) : null;
}

/** Current + previous month in one round trip — the admin form's "copiar mês anterior" button needs the previous value without a second request. */
export async function getClientBudgetWithPrevious(
  clientAccessId: string,
  year: number,
  month: number
): Promise<{ current: number | null; previous: number | null }> {
  const prevMonth = month === 1 ? 12 : month - 1;
  const prevYear = month === 1 ? year - 1 : year;
  const db = await getDb();
  const { rows } = await db.query<{ year: number; month: number; amount: string }>(
    `SELECT year, month, amount FROM client_budgets WHERE client_access_id = $1 AND ((year = $2 AND month = $3) OR (year = $4 AND month = $5))`,
    [clientAccessId, year, month, prevYear, prevMonth]
  );
  const current = rows.find((r) => r.year === year && r.month === month);
  const previous = rows.find((r) => r.year === prevYear && r.month === prevMonth);
  return { current: current ? Number(current.amount) : null, previous: previous ? Number(previous.amount) : null };
}

export async function upsertClientBudget(clientAccessId: string, year: number, month: number, amount: number): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO client_budgets (client_access_id, year, month, amount, updated_at)
     VALUES ($1, $2, $3, $4, now())
     ON CONFLICT (client_access_id, year, month) DO UPDATE SET amount = EXCLUDED.amount, updated_at = now()`,
    [clientAccessId, year, month, amount]
  );
}

/** Budgets for several clients at once (the live dashboard card's multi-client sum) — only returns entries that exist; a client with none simply has no key. */
export async function getClientBudgetsForClients(clientAccessIds: string[], year: number, month: number): Promise<Map<string, number>> {
  if (clientAccessIds.length === 0) return new Map();
  const db = await getDb();
  const { rows } = await db.query<{ client_access_id: string; amount: string }>(
    `SELECT client_access_id, amount FROM client_budgets WHERE client_access_id = ANY($1) AND year = $2 AND month = $3`,
    [clientAccessIds, year, month]
  );
  return new Map(rows.map((r) => [r.client_access_id, Number(r.amount)]));
}
