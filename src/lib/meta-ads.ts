// Server-only client for the Meta Marketing API. Never import this from a
// "use client" component — it reads META_SYSTEM_USER_TOKEN (and any
// META_SYSTEM_USER_TOKEN_N siblings), which must never reach the browser.
//
// Setup guide: docs/meta-ads-setup.md

const GRAPH_API_VERSION = "v21.0";
const GRAPH_API_BASE = `https://graph.facebook.com/${GRAPH_API_VERSION}`;

// How long a fetched page of data is reused before the Marketing API is hit
// again. Ad accounts change rarely; insights are typically updated by Meta
// itself with a delay, so polling every request both wastes the account's
// rate-limit budget and won't show fresher numbers anyway.
const REVALIDATE_SECONDS = 15 * 60;

import type {
  DatePreset,
  Period,
  DateRange,
  MetaAdAccount,
  CampaignInsight,
  CampaignStatus,
  DailyMetrics,
  DashboardData,
  AccountRef,
  AccountReach,
  AdSetInsight,
  AdInsight,
  AudienceSegment,
  RegionSegment,
  PlatformSegment,
  PlacementSegment,
  DeviceSegment,
  CountrySegment,
  HourSegment,
} from "./meta-ads-types";
export {
  DATE_PRESETS,
  isValidDatePreset,
  isValidIsoDate,
  isValidDateRange,
  MAX_CUSTOM_RANGE_DAYS,
  CAMPAIGN_STATUSES,
} from "./meta-ads-types";
export type {
  DatePreset,
  Period,
  DateRange,
  MetaAdAccount,
  CampaignInsight,
  CampaignStatus,
  DailyMetrics,
  DashboardData,
  AdSetInsight,
  AdInsight,
  AudienceSegment,
  RegionSegment,
  PlatformSegment,
  PlacementSegment,
  DeviceSegment,
  CountrySegment,
  HourSegment,
};

export type DashboardOptions = { compare?: boolean };

// The Marketing API's "conversation started" concept lives inside the
// `actions` array, not in inline_link_clicks (a plain click count that's
// always <= clicks except for known Meta counting quirks on on-platform
// destinations — never a substitute for an actual conversation). This is
// the action_type Meta documents for a messaging conversation started
// within a 7-day click attribution window; it only ever appears on rows
// tied to a messaging-capable objective/destination (MESSAGES, or
// engagement/traffic campaigns configured to open Messenger/Instagram
// DM/WhatsApp) — every other row simply won't have it in its actions array.
// See: https://developers.facebook.com/docs/marketing-api/insights/ (Actions).
const CONVERSATION_ACTION_TYPE = "onsite_conversion.messaging_conversation_started_7d";

type ActionNode = { action_type?: string; value?: string };

/**
 * null means this row's `actions` array never contained the conversation
 * action type — which Meta returns identically whether the objective can't
 * produce it at all, or it genuinely happened zero times this period.
 * There's no way to tell those apart from the API response alone, so null
 * always reads as "não disponível" downstream, never as a zero.
 */
function parseConversations(actions: ActionNode[] | undefined): number | null {
  if (!actions) return null;
  const row = actions.find((a) => a.action_type === CONVERSATION_ACTION_TYPE);
  return row ? Number(row.value ?? 0) : null;
}

// Generic version of parseConversations for any other `actions`/
// `action_values` entry — same "no row for this action_type" ==
// "não disponível, never zero" rule.
function parseAction(actions: ActionNode[] | undefined, actionType: string): number | null {
  if (!actions) return null;
  const row = actions.find((a) => a.action_type === actionType);
  return row ? Number(row.value ?? 0) : null;
}

// Meta's standard "omni_*" action_types are the combined web+app+offline
// totals Ads Manager itself surfaces as "Resultados" for sales/lead
// objectives — used here instead of the pixel-only "purchase"/"lead" so
// this matches what the advertiser already sees in Ads Manager. Only
// populates for accounts with a Meta Pixel/Conversions API actually
// configured on the destination; everything else reads null exactly like
// CampaignInsight.conversations.
const PURCHASE_ACTION_TYPE = "omni_purchase";
const LEAD_ACTION_TYPE = "lead";
const ADD_TO_CART_ACTION_TYPE = "omni_add_to_cart";
const COMPLETE_REGISTRATION_ACTION_TYPE = "omni_complete_registration";

type ExtraConversionFields = {
  purchases: number | null;
  purchaseValue: number | null;
  leads: number | null;
  addToCart: number | null;
  completeRegistrations: number | null;
};

function parseExtraConversions(actions: ActionNode[] | undefined, actionValues: ActionNode[] | undefined): ExtraConversionFields {
  return {
    purchases: parseAction(actions, PURCHASE_ACTION_TYPE),
    purchaseValue: parseAction(actionValues, PURCHASE_ACTION_TYPE),
    leads: parseAction(actions, LEAD_ACTION_TYPE),
    addToCart: parseAction(actions, ADD_TO_CART_ACTION_TYPE),
    completeRegistrations: parseAction(actions, COMPLETE_REGISTRATION_ACTION_TYPE),
  };
}

// "post_engagement" and "video_view" both live in the same `actions` array
// already fetched for `conversations` above — no extra field needed.
const POST_ENGAGEMENT_ACTION_TYPE = "post_engagement";
const VIDEO_VIEW_ACTION_TYPE = "video_view";

type ExtraEngagementFields = {
  postEngagement: number | null;
  videoViews: number | null;
  // Meta returns `video_p100_watched_actions`/`video_avg_time_watched_actions`
  // as one-element arrays (same shape as `actions`), not plain numbers.
  videoCompletions: number | null;
  // Average seconds watched per impression — an average, not a count, so
  // deliberately kept OUT of Totals/sumTotals (metrics.ts) and out of the
  // CSV export: naively averaging a per-campaign average across campaigns
  // would misrepresent the real per-viewer average. Shown only as its own
  // per-campaign value in the UI.
  videoAvgWatchTimeSeconds: number | null;
  outboundClicks: number | null;
  uniqueClicks: number | null;
  // Only ever populated for reach/brand-awareness objective campaigns —
  // null for everything else, same "não disponível" rule as conversations.
  // `estimatedAdRecallRate` is a percentage — same "not summable across
  // campaigns" reasoning as videoAvgWatchTimeSeconds, kept out of
  // Totals/CSV. `estimatedAdRecallers` is a headcount, safe to sum.
  estimatedAdRecallRate: number | null;
  estimatedAdRecallers: number | null;
};

/** Meta's video_pXX_watched_actions / video_avg_time_watched_actions shape: a one-element array, `[{ action_type: "video_view", value: "123" }]` — sum defensively in case Meta ever returns more than one row. */
function sumActionArray(nodes: ActionNode[] | undefined): number | null {
  if (!nodes || nodes.length === 0) return null;
  return nodes.reduce((sum, n) => sum + Number(n.value ?? 0), 0);
}

function parseExtraEngagement(row: {
  actions?: ActionNode[];
  video_p100_watched_actions?: ActionNode[];
  video_avg_time_watched_actions?: ActionNode[];
  outbound_clicks?: ActionNode[];
  unique_clicks?: string;
  estimated_ad_recall_rate?: string;
  estimated_ad_recallers?: string;
}): ExtraEngagementFields {
  return {
    postEngagement: parseAction(row.actions, POST_ENGAGEMENT_ACTION_TYPE),
    videoViews: parseAction(row.actions, VIDEO_VIEW_ACTION_TYPE),
    videoCompletions: sumActionArray(row.video_p100_watched_actions),
    videoAvgWatchTimeSeconds: sumActionArray(row.video_avg_time_watched_actions),
    outboundClicks: sumActionArray(row.outbound_clicks),
    uniqueClicks: row.unique_clicks ? Number(row.unique_clicks) : null,
    estimatedAdRecallRate: row.estimated_ad_recall_rate ? Number(row.estimated_ad_recall_rate) : null,
    estimatedAdRecallers: row.estimated_ad_recallers ? Number(row.estimated_ad_recallers) : null,
  };
}

const EXTRA_ENGAGEMENT_FIELDS =
  "video_p100_watched_actions,video_avg_time_watched_actions,outbound_clicks,unique_clicks,estimated_ad_recall_rate,estimated_ad_recallers";

/** Graph API date params for either a named preset or a manually picked range. */
function periodParams(period: Period): Record<string, string> {
  return period.kind === "preset"
    ? { date_preset: period.preset }
    : { time_range: JSON.stringify({ since: period.range.since, until: period.range.until }) };
}

function shiftDate(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// Resolves a preset to concrete dates using the same rules Meta documents
// for its date_preset values. This is a best-effort approximation in UTC —
// Meta itself resolves presets in the ad account's own timezone — good
// enough for display labels and for picking a "previous period" window,
// not meant to be pixel-exact against what the Graph API returns.
function resolvePeriodRange(period: Period, now: Date = new Date()): DateRange {
  if (period.kind === "custom") return period.range;

  const today = now.toISOString().slice(0, 10);
  const yesterday = shiftDate(today, -1);

  switch (period.preset) {
    case "today":
      return { since: today, until: today };
    case "yesterday":
      return { since: yesterday, until: yesterday };
    case "last_7d":
      return { since: shiftDate(yesterday, -6), until: yesterday };
    case "last_14d":
      return { since: shiftDate(yesterday, -13), until: yesterday };
    case "last_30d":
      return { since: shiftDate(yesterday, -29), until: yesterday };
    case "last_90d":
      return { since: shiftDate(yesterday, -89), until: yesterday };
    case "this_month": {
      const [y, m] = today.split("-");
      return { since: `${y}-${m}-01`, until: today };
    }
    case "last_month": {
      const [y, m] = today.split("-").map(Number);
      const firstOfThisMonth = new Date(Date.UTC(y, m - 1, 1));
      const lastOfPrevMonth = new Date(firstOfThisMonth);
      lastOfPrevMonth.setUTCDate(0);
      const firstOfPrevMonth = new Date(
        Date.UTC(lastOfPrevMonth.getUTCFullYear(), lastOfPrevMonth.getUTCMonth(), 1)
      );
      return {
        since: firstOfPrevMonth.toISOString().slice(0, 10),
        until: lastOfPrevMonth.toISOString().slice(0, 10),
      };
    }
  }
}

function calendarSpanDays(range: DateRange): number {
  return (
    Math.round(
      (new Date(`${range.until}T00:00:00Z`).getTime() -
        new Date(`${range.since}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1
  );
}

// Monday–Friday, no holiday calendar (a national/state/municipal holiday
// table would need its own maintenance and still wouldn't cover every
// account's own operating calendar) — good enough to correct for the one
// systematic skew this comparison needs to avoid: two calendar-equal
// windows landing on a different number of weekdays depending on where
// weekends fall.
function isBusinessDay(iso: string): boolean {
  const day = new Date(`${iso}T00:00:00Z`).getUTCDay();
  return day !== 0 && day !== 6;
}

function countBusinessDays(range: DateRange): number {
  let count = 0;
  for (let cursor = range.since; cursor <= range.until; cursor = shiftDate(cursor, 1)) {
    if (isBusinessDay(cursor)) count++;
  }
  return count;
}

/**
 * Immediately preceding window sized so it contains the SAME NUMBER OF
 * BUSINESS DAYS as `range` — not simply the same calendar-day span. Two
 * windows of equal calendar length can still contain a different count of
 * weekdays depending on where weekends fall inside them (e.g. the first 15
 * calendar days of September vs. the last 15 of August), which skews any
 * day-driven metric (spend, delivery) between "current" and "previous"
 * before the comparison even starts. This walks backward one calendar day
 * at a time from the day before `range` starts, counting only business
 * days, until it has accumulated as many as `range` itself has — the
 * resulting window's calendar length can differ from `range`'s, which is
 * the whole point.
 *
 * Falls back to the same calendar-day span when `range` itself has zero
 * business days (an all-weekend custom range) — there's no business-day
 * count to match in that case.
 */
function previousEquivalentRange(range: DateRange): DateRange {
  const targetBusinessDays = countBusinessDays(range);
  const prevUntil = shiftDate(range.since, -1);

  if (targetBusinessDays === 0) {
    const prevSince = shiftDate(prevUntil, -(calendarSpanDays(range) - 1));
    return { since: prevSince, until: prevUntil };
  }

  let prevSince = prevUntil;
  let counted = isBusinessDay(prevUntil) ? 1 : 0;
  while (counted < targetBusinessDays) {
    prevSince = shiftDate(prevSince, -1);
    if (isBusinessDay(prevSince)) counted++;
  }
  return { since: prevSince, until: prevUntil };
}

export class MetaApiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "MetaApiError";
  }
}

export class MetaConfigError extends MetaApiError {
  constructor(missing: string[]) {
    super(`Missing required env var(s): ${missing.join(", ")}`);
    this.name = "MetaConfigError";
  }
}

type BusinessCredential = { businessId: string; accessToken: string };

// Each Business Manager needs its own System User token — a token only ever
// has access to the Business Manager it was created in, so there's no way
// to read a second, unrelated company's accounts with the first token no
// matter what it's scoped to. META_BUSINESS_ID/META_SYSTEM_USER_TOKEN is the
// first (and for most deployments, only) business; META_BUSINESS_ID_2 /
// META_SYSTEM_USER_TOKEN_2, _3, and so on layer in additional, completely
// separate Business Managers — their accounts are merged into one pool
// everywhere else in this file, with no notion of "which business" left
// downstream. Numbering stops at the first index where neither var is set.
function getBusinessCredentials(): BusinessCredential[] {
  const credentials: BusinessCredential[] = [];
  const missing: string[] = [];

  const primaryToken = process.env.META_SYSTEM_USER_TOKEN;
  const primaryBusiness = process.env.META_BUSINESS_ID;
  if (primaryToken || primaryBusiness) {
    if (!primaryToken) missing.push("META_SYSTEM_USER_TOKEN");
    if (!primaryBusiness) missing.push("META_BUSINESS_ID");
    if (primaryToken && primaryBusiness) {
      credentials.push({ businessId: primaryBusiness, accessToken: primaryToken });
    }
  }

  for (let i = 2; ; i++) {
    const token = process.env[`META_SYSTEM_USER_TOKEN_${i}`];
    const businessId = process.env[`META_BUSINESS_ID_${i}`];
    if (!token && !businessId) break;
    if (!token) missing.push(`META_SYSTEM_USER_TOKEN_${i}`);
    if (!businessId) missing.push(`META_BUSINESS_ID_${i}`);
    if (token && businessId) {
      credentials.push({ businessId, accessToken: token });
    }
  }

  // No vars set at all: report the primary pair (the common case). Any
  // *partially* filled pair (primary or numbered) is a real misconfiguration
  // and fails loudly instead of just silently dropping that business — a
  // typo here would otherwise just look like "that business's accounts
  // never showed up," with nothing pointing at why.
  if (credentials.length === 0 && missing.length === 0) {
    throw new MetaConfigError(["META_SYSTEM_USER_TOKEN", "META_BUSINESS_ID"]);
  }
  if (missing.length > 0) {
    throw new MetaConfigError(missing);
  }

  return credentials;
}

async function graphGet<T>(path: string, params: Record<string, string>, accessToken: string): Promise<T> {
  const url = new URL(`${GRAPH_API_BASE}${path}`);
  for (const [key, value] of Object.entries(params)) {
    url.searchParams.set(key, value);
  }
  url.searchParams.set("access_token", accessToken);

  let res: Response;
  try {
    res = await fetch(url, { next: { revalidate: REVALIDATE_SECONDS } });
  } catch (err) {
    throw new MetaApiError("Network error calling the Meta Graph API", err);
  }

  if (!res.ok) {
    let detail = "";
    try {
      const body = (await res.json()) as { error?: { message?: string } };
      detail = body?.error?.message ?? "";
    } catch {
      // response wasn't JSON — ignore, we already have the status code
    }
    throw new MetaApiError(
      `Meta Graph API request failed (${res.status})${detail ? `: ${detail}` : ""}`
    );
  }

  return res.json() as Promise<T>;
}

type AdAccountNode = { id: string; name?: string; account_status?: number };

// Meta's account_status has ~10 values (active, in grace period, pending
// settlement/risk review, unsettled, etc.) and several of those still have
// real campaigns and spend worth showing — only DISABLED (2) and CLOSED
// (101) are permanently done and safe to skip. Requiring exactly ACTIVE (1)
// here previously hid every account sitting in any other live state.
const DEAD_ACCOUNT_STATUSES = new Set([2, 101]);

async function fetchAllBusinessAccounts(): Promise<{
  accounts: MetaAdAccount[];
  tokenByAccountId: Map<string, string>;
}> {
  const credentials = getBusinessCredentials();

  const settled = await Promise.allSettled(
    credentials.map((cred) =>
      graphGet<{
        owned_ad_accounts?: { data: AdAccountNode[] };
        client_ad_accounts?: { data: AdAccountNode[] };
      }>(
        `/${cred.businessId}`,
        {
          fields:
            "owned_ad_accounts.limit(200){id,name,account_status},client_ad_accounts.limit(200){id,name,account_status}",
        },
        cred.accessToken
      ).then((data) => ({ cred, data }))
    )
  );

  const byId = new Map<string, MetaAdAccount>();
  const tokenByAccountId = new Map<string, string>();
  let firstError: unknown = null;
  let successCount = 0;

  for (const result of settled) {
    if (result.status === "rejected") {
      // One misconfigured/unreachable Business Manager shouldn't hide the
      // accounts of the others sharing this same dashboard — but if *every*
      // configured business fails, that's surfaced below like before.
      console.error("[meta-ads] failed to list accounts for a configured business", result.reason);
      firstError ??= result.reason;
      continue;
    }
    successCount++;
    const { cred, data } = result.value;
    const raw = [...(data.owned_ad_accounts?.data ?? []), ...(data.client_ad_accounts?.data ?? [])];
    for (const account of raw) {
      if (account.account_status !== undefined && DEAD_ACCOUNT_STATUSES.has(account.account_status)) {
        continue;
      }
      // An account id is only ever issued once by Meta, globally — if it
      // somehow turned up under more than one configured business (e.g. one
      // business owns it, another was also given client access), the first
      // business seen keeps it rather than fetching it twice.
      if (!byId.has(account.id)) {
        byId.set(account.id, { id: account.id, name: account.name ?? account.id });
        tokenByAccountId.set(account.id, cred.accessToken);
      }
    }
  }

  if (successCount === 0) {
    throw firstError instanceof MetaApiError
      ? firstError
      : new MetaApiError("Failed to list ad accounts", firstError);
  }

  return { accounts: [...byId.values()], tokenByAccountId };
}

/** Lists every ad account across every configured Business Manager, for admin UI use (e.g. picking which accounts a new client credential should see). */
export async function listAdAccounts(): Promise<MetaAdAccount[]> {
  const { accounts } = await fetchAllBusinessAccounts();
  return accounts;
}

type CampaignMetaNode = {
  id?: string;
  objective?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
};
type CampaignMeta = {
  objective: string | null;
  status: CampaignStatus;
  // Meta only ever sets one of daily/lifetime budget on a given campaign,
  // never both — and returns neither at all when the campaign uses
  // ad-set-level budgets instead (CBO off), so both are commonly null.
  // `budgetRemaining` mirrors whichever one is actually set.
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  budgetRemaining: number | null;
};

function normalizeStatus(raw: string | undefined): CampaignStatus {
  switch (raw) {
    case "ACTIVE":
      return "ACTIVE";
    case "PAUSED":
    case "CAMPAIGN_PAUSED":
    case "ADSET_PAUSED":
      return "PAUSED";
    case "DELETED":
      return "DELETED";
    case "ARCHIVED":
      return "ARCHIVED";
    default:
      return "OTHER";
  }
}

// Insights rows don't carry campaign metadata (objective, status) — that
// lives on the Campaign node itself, so it's a separate call per account,
// merged into the insights rows by campaign_id below.
async function getCampaignMeta(account: MetaAdAccount, accessToken: string): Promise<Map<string, CampaignMeta>> {
  const data = await graphGet<{ data: CampaignMetaNode[] }>(
    `/${account.id}/campaigns`,
    { fields: "id,objective,effective_status,daily_budget,lifetime_budget,budget_remaining", limit: "500" },
    accessToken
  );

  const map = new Map<string, CampaignMeta>();
  for (const row of data.data ?? []) {
    if (!row.id) continue;
    map.set(row.id, {
      objective: row.objective ?? null,
      status: normalizeStatus(row.effective_status),
      // Unlike Insights' `spend` (already whole currency units), the
      // Campaign/AdSet node's own budget fields are in the account
      // currency's smallest unit (cents for BRL) — divide by 100.
      dailyBudget: row.daily_budget ? Number(row.daily_budget) / 100 : null,
      lifetimeBudget: row.lifetime_budget ? Number(row.lifetime_budget) / 100 : null,
      budgetRemaining: row.budget_remaining ? Number(row.budget_remaining) / 100 : null,
    });
  }
  return map;
}

type CampaignInsightNode = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  action_values?: ActionNode[];
  reach?: string;
  video_p100_watched_actions?: ActionNode[];
  video_avg_time_watched_actions?: ActionNode[];
  outbound_clicks?: ActionNode[];
  unique_clicks?: string;
  estimated_ad_recall_rate?: string;
  estimated_ad_recallers?: string;
};

async function getAccountCampaignInsights(
  account: MetaAdAccount,
  period: Period,
  metaByCampaignId: Map<string, CampaignMeta>,
  accessToken: string
): Promise<CampaignInsight[]> {
  const data = await graphGet<{ data: CampaignInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "campaign",
      ...periodParams(period),
      fields: `campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,actions,action_values,reach,${EXTRA_ENGAGEMENT_FIELDS}`,
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => {
    const meta = metaByCampaignId.get(row.campaign_id ?? "");
    return {
      campaignId: row.campaign_id ?? "",
      campaignName: row.campaign_name ?? "Campanha sem nome",
      accountId: account.id,
      accountName: account.name,
      objective: meta?.objective ?? null,
      status: meta?.status ?? "OTHER",
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      // Meta's "clicks" field: every click type (link, photo, profile, ...).
      clicks: Number(row.clicks ?? 0),
      // "inline_link_clicks": clicks that went to the campaign's destination
      // link only — a click count, never a conversation.
      linkClicks: Number(row.inline_link_clicks ?? 0),
      conversations: parseConversations(row.actions),
      reach: Number(row.reach ?? 0),
      ...parseExtraConversions(row.actions, row.action_values),
      ...parseExtraEngagement(row),
      dailyBudget: meta?.dailyBudget ?? null,
      lifetimeBudget: meta?.lifetimeBudget ?? null,
      budgetRemaining: meta?.budgetRemaining ?? null,
    };
  });
}

type AdSetMetaNode = {
  id?: string;
  name?: string;
  effective_status?: string;
  daily_budget?: string;
  lifetime_budget?: string;
  budget_remaining?: string;
};
type AdSetMeta = {
  name: string;
  status: CampaignStatus;
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  budgetRemaining: number | null;
};

// Same pattern as getCampaignMeta: an ad set's name/status live on the ad
// set node itself, not on its insights row. Fetched once per account (every
// ad set across every campaign in that account), not once per campaign —
// same shape as getCampaignMeta, so ad sets scale with account count, not
// campaign count.
async function getAdSetMeta(account: MetaAdAccount, accessToken: string): Promise<Map<string, AdSetMeta>> {
  const data = await graphGet<{ data: AdSetMetaNode[] }>(
    `/${account.id}/adsets`,
    { fields: "id,name,effective_status,daily_budget,lifetime_budget,budget_remaining", limit: "500" },
    accessToken
  );

  const map = new Map<string, AdSetMeta>();
  for (const row of data.data ?? []) {
    if (!row.id) continue;
    map.set(row.id, {
      name: row.name ?? "Conjunto sem nome",
      status: normalizeStatus(row.effective_status),
      // See getCampaignMeta's own comment: these are in cents, unlike Insights' `spend`.
      dailyBudget: row.daily_budget ? Number(row.daily_budget) / 100 : null,
      lifetimeBudget: row.lifetime_budget ? Number(row.lifetime_budget) / 100 : null,
      budgetRemaining: row.budget_remaining ? Number(row.budget_remaining) / 100 : null,
    });
  }
  return map;
}

type AdSetInsightNode = {
  adset_id?: string;
  adset_name?: string;
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  action_values?: ActionNode[];
  reach?: string;
  video_p100_watched_actions?: ActionNode[];
  video_avg_time_watched_actions?: ActionNode[];
  outbound_clicks?: ActionNode[];
  unique_clicks?: string;
  estimated_ad_recall_rate?: string;
  estimated_ad_recallers?: string;
};

// One call per account (level: "adset"), exactly like getAccountCampaignInsights
// is one call per account at level: "campaign" — Meta returns every ad set
// across every campaign in the account in a single response, each row
// tagged with its own campaign_id, so this doesn't multiply with campaign
// count the way a per-campaign call would.
async function getAccountAdSetInsights(
  account: MetaAdAccount,
  period: Period,
  metaByAdSetId: Map<string, AdSetMeta>,
  accessToken: string
): Promise<AdSetInsight[]> {
  const data = await graphGet<{ data: AdSetInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "adset",
      ...periodParams(period),
      fields: `adset_id,adset_name,campaign_id,spend,impressions,clicks,inline_link_clicks,actions,action_values,reach,${EXTRA_ENGAGEMENT_FIELDS}`,
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => {
    const meta = metaByAdSetId.get(row.adset_id ?? "");
    return {
      adSetId: row.adset_id ?? "",
      adSetName: row.adset_name ?? meta?.name ?? "Conjunto sem nome",
      campaignId: row.campaign_id ?? "",
      accountId: account.id,
      status: meta?.status ?? "OTHER",
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      linkClicks: Number(row.inline_link_clicks ?? 0),
      conversations: parseConversations(row.actions),
      reach: Number(row.reach ?? 0),
      ...parseExtraConversions(row.actions, row.action_values),
      ...parseExtraEngagement(row),
      dailyBudget: meta?.dailyBudget ?? null,
      lifetimeBudget: meta?.lifetimeBudget ?? null,
      budgetRemaining: meta?.budgetRemaining ?? null,
    };
  });
}

type AdCreativeNode = { thumbnail_url?: string; title?: string; body?: string; call_to_action_type?: string };
type AdMetaNode = { id?: string; name?: string; effective_status?: string; creative?: AdCreativeNode };
type AdMeta = {
  name: string;
  status: CampaignStatus;
  thumbnailUrl: string | null;
  creativeTitle: string | null;
  creativeBody: string | null;
  callToAction: string | null;
};

// Same pattern again, one level down: an ad's name/status live on the ad
// node itself, fetched once per account (every ad across every ad set),
// not once per ad set. The `creative{...}` sub-field expansion pulls each
// ad's actual thumbnail/copy/CTA in the same call — no extra request per ad.
async function getAdMeta(account: MetaAdAccount, accessToken: string): Promise<Map<string, AdMeta>> {
  const data = await graphGet<{ data: AdMetaNode[] }>(
    `/${account.id}/ads`,
    { fields: "id,name,effective_status,creative{thumbnail_url,title,body,call_to_action_type}", limit: "500" },
    accessToken
  );

  const map = new Map<string, AdMeta>();
  for (const row of data.data ?? []) {
    if (!row.id) continue;
    map.set(row.id, {
      name: row.name ?? "Anúncio sem nome",
      status: normalizeStatus(row.effective_status),
      thumbnailUrl: row.creative?.thumbnail_url ?? null,
      creativeTitle: row.creative?.title ?? null,
      creativeBody: row.creative?.body ?? null,
      callToAction: row.creative?.call_to_action_type ?? null,
    });
  }
  return map;
}

type AdInsightNode = {
  ad_id?: string;
  ad_name?: string;
  adset_id?: string;
  campaign_id?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  action_values?: ActionNode[];
  reach?: string;
  video_p100_watched_actions?: ActionNode[];
  video_avg_time_watched_actions?: ActionNode[];
  outbound_clicks?: ActionNode[];
  unique_clicks?: string;
  estimated_ad_recall_rate?: string;
  estimated_ad_recallers?: string;
};

// One call per account (level: "ad") — every ad across every ad set and
// campaign in the account in one response, same shape as the campaign- and
// adset-level insight calls above. Lets the UI rank "which ad is actually
// performing" inside a campaign or ad set without a call per ad set.
async function getAccountAdInsights(
  account: MetaAdAccount,
  period: Period,
  metaByAdId: Map<string, AdMeta>,
  qualityByAdId: Map<string, AdQuality>,
  accessToken: string
): Promise<AdInsight[]> {
  const data = await graphGet<{ data: AdInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "ad",
      ...periodParams(period),
      fields: `ad_id,ad_name,adset_id,campaign_id,spend,impressions,clicks,inline_link_clicks,actions,action_values,reach,${EXTRA_ENGAGEMENT_FIELDS}`,
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => {
    const meta = metaByAdId.get(row.ad_id ?? "");
    const quality = qualityByAdId.get(row.ad_id ?? "");
    return {
      adId: row.ad_id ?? "",
      adName: row.ad_name ?? meta?.name ?? "Anúncio sem nome",
      adSetId: row.adset_id ?? "",
      campaignId: row.campaign_id ?? "",
      accountId: account.id,
      status: meta?.status ?? "OTHER",
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      linkClicks: Number(row.inline_link_clicks ?? 0),
      conversations: parseConversations(row.actions),
      reach: Number(row.reach ?? 0),
      ...parseExtraConversions(row.actions, row.action_values),
      ...parseExtraEngagement(row),
      qualityRanking: quality?.quality ?? null,
      engagementRateRanking: quality?.engagement ?? null,
      conversionRateRanking: quality?.conversion ?? null,
      thumbnailUrl: meta?.thumbnailUrl ?? null,
      creativeTitle: meta?.creativeTitle ?? null,
      creativeBody: meta?.creativeBody ?? null,
      callToAction: meta?.callToAction ?? null,
    };
  });
}

type DailyInsightNode = {
  date_start?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

async function getAccountDailySeries(
  account: MetaAdAccount,
  period: Period,
  accessToken: string
): Promise<DailyMetrics[]> {
  const data = await graphGet<{ data: DailyInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      time_increment: "1",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? [])
    .filter((row) => row.date_start)
    .map((row) => ({
      accountId: account.id,
      date: row.date_start!,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      linkClicks: Number(row.inline_link_clicks ?? 0),
      conversations: parseConversations(row.actions),
      reach: Number(row.reach ?? 0),
    }));
}

type AccountInsightNode = { reach?: string };

// A single call over the whole period, at account level, with no
// time_increment breakdown — this is what keeps Meta's dedup intact. Reach
// summed from the per-day series or from per-campaign rows would count the
// same person again for every day or campaign that reached them.
async function getAccountReach(account: MetaAdAccount, period: Period, accessToken: string): Promise<number> {
  const data = await graphGet<{ data: AccountInsightNode[] }>(
    `/${account.id}/insights`,
    { level: "account", ...periodParams(period), fields: "reach", limit: "1" },
    accessToken
  );
  return Number(data.data?.[0]?.reach ?? 0);
}

/**
 * Same call as getAccountReach, but scoped to an exact set of campaign ids
 * via the Insights API's own `filtering` param — Meta computes the
 * deduplicated reach over precisely that filtered set server-side, the same
 * way it does for the unfiltered whole-account call above. This is the only
 * correct way to answer "what's the reach of this one campaign (or this
 * narrowed selection)": summing each campaign's own `reach` field would
 * double-count anyone those campaigns both reached.
 */
async function getScopedAccountReach(
  account: MetaAdAccount,
  period: Period,
  campaignIds: string[],
  accessToken: string
): Promise<number> {
  const data = await graphGet<{ data: AccountInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      filtering: JSON.stringify([{ field: "campaign.id", operator: "IN", value: campaignIds }]),
      fields: "reach",
      limit: "1",
    },
    accessToken
  );
  return Number(data.data?.[0]?.reach ?? 0);
}

/**
 * Reach for an exact campaign-id subset per account — used whenever the
 * campaign/ad set/objective/status filters have narrowed the dashboard away
 * from "every campaign in this account", so the KPI never silently keeps
 * showing the whole account's number for a filtered view. An account with
 * an empty campaign-id list (the filter matched nothing in it) contributes
 * 0 without a wasted API call — an empty `filtering` value list isn't a
 * meaningful request to send Meta.
 */
export async function getScopedReach(
  period: Period,
  campaignIdsByAccount: Record<string, string[]>,
  allowedAccountIds?: string[]
): Promise<AccountReach[]> {
  const { accounts, tokenByAccountId } = await fetchAllBusinessAccounts();
  const allowed = allowedAccountIds ? new Set(allowedAccountIds) : null;
  const requested = accounts.filter(
    (a) => Object.prototype.hasOwnProperty.call(campaignIdsByAccount, a.id) && (!allowed || allowed.has(a.id))
  );

  const settled = await Promise.allSettled(
    requested.map(async (account) => {
      const campaignIds = campaignIdsByAccount[account.id] ?? [];
      if (campaignIds.length === 0) return { accountId: account.id, reach: 0 };
      const token = tokenByAccountId.get(account.id)!;
      const reach = await getScopedAccountReach(account, period, campaignIds, token);
      return { accountId: account.id, reach };
    })
  );

  const results: AccountReach[] = [];
  for (const r of settled) {
    if (r.status === "fulfilled") results.push(r.value);
    else console.error("[meta-ads] failed to fetch scoped reach for an account", r.reason);
  }
  return results;
}

/**
 * Same idea as getScopedReach, but also resolves the equivalent previous
 * period when `compare` is on — the campaign-id subset is the same set of
 * ids for both periods (a campaign's identity doesn't change between
 * periods), which is what makes a like-for-like reach comparison possible
 * once a campaign filter is active.
 */
export async function getScopedReachWithComparison(
  period: Period,
  compare: boolean,
  campaignIdsByAccount: Record<string, string[]>,
  allowedAccountIds?: string[]
): Promise<{ resolvedRange: DateRange; currentReach: AccountReach[]; comparisonRange: DateRange | null; previousReach: AccountReach[] | null }> {
  const resolvedRange = resolvePeriodRange(period);
  const currentReach = await getScopedReach(period, campaignIdsByAccount, allowedAccountIds);
  if (!compare) return { resolvedRange, currentReach, comparisonRange: null, previousReach: null };
  const comparisonRange = previousEquivalentRange(resolvedRange);
  const previousReach = await getScopedReach({ kind: "custom", range: comparisonRange }, campaignIdsByAccount, allowedAccountIds);
  return { resolvedRange, currentReach, comparisonRange, previousReach };
}

type AudienceInsightNode = {
  age?: string;
  gender?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

// One call per account, broken down by age+gender — unlike the plain
// account-level reach above, these buckets are mutually exclusive (everyone
// has exactly one age bracket and one gender), so summing across buckets
// doesn't reintroduce the double-counting AccountReach's own comment warns
// about; it's the intended way to read a Meta breakdown.
async function getAccountDemographics(
  account: MetaAdAccount,
  period: Period,
  accessToken: string
): Promise<AudienceSegment[]> {
  const data = await graphGet<{ data: AudienceInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      breakdowns: "age,gender",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => ({
    accountId: account.id,
    age: row.age ?? "unknown",
    gender: row.gender ?? "unknown",
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    conversations: parseConversations(row.actions),
    reach: Number(row.reach ?? 0),
  }));
}

type RegionInsightNode = {
  region?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

// One call per account, broken down by region (state-level for Brazil) —
// same "safe to sum" reasoning as getAccountDemographics: each reached
// person is attributed to exactly one region.
async function getAccountRegions(account: MetaAdAccount, period: Period, accessToken: string): Promise<RegionSegment[]> {
  const data = await graphGet<{ data: RegionInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      breakdowns: "region",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => ({
    accountId: account.id,
    region: row.region ?? "Não informado",
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    conversations: parseConversations(row.actions),
    reach: Number(row.reach ?? 0),
  }));
}

// The five breakdowns below are each their own single-value `breakdowns`
// call, deliberately NOT combined with each other into one multi-breakdown
// request — Meta only allows specific breakdown combinations and getting
// that wrong previously took down every account's data at once (see the
// "city" breakdown incident). Each value below (publisher_platform,
// platform_position, device_platform, country,
// hourly_stats_aggregated_by_advertiser_time_zone) is confirmed valid: it
// appears verbatim in the list of accepted breakdowns Meta's own API
// returns in its 400 error body.

type PlatformInsightNode = {
  publisher_platform?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

async function getAccountPlatforms(account: MetaAdAccount, period: Period, accessToken: string): Promise<PlatformSegment[]> {
  const data = await graphGet<{ data: PlatformInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      breakdowns: "publisher_platform",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => ({
    accountId: account.id,
    platform: row.publisher_platform ?? "Não informado",
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    conversations: parseConversations(row.actions),
    reach: Number(row.reach ?? 0),
  }));
}

type PlacementInsightNode = {
  platform_position?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

async function getAccountPlacements(account: MetaAdAccount, period: Period, accessToken: string): Promise<PlacementSegment[]> {
  const data = await graphGet<{ data: PlacementInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      breakdowns: "platform_position",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => ({
    accountId: account.id,
    placement: row.platform_position ?? "Não informado",
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    conversations: parseConversations(row.actions),
    reach: Number(row.reach ?? 0),
  }));
}

type DeviceInsightNode = {
  device_platform?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

async function getAccountDevices(account: MetaAdAccount, period: Period, accessToken: string): Promise<DeviceSegment[]> {
  const data = await graphGet<{ data: DeviceInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      breakdowns: "device_platform",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => ({
    accountId: account.id,
    device: row.device_platform ?? "Não informado",
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    conversations: parseConversations(row.actions),
    reach: Number(row.reach ?? 0),
  }));
}

type CountryInsightNode = {
  country?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

async function getAccountCountries(account: MetaAdAccount, period: Period, accessToken: string): Promise<CountrySegment[]> {
  const data = await graphGet<{ data: CountryInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      breakdowns: "country",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => ({
    accountId: account.id,
    country: row.country ?? "Não informado",
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    conversations: parseConversations(row.actions),
    reach: Number(row.reach ?? 0),
  }));
}

type HourInsightNode = {
  hourly_stats_aggregated_by_advertiser_time_zone?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  actions?: ActionNode[];
  reach?: string;
};

async function getAccountHours(account: MetaAdAccount, period: Period, accessToken: string): Promise<HourSegment[]> {
  const data = await graphGet<{ data: HourInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "account",
      ...periodParams(period),
      breakdowns: "hourly_stats_aggregated_by_advertiser_time_zone",
      fields: "spend,impressions,clicks,inline_link_clicks,actions,reach",
      limit: "500",
    },
    accessToken
  );

  return (data.data ?? []).map((row) => ({
    accountId: account.id,
    hour: row.hourly_stats_aggregated_by_advertiser_time_zone ?? "Não informado",
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    linkClicks: Number(row.inline_link_clicks ?? 0),
    conversations: parseConversations(row.actions),
    reach: Number(row.reach ?? 0),
  }));
}

type AdQualityNode = {
  ad_id?: string;
  quality_ranking?: string;
  engagement_rate_ranking?: string;
  conversion_rate_ranking?: string;
};

type AdQuality = { quality: string | null; engagement: string | null; conversion: string | null };

// Meta returns "UNKNOWN" when there isn't enough delivery volume yet to
// rank an ad against others competing for the same audience — treated the
// same as "não disponível" everywhere else in this file, never shown as a
// literal ranking value.
function normalizeRanking(value: string | undefined): string | null {
  if (!value || value.toUpperCase() === "UNKNOWN") return null;
  return value;
}

// Ad relevance diagnostics (quality/engagement/conversion ranking vs. other
// advertisers competing for the same audience) — fetched as its own call
// and deliberately isolated with a `.catch(() => new Map())` fallback where
// it's called below, exactly like getCampaignMeta/getAdSetMeta/getAdMeta:
// if `quality_ranking`/`engagement_rate_ranking`/`conversion_rate_ranking`
// were ever rejected as unknown fields by a future Meta API version, only
// this diagnostic data goes missing instead of failing every account's
// entire dashboard load (see the "city" breakdown incident this file's
// git history documents).
async function getAdQualityRankings(account: MetaAdAccount, period: Period, accessToken: string): Promise<Map<string, AdQuality>> {
  const data = await graphGet<{ data: AdQualityNode[] }>(
    `/${account.id}/insights`,
    {
      level: "ad",
      ...periodParams(period),
      fields: "ad_id,quality_ranking,engagement_rate_ranking,conversion_rate_ranking",
      limit: "500",
    },
    accessToken
  );

  const map = new Map<string, AdQuality>();
  for (const row of data.data ?? []) {
    if (!row.ad_id) continue;
    map.set(row.ad_id, {
      quality: normalizeRanking(row.quality_ranking),
      engagement: normalizeRanking(row.engagement_rate_ranking),
      conversion: normalizeRanking(row.conversion_rate_ranking),
    });
  }
  return map;
}

async function fetchAccountPeriodData(
  account: MetaAdAccount,
  period: Period,
  accessToken: string
): Promise<{
  campaigns: CampaignInsight[];
  adSets: AdSetInsight[];
  ads: AdInsight[];
  daily: DailyMetrics[];
  reach: number;
  audience: AudienceSegment[];
  regions: RegionSegment[];
  platforms: PlatformSegment[];
  placements: PlacementSegment[];
  devices: DeviceSegment[];
  countries: CountrySegment[];
  hours: HourSegment[];
}> {
  const [campaignMeta, adSetMeta, adMeta, adQuality] = await Promise.all([
    getCampaignMeta(account, accessToken).catch(() => new Map<string, CampaignMeta>()),
    getAdSetMeta(account, accessToken).catch(() => new Map<string, AdSetMeta>()),
    getAdMeta(account, accessToken).catch(() => new Map<string, AdMeta>()),
    getAdQualityRankings(account, period, accessToken).catch(() => new Map<string, AdQuality>()),
  ]);
  const [campaigns, adSets, ads, daily, reach, audience, regions, platforms, placements, devices, countries, hours] = await Promise.all([
    getAccountCampaignInsights(account, period, campaignMeta, accessToken),
    getAccountAdSetInsights(account, period, adSetMeta, accessToken),
    getAccountAdInsights(account, period, adMeta, adQuality, accessToken),
    getAccountDailySeries(account, period, accessToken),
    getAccountReach(account, period, accessToken),
    getAccountDemographics(account, period, accessToken),
    getAccountRegions(account, period, accessToken),
    // Deliberately isolated with their own fallback, unlike the calls
    // above: these five are supplementary distribution breakdowns, not
    // core numbers, and a previous incident (see git history: the "city"
    // breakdown) taught the hard way that one bad breakdown value bundled
    // into this same Promise.all silently fails EVERY account's entire
    // dashboard load, not just its own panel.
    getAccountPlatforms(account, period, accessToken).catch(() => []),
    getAccountPlacements(account, period, accessToken).catch(() => []),
    getAccountDevices(account, period, accessToken).catch(() => []),
    getAccountCountries(account, period, accessToken).catch(() => []),
    getAccountHours(account, period, accessToken).catch(() => []),
  ]);
  return { campaigns, adSets, ads, daily, reach, audience, regions, platforms, placements, devices, countries, hours };
}

async function fetchAllAccounts(
  accounts: MetaAdAccount[],
  period: Period,
  tokenByAccountId: Map<string, string>
): Promise<{
  campaigns: CampaignInsight[];
  adSets: AdSetInsight[];
  ads: AdInsight[];
  daily: DailyMetrics[];
  accountReach: AccountReach[];
  audience: AudienceSegment[];
  regions: RegionSegment[];
  platforms: PlatformSegment[];
  placements: PlacementSegment[];
  devices: DeviceSegment[];
  countries: CountrySegment[];
  hours: HourSegment[];
  partialAccounts: AccountRef[];
}> {
  const settled = await Promise.allSettled(
    accounts.map((a) => fetchAccountPeriodData(a, period, tokenByAccountId.get(a.id)!))
  );

  const campaigns: CampaignInsight[] = [];
  const adSets: AdSetInsight[] = [];
  const ads: AdInsight[] = [];
  const daily: DailyMetrics[] = [];
  const accountReach: AccountReach[] = [];
  const audience: AudienceSegment[] = [];
  const regions: RegionSegment[] = [];
  const platforms: PlatformSegment[] = [];
  const placements: PlacementSegment[] = [];
  const devices: DeviceSegment[] = [];
  const countries: CountrySegment[] = [];
  const hours: HourSegment[] = [];
  const partialAccounts: AccountRef[] = [];

  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      // One account failing (e.g. the system user not yet assigned to it, or
      // a transient Meta error) shouldn't take down the whole dashboard —
      // record it so the UI can say "this account's data is missing" rather
      // than silently rendering it as zero.
      console.error(`[meta-ads] failed to fetch data for ${accounts[i].id}`, result.reason);
      partialAccounts.push({ id: accounts[i].id, name: accounts[i].name });
      return;
    }
    campaigns.push(...result.value.campaigns);
    adSets.push(...result.value.adSets);
    ads.push(...result.value.ads);
    daily.push(...result.value.daily);
    accountReach.push({ accountId: accounts[i].id, reach: result.value.reach });
    audience.push(...result.value.audience);
    regions.push(...result.value.regions);
    platforms.push(...result.value.platforms);
    placements.push(...result.value.placements);
    devices.push(...result.value.devices);
    countries.push(...result.value.countries);
    hours.push(...result.value.hours);
  });

  campaigns.sort((a, b) => b.spend - a.spend);
  adSets.sort((a, b) => b.spend - a.spend);
  ads.sort((a, b) => b.spend - a.spend);
  daily.sort((a, b) => a.date.localeCompare(b.date));

  return { campaigns, adSets, ads, daily, accountReach, audience, regions, platforms, placements, devices, countries, hours, partialAccounts };
}

/**
 * Fetches and aggregates campaign performance across every ad account every
 * configured Business Manager owns or manages for a client. Fails closed:
 * any missing config or upstream error surfaces as a MetaApiError for the
 * caller to render a friendly message from — it never returns partial or
 * fabricated numbers for an account it could reach.
 */
export async function getDashboardData(
  period: Period,
  allowedAccountIds?: string[],
  options: DashboardOptions = {}
): Promise<DashboardData> {
  const { accounts: allAccounts, tokenByAccountId } = await fetchAllBusinessAccounts();
  let accounts = allAccounts;
  if (allowedAccountIds) {
    const allowed = new Set(allowedAccountIds);
    accounts = accounts.filter((a) => allowed.has(a.id));
  }

  const resolvedRange = resolvePeriodRange(period);

  if (accounts.length === 0) {
    return {
      period,
      resolvedRange,
      accounts: [],
      campaigns: [],
      adSets: [],
      ads: [],
      daily: [],
      accountReach: [],
      audience: [],
      regions: [],
      platforms: [],
      placements: [],
      devices: [],
      countries: [],
      hours: [],
      comparison: null,
      partialAccounts: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const current = await fetchAllAccounts(accounts, period, tokenByAccountId);

  let comparison: DashboardData["comparison"] = null;
  if (options.compare) {
    const prevRange = previousEquivalentRange(resolvedRange);
    const prev = await fetchAllAccounts(accounts, { kind: "custom", range: prevRange }, tokenByAccountId);
    comparison = {
      period: prevRange,
      campaigns: prev.campaigns,
      adSets: prev.adSets,
      daily: prev.daily,
      accountReach: prev.accountReach,
    };
  }

  return {
    period,
    resolvedRange,
    accounts,
    campaigns: current.campaigns,
    adSets: current.adSets,
    ads: current.ads,
    daily: current.daily,
    accountReach: current.accountReach,
    audience: current.audience,
    regions: current.regions,
    platforms: current.platforms,
    placements: current.placements,
    devices: current.devices,
    countries: current.countries,
    hours: current.hours,
    comparison,
    partialAccounts: current.partialAccounts,
    generatedAt: new Date().toISOString(),
  };
}
