// Types and constants shared between the server-only Meta API client
// (src/lib/meta-ads.ts) and client components — nothing here touches
// process.env or performs a fetch, so it's safe to import from either side.

export const DATE_PRESETS = [
  { value: "today", label: "Hoje" },
  { value: "yesterday", label: "Ontem" },
  { value: "last_7d", label: "Últimos 7 dias" },
  { value: "last_14d", label: "Últimos 14 dias" },
  { value: "last_30d", label: "Últimos 30 dias" },
  { value: "last_90d", label: "Últimos 90 dias" },
  { value: "this_month", label: "Este mês" },
  { value: "last_month", label: "Mês passado" },
] as const;

export type DatePreset = (typeof DATE_PRESETS)[number]["value"];

export function isValidDatePreset(value: string): value is DatePreset {
  return DATE_PRESETS.some((p) => p.value === value);
}

// Custom range is capped so a single daily-breakdown insights call (one row
// per day, one page, no pagination handled) never needs more than one page.
export const MAX_CUSTOM_RANGE_DAYS = 366;

export type DateRange = { since: string; until: string }; // "YYYY-MM-DD"

/** What period the dashboard is showing: one of the fixed presets, or a manually picked range. */
export type Period = { kind: "preset"; preset: DatePreset } | { kind: "custom"; range: DateRange };

const ISO_DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export function isValidIsoDate(value: string): boolean {
  if (!ISO_DATE_RE.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

export function isValidDateRange(range: DateRange): boolean {
  if (!isValidIsoDate(range.since) || !isValidIsoDate(range.until)) return false;
  const since = new Date(`${range.since}T00:00:00Z`).getTime();
  const until = new Date(`${range.until}T00:00:00Z`).getTime();
  if (since > until) return false;
  const spanDays = (until - since) / (24 * 60 * 60 * 1000) + 1;
  return spanDays <= MAX_CUSTOM_RANGE_DAYS;
}

export type MetaAdAccount = {
  id: string; // "act_123..."
  name: string;
};

export type CampaignInsight = {
  campaignId: string;
  campaignName: string;
  accountId: string;
  accountName: string;
  spend: number;
  impressions: number;
  clicks: number;
  ctr: number;
  cpc: number;
  reach: number;
};

// Tagged per account (not pre-summed) so the client can re-aggregate
// whichever subset of accounts the client filter has selected.
export type DailySpend = { accountId: string; date: string; spend: number };

export type DashboardData = {
  period: Period;
  accounts: MetaAdAccount[];
  campaigns: CampaignInsight[];
  dailySpend: DailySpend[];
  generatedAt: string;
};
