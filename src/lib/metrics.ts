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
  // null only when nothing in this scope ever reports it (no messaging-
  // capable campaign in the set) — never confused with a real zero. See
  // CampaignInsight.conversations for why the API itself can't tell those
  // two cases apart at the row level; sumConversations below is what turns
  // that per-row ambiguity into a scope-level answer.
  conversations: number | null;
  reach: number;
  // See CampaignInsight.purchases/purchaseValue/leads/addToCart/completeRegistrations
  // — same "null contributes nothing, not zero" scope-level rule as `conversations`.
  purchases: number | null;
  purchaseValue: number | null;
  leads: number | null;
  addToCart: number | null;
  completeRegistrations: number | null;
};

/** null only when every row in scope is itself null (the metric never applies to anything selected) — otherwise sums whatever rows do report it, treating a null row as "contributes nothing" rather than "poisons the whole total". */
function sumNullable<T extends string>(rows: Record<T, number | null>[], key: T): number | null {
  let total: number | null = null;
  for (const row of rows) {
    if (row[key] !== null) total = (total ?? 0) + row[key];
  }
  return total;
}

export function sumTotals(campaigns: CampaignInsight[]): Totals {
  return {
    spend: campaigns.reduce((sum, c) => sum + c.spend, 0),
    impressions: campaigns.reduce((sum, c) => sum + c.impressions, 0),
    clicks: campaigns.reduce((sum, c) => sum + c.clicks, 0),
    linkClicks: campaigns.reduce((sum, c) => sum + c.linkClicks, 0),
    conversations: sumNullable(campaigns, "conversations"),
    reach: campaigns.reduce((sum, c) => sum + c.reach, 0),
    purchases: sumNullable(campaigns, "purchases"),
    purchaseValue: sumNullable(campaigns, "purchaseValue"),
    leads: sumNullable(campaigns, "leads"),
    addToCart: sumNullable(campaigns, "addToCart"),
    completeRegistrations: sumNullable(campaigns, "completeRegistrations"),
  };
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

/**
 * Custo por conversa = investimento ÷ conversas efetivamente iniciadas
 * (Meta's onsite_conversion.messaging_conversation_started_7d — never
 * inline_link_clicks, which is a link-click count, not a conversation).
 * null both when the metric doesn't apply to anything in scope
 * (conversations === null) and when it applies but the count is 0 — the
 * two need different on-screen wording, so callers needing to tell them
 * apart should check `conversations` directly rather than only this result.
 */
export function costPerConversation(totals: Pick<Totals, "spend" | "conversations">): number | null {
  if (totals.conversations === null || totals.conversations <= 0) return null;
  return totals.spend / totals.conversations;
}

/**
 * ROAS = valor de compra ÷ investimento (retorno por real gasto). null when
 * purchaseValue never applies to anything in scope (no Pixel/CAPI purchase
 * data at all — see CampaignInsight.purchaseValue) or when spend is 0. A
 * `purchaseValue` of exactly 0 with real spend correctly yields a ROAS of 0,
 * not null — that's a genuine "no revenue attributed yet", not "não
 * disponível".
 */
export function roas(totals: Pick<Totals, "spend" | "purchaseValue">): number | null {
  if (totals.purchaseValue === null || totals.spend <= 0) return null;
  return totals.purchaseValue / totals.spend;
}

/** % change of current vs. previous. null when there's no previous value to compare against. */
export function pctChange(current: number, previous: number): number | null {
  if (previous === 0) return current === 0 ? 0 : null;
  return ((current - previous) / previous) * 100;
}

export type DailyPoint = {
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversations: number | null;
  reach: number;
};

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
    const entry = byDate.get(row.date) ?? {
      date: row.date,
      spend: 0,
      impressions: 0,
      clicks: 0,
      linkClicks: 0,
      conversations: null,
      reach: 0,
    };
    entry.spend += row.spend;
    entry.impressions += row.impressions;
    entry.clicks += row.clicks;
    entry.linkClicks += row.linkClicks;
    if (row.conversations !== null) entry.conversations = (entry.conversations ?? 0) + row.conversations;
    entry.reach += row.reach;
    byDate.set(row.date, entry);
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
}
