// Server-only. Admin-authored named filter presets for the Relatórios tab,
// stored in Postgres (see src/lib/db.ts). Unlike client_access/internal_users
// these aren't login credentials, so there's no hashing and deleting one is
// a real delete rather than a soft revoke.

import { randomUUID } from "crypto";
import { getDb } from "./db";
import { sanitizeReportFilters, type ReportFilters, type ReportTemplateSummary } from "./report-templates-types";

export type { ReportTemplateSummary };

export async function listReportTemplates(): Promise<ReportTemplateSummary[]> {
  const db = await getDb();
  const { rows } = await db.query<{ id: string; name: string; filters: unknown; created_at: string }>(
    `SELECT id, name, filters, created_at FROM report_templates ORDER BY created_at DESC`
  );
  const templates: ReportTemplateSummary[] = [];
  for (const r of rows) {
    const filters = sanitizeReportFilters(r.filters);
    // A row whose filters JSON no longer parses into anything usable (should
    // never happen — filters are only ever written by createReportTemplate
    // below) is skipped rather than surfaced as a broken template.
    if (!filters) continue;
    templates.push({ id: r.id, name: r.name, filters, createdAt: r.created_at });
  }
  return templates;
}

export async function createReportTemplate(name: string, filters: ReportFilters): Promise<{ id: string }> {
  const cleanName = name.trim();
  if (!cleanName) throw new Error("Name is required");

  const db = await getDb();
  const id = randomUUID();
  await db.query(`INSERT INTO report_templates (id, name, filters) VALUES ($1, $2, $3)`, [
    id,
    cleanName,
    JSON.stringify(filters),
  ]);
  return { id };
}

export async function deleteReportTemplate(id: string): Promise<void> {
  const db = await getDb();
  await db.query(`DELETE FROM report_templates WHERE id = $1`, [id]);
}
