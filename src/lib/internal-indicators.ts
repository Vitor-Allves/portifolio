// Server-only. The global "uso interno" flag list — which report indicator
// ids are internal-use (never auto-checked, and only a user with
// canIncludeInternalIndicators can check them at all). Presence of a row in
// report_internal_indicators IS the flag; there is no per-row boolean.
// Editable only by an administrador_geral (enforced by the calling route,
// same pattern as every other admin-only write in this codebase).

import { getDb } from "./db";
import { sanitizeIndicatorIds, type ReportIndicatorId } from "./report-indicators";

export async function listInternalIndicatorIds(): Promise<ReportIndicatorId[]> {
  const db = await getDb();
  const { rows } = await db.query<{ indicator_id: string }>(`SELECT indicator_id FROM report_internal_indicators`);
  return sanitizeIndicatorIds(rows.map((r) => r.indicator_id));
}

/** Full replace — the admin screen always submits the complete, current set of flagged ids, never a delta. */
export async function setInternalIndicatorIds(ids: ReportIndicatorId[]): Promise<void> {
  const db = await getDb();
  const clean = sanitizeIndicatorIds(ids);
  await db.query(`DELETE FROM report_internal_indicators`);
  if (clean.length === 0) return;
  const values = clean.map((_, i) => `($${i + 1})`).join(", ");
  await db.query(`INSERT INTO report_internal_indicators (indicator_id) VALUES ${values}`, clean);
}
