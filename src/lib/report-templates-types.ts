// Plain types + sanitizer for report-templates.ts (server-only, touches
// Postgres) — split out so client components (ReportsPanel, the admin
// panel) can import the shape and validate/normalize a JSONB read without
// pulling in the server-only module itself.

import { isValidDatePreset, isValidDateRange, type Period } from "./meta-ads-types";

/** What a saved report template applies. `null` on any id list means "no restriction" — resolved against whatever's available at generation time, never a frozen snapshot of today's ids. */
export type ReportFilters = {
  period: Period;
  compare: boolean;
  accountIds: string[] | null;
  campaignIds: string[] | null;
  adSetIds: string[] | null;
  objectiveIds: string[] | null;
  statusIds: string[] | null;
};

export type ReportTemplateSummary = {
  id: string;
  name: string;
  filters: ReportFilters;
  createdAt: string;
};

function sanitizePeriod(input: unknown): Period | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  if (obj.kind === "preset" && typeof obj.preset === "string" && isValidDatePreset(obj.preset)) {
    return { kind: "preset", preset: obj.preset };
  }
  if (obj.kind === "custom" && obj.range && typeof obj.range === "object") {
    const range = obj.range as Record<string, unknown>;
    if (
      typeof range.since === "string" &&
      typeof range.until === "string" &&
      isValidDateRange({ since: range.since, until: range.until })
    ) {
      return { kind: "custom", range: { since: range.since, until: range.until } };
    }
  }
  return null;
}

function sanitizeIdList(input: unknown): string[] | null {
  if (input === null) return null;
  if (!Array.isArray(input)) return null;
  return input.filter((v): v is string => typeof v === "string");
}

/** Normalizes arbitrary input (a JSONB column read, or a request body) into a well-formed ReportFilters, or null if the shape is unusable — never throws, so a malformed row can't take down the whole templates list. */
export function sanitizeReportFilters(input: unknown): ReportFilters | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const period = sanitizePeriod(obj.period);
  if (!period) return null;
  return {
    period,
    compare: obj.compare === true,
    accountIds: sanitizeIdList(obj.accountIds),
    campaignIds: sanitizeIdList(obj.campaignIds),
    adSetIds: sanitizeIdList(obj.adSetIds),
    objectiveIds: sanitizeIdList(obj.objectiveIds),
    statusIds: sanitizeIdList(obj.statusIds),
  };
}
