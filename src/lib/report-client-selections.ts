// Server-only. "Lembrar esta seleção para este cliente" — one remembered
// report type + indicator selection per client, shared by the whole team
// (never per-person). Only ever written/read for a report resolved to
// exactly one client_access row; a multi-client/consolidated export has no
// single id to key this on (see resolveReportClients in client-access.ts).

import { getDb } from "./db";
import { sanitizeIndicatorIds, type ReportIndicatorId, type ReportType } from "./report-indicators";

export type ReportClientSelection = {
  reportType: ReportType;
  indicators: ReportIndicatorId[];
  updatedAt: string;
  updatedByLabel: string;
};

function sanitizeReportType(value: unknown): ReportType {
  return value === "simplificado" ? "simplificado" : "tecnico";
}

export async function getReportClientSelection(clientAccessId: string): Promise<ReportClientSelection | null> {
  const db = await getDb();
  const { rows } = await db.query<{ report_type: string; indicators: unknown; updated_at: string; updated_by_label: string }>(
    `SELECT report_type, indicators, updated_at, updated_by_label FROM report_client_selections WHERE client_access_id = $1`,
    [clientAccessId]
  );
  const row = rows[0];
  if (!row) return null;
  return {
    reportType: sanitizeReportType(row.report_type),
    indicators: sanitizeIndicatorIds(row.indicators),
    updatedAt: row.updated_at,
    updatedByLabel: row.updated_by_label,
  };
}

export async function saveReportClientSelection(
  clientAccessId: string,
  reportType: ReportType,
  indicators: ReportIndicatorId[],
  updatedByLabel: string
): Promise<void> {
  const db = await getDb();
  await db.query(
    `INSERT INTO report_client_selections (client_access_id, report_type, indicators, updated_at, updated_by_label)
     VALUES ($1, $2, $3, now(), $4)
     ON CONFLICT (client_access_id) DO UPDATE SET report_type = $2, indicators = $3, updated_at = now(), updated_by_label = $4`,
    [clientAccessId, reportType, JSON.stringify(sanitizeIndicatorIds(indicators)), updatedByLabel]
  );
}
