// Server-only. Admin-authored named filter presets for the Relatórios tab,
// stored in Postgres (see src/lib/db.ts). Unlike client_access/internal_users
// these aren't login credentials, so there's no hashing and deleting one is
// a real delete rather than a soft revoke.

import { randomUUID } from "crypto";
import { getDb } from "./db";
import {
  sanitizeReportFilters,
  sanitizeReportType,
  sanitizeTemplateIndicators,
  type ReportFilters,
  type ReportTemplateSummary,
} from "./report-templates-types";
import type { ReportIndicatorId, ReportType } from "./report-indicators";

export type { ReportTemplateSummary };

export async function listReportTemplates(): Promise<ReportTemplateSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string; filters: unknown; report_type: string; indicators: unknown; created_at: string }>(
    `SELECT id, name, filters, report_type, indicators, created_at FROM report_templates ORDER BY created_at DESC`
  );
  const templates: ReportTemplateSummary[] = [];
  for (const r of rows) {
    const filters = sanitizeReportFilters(r.filters);
    // A row whose filters JSON no longer parses into anything usable (should
    // never happen — filters are only ever written by createReportTemplate
    // below) is skipped rather than surfaced as a broken template.
    if (!filters) continue;
    templates.push({
      id: r.id,
      name: r.name,
      filters,
      reportType: sanitizeReportType(r.report_type),
      indicators: sanitizeTemplateIndicators(r.indicators),
      createdAt: r.created_at,
    });
  }
  return templates;
}

export async function createReportTemplate(
  name: string,
  filters: ReportFilters,
  reportType: ReportType,
  indicators: ReportIndicatorId[] | null
): Promise<{ id: string }> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Name is required");

  const db = await getDb();
  const id = randomUUID();
  await db.query(`INSERT INTO report_templates (id, name, filters, report_type, indicators) VALUES ($1, $2, $3, $4, $5)`, [
    id,
    cleanName,
    JSON.stringify(filters),
    reportType,
    indicators === null ? null : JSON.stringify(indicators),
  ]);
  return { id };
}

export async function deleteReportTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM report_templates WHERE id = $1`, [id]);
}
