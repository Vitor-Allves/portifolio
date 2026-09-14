// Server-only client for the Meta Marketing API. Never import this from a
// "use client" component — it reads META_SYSTEM_USER_TOKEN, which must
// never reach the browser.
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
};

export type DashboardOptions = { compare?: boolean };

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

/** Same-length window immediately preceding `range`, for the "vs. previous period" comparison. */
function previousEquivalentRange(range: DateRange): DateRange {
  const spanDays =
    Math.round(
      (new Date(`${range.until}T00:00:00Z`).getTime() -
        new Date(`${range.since}T00:00:00Z`).getTime()) /
        86_400_000
    ) + 1;
  const prevUntil = shiftDate(range.since, -1);
  const prevSince = shiftDate(prevUntil, -(spanDays - 1));
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

function requireConfig() {
  const accessToken = process.env.META_SYSTEM_USER_TOKEN;
  const businessId = process.env.META_BUSINESS_ID;
  const missing = [
    !accessToken && "META_SYSTEM_USER_TOKEN",
    !businessId && "META_BUSINESS_ID",
  ].filter((v): v is string => Boolean(v));

  if (missing.length > 0) {
    throw new MetaConfigError(missing);
  }

  return { accessToken: accessToken!, businessId: businessId! };
}

async function graphGet<T>(path: string, params: Record<string, string>): Promise<T> {
  const { accessToken } = requireConfig();
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

/** Lists every ad account the configured Business Manager owns or manages, for admin UI use (e.g. picking which accounts a new client credential should see). */
export async function listAdAccounts(): Promise<MetaAdAccount[]> {
  const { businessId } = requireConfig();

  const data = await graphGet<{
    owned_ad_accounts?: { data: AdAccountNode[] };
    client_ad_accounts?: { data: AdAccountNode[] };
  }>(`/${businessId}`, {
    fields:
      "owned_ad_accounts.limit(200){id,name,account_status},client_ad_accounts.limit(200){id,name,account_status}",
  });

  const raw = [
    ...(data.owned_ad_accounts?.data ?? []),
    ...(data.client_ad_accounts?.data ?? []),
  ];

  // Meta's account_status has ~10 values (active, in grace period, pending
  // settlement/risk review, unsettled, etc.) and several of those still have
  // real campaigns and spend worth showing — only DISABLED (2) and CLOSED
  // (101) are permanently done and safe to skip. Requiring exactly ACTIVE
  // (1) here previously hid every account sitting in any other live state.
  const DEAD_STATUSES = new Set([2, 101]);

  const byId = new Map<string, MetaAdAccount>();
  for (const account of raw) {
    if (account.account_status !== undefined && DEAD_STATUSES.has(account.account_status)) {
      continue;
    }
    byId.set(account.id, { id: account.id, name: account.name ?? account.id });
  }

  return [...byId.values()];
}

type CampaignMetaNode = { id?: string; objective?: string; effective_status?: string };
type CampaignMeta = { objective: string | null; status: CampaignStatus };

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
async function getCampaignMeta(account: MetaAdAccount): Promise<Map<string, CampaignMeta>> {
  const data = await graphGet<{ data: CampaignMetaNode[] }>(`/${account.id}/campaigns`, {
    fields: "id,objective,effective_status",
    limit: "500",
  });

  const map = new Map<string, CampaignMeta>();
  for (const row of data.data ?? []) {
    if (!row.id) continue;
    map.set(row.id, { objective: row.objective ?? null, status: normalizeStatus(row.effective_status) });
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
  reach?: string;
};

async function getAccountCampaignInsights(
  account: MetaAdAccount,
  period: Period,
  metaByCampaignId: Map<string, CampaignMeta>
): Promise<CampaignInsight[]> {
  const data = await graphGet<{ data: CampaignInsightNode[] }>(`/${account.id}/insights`, {
    level: "campaign",
    ...periodParams(period),
    fields: "campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,reach",
    limit: "500",
  });

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
      // link only — the more standard basis for evaluating traffic intent.
      linkClicks: Number(row.inline_link_clicks ?? 0),
      reach: Number(row.reach ?? 0),
    };
  });
}

type DailyInsightNode = { date_start?: string; spend?: string; impressions?: string; clicks?: string };

async function getAccountDailySeries(account: MetaAdAccount, period: Period): Promise<DailyMetrics[]> {
  const data = await graphGet<{ data: DailyInsightNode[] }>(`/${account.id}/insights`, {
    level: "account",
    ...periodParams(period),
    time_increment: "1",
    fields: "spend,impressions,clicks",
    limit: "500",
  });

  return (data.data ?? [])
    .filter((row) => row.date_start)
    .map((row) => ({
      accountId: account.id,
      date: row.date_start!,
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
    }));
}

async function fetchAccountPeriodData(
  account: MetaAdAccount,
  period: Period
): Promise<{ campaigns: CampaignInsight[]; daily: DailyMetrics[] }> {
  const meta = await getCampaignMeta(account).catch(() => new Map<string, CampaignMeta>());
  const [campaigns, daily] = await Promise.all([
    getAccountCampaignInsights(account, period, meta),
    getAccountDailySeries(account, period),
  ]);
  return { campaigns, daily };
}

async function fetchAllAccounts(
  accounts: MetaAdAccount[],
  period: Period
): Promise<{ campaigns: CampaignInsight[]; daily: DailyMetrics[]; partialAccounts: AccountRef[] }> {
  const settled = await Promise.allSettled(accounts.map((a) => fetchAccountPeriodData(a, period)));

  const campaigns: CampaignInsight[] = [];
  const daily: DailyMetrics[] = [];
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
    daily.push(...result.value.daily);
  });

  campaigns.sort((a, b) => b.spend - a.spend);
  daily.sort((a, b) => a.date.localeCompare(b.date));

  return { campaigns, daily, partialAccounts };
}

/**
 * Fetches and aggregates campaign performance across every ad account the
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
  let accounts = await listAdAccounts();
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
      daily: [],
      comparison: null,
      partialAccounts: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const current = await fetchAllAccounts(accounts, period);

  let comparison: DashboardData["comparison"] = null;
  if (options.compare) {
    const prevRange = previousEquivalentRange(resolvedRange);
    const prev = await fetchAllAccounts(accounts, { kind: "custom", range: prevRange });
    comparison = { period: prevRange, campaigns: prev.campaigns, daily: prev.daily };
  }

  return {
    period,
    resolvedRange,
    accounts,
    campaigns: current.campaigns,
    daily: current.daily,
    comparison,
    partialAccounts: current.partialAccounts,
    generatedAt: new Date().toISOString(),
  };
}
