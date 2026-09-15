// Pure, shared math for consolidated metrics. No fetching, no React — safe
// to import from server or client code, and to unit-reason about in
// isolation from how any one screen renders it.
//
// The one rule every function here exists to enforce: consolidated CTR/CPC/
// CPM are computed from summed totals, never by averaging each campaign's
// own rate — averaging rates weights every campaign equally regardless of
// spend or volume, which silently misrepresents the account.

import type { CampaignInsight, DailyMetrics } from "./meta-ads-types";

export type Totals = {
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  reach: number;
};

export function sumTotals(campaigns: CampaignInsight[]): Totals {
  return campaigns.reduce(
    (acc, c) => ({
      spend: acc.spend + c.spend,
      impressions: acc.impressions + c.impressions,
      clicks: acc.clicks + c.clicks,
      linkClicks: acc.linkClicks + c.linkClicks,
      reach: acc.reach + c.reach,
    }),
    { spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0 }
  );
}

/** CTR = cliques ÷ impressões × 100. null only when impressions is 0 (the ratio has no denominator, not "0%"). */
export function ctr(totals: Pick<Totals, "clicks" | "impressions">): number | null {
  if (totals.impressions <= 0) return null;
  return (totals.clicks / totals.impressions) * 100;
}

/** CPC = investimento ÷ cliques. null only when clicks is 0. */
export function cpc(totals: Pick<Totals, "spend" | "clicks">): number | null {
  if (totals.clicks <= 0) return null;
  return totals.spend / totals.clicks;
}

/** CPM = investimento ÷ impressões × 1000. null only when impressions is 0. */
export function cpm(totals: Pick<Totals, "spend" | "impressions">): number | null {
  if (totals.impressions <= 0) return null;
  return (totals.spend / totals.impressions) * 1000;
}

/** Custo por conversa iniciada = investimento ÷ conversas iniciadas (linkClicks). null only when there are none. */
export function costPerConversation(totals: Pick<Totals, "spend" | "linkClicks">): number | null {
  if (totals.linkClicks <= 0) return null;
  return totals.spend / totals.linkClicks;
}

/** % change of current vs. previous. null when there's no previous value to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export type DailyPoint = { date: string; spend: number; impressions: number; clicks: number; linkClicks: number; reach: number };

/**
 * Collapses per-account daily rows into one point per date, scoped to the
 * given account set. Shared by the dashboard's own trend chart and the PDF
 * report generator so both ever plot the exact same numbers for the same
 * filters. `reach` here inherits DailyMetrics' own caveat: safe as a
 * same-day snapshot in a trend line, never safe to sum across dates.
 */
export function aggregateDailyByDate(daily: DailyMetrics[], accountIds: Set<string>): DailyPoint[] {
  const byDate = new Map<string, DailyPoint>();
  for (const row of daily) {
    if (!accountIds.has(row.accountId)) continue;
    const entry = byDate.get(row.date) ?? { date: row.date, spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0 };
    entry.spend += row.spend;
    entry.impressions += row.impressions;
    entry.clicks += row.clicks;
    entry.linkClicks += row.linkClicks;
    entry.reach += row.reach;
    byDate.set(row.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
