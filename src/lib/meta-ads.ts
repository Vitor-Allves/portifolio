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

/** Which configured business's token can read this account, or null if it isn't visible to any of them. Reuses the same 15-minute-cached account listing as the rest of the dashboard, so this doesn't add a fresh Graph API round trip on every call. */
export async function getAccessTokenForAccount(accountId: string): Promise<string | null> {
  const { tokenByAccountId } = await fetchAllBusinessAccounts();
  return tokenByAccountId.get(accountId) ?? null;
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
async function getCampaignMeta(account: MetaAdAccount, accessToken: string): Promise<Map<string, CampaignMeta>> {
  const data = await graphGet<{ data: CampaignMetaNode[] }>(
    `/${account.id}/campaigns`,
    { fields: "id,objective,effective_status", limit: "500" },
    accessToken
  );

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
  metaByCampaignId: Map<string, CampaignMeta>,
  accessToken: string
): Promise<CampaignInsight[]> {
  const data = await graphGet<{ data: CampaignInsightNode[] }>(
    `/${account.id}/insights`,
    {
      level: "campaign",
      ...periodParams(period),
      fields: "campaign_id,campaign_name,spend,impressions,clicks,inline_link_clicks,reach",
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
      // link only — the more standard basis for evaluating traffic intent.
      linkClicks: Number(row.inline_link_clicks ?? 0),
      reach: Number(row.reach ?? 0),
    };
  });
}

type AdSetMetaNode = { id?: string; name?: string; effective_status?: string };
type AdSetMeta = { name: string; status: CampaignStatus };

// Same pattern as getCampaignMeta: an ad set's name/status live on the ad
// set node itself, not on its insights row.
async function getAdSetMeta(campaignId: string, accessToken: string): Promise<Map<string, AdSetMeta>> {
  const data = await graphGet<{ data: AdSetMetaNode[] }>(
    `/${campaignId}/adsets`,
    { fields: "id,name,effective_status", limit: "500" },
    accessToken
  );

  const map = new Map<string, AdSetMeta>();
  for (const row of data.data ?? []) {
    if (!row.id) continue;
    map.set(row.id, { name: row.name ?? "Conjunto sem nome", status: normalizeStatus(row.effective_status) });
  }
  return map;
}

type AdSetInsightNode = {
  adset_id?: string;
  adset_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  inline_link_clicks?: string;
  reach?: string;
};

/** Ad sets within one campaign, fetched on demand — see AdSetInsight for why this isn't part of the main dashboard payload. */
export async function getCampaignAdSets(
  campaignId: string,
  period: Period,
  accessToken: string
): Promise<AdSetInsight[]> {
  const [meta, insights] = await Promise.all([
    getAdSetMeta(campaignId, accessToken).catch(() => new Map<string, AdSetMeta>()),
    graphGet<{ data: AdSetInsightNode[] }>(
      `/${campaignId}/insights`,
      {
        level: "adset",
        ...periodParams(period),
        fields: "adset_id,adset_name,spend,impressions,clicks,inline_link_clicks,reach",
        limit: "500",
      },
      accessToken
    ),
  ]);

  const adSets = (insights.data ?? []).map((row) => {
    const m = meta.get(row.adset_id ?? "");
    return {
      adSetId: row.adset_id ?? "",
      adSetName: row.adset_name ?? m?.name ?? "Conjunto sem nome",
      campaignId,
      status: m?.status ?? "OTHER",
      spend: Number(row.spend ?? 0),
      impressions: Number(row.impressions ?? 0),
      clicks: Number(row.clicks ?? 0),
      linkClicks: Number(row.inline_link_clicks ?? 0),
      reach: Number(row.reach ?? 0),
    };
  });

  adSets.sort((a, b) => b.spend - a.spend);
  return adSets;
}

type DailyInsightNode = { date_start?: string; spend?: string; impressions?: string; clicks?: string };

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
      fields: "spend,impressions,clicks",
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

async function fetchAccountPeriodData(
  account: MetaAdAccount,
  period: Period,
  accessToken: string
): Promise<{ campaigns: CampaignInsight[]; daily: DailyMetrics[]; reach: number }> {
  const meta = await getCampaignMeta(account, accessToken).catch(() => new Map<string, CampaignMeta>());
  const [campaigns, daily, reach] = await Promise.all([
    getAccountCampaignInsights(account, period, meta, accessToken),
    getAccountDailySeries(account, period, accessToken),
    getAccountReach(account, period, accessToken),
  ]);
  return { campaigns, daily, reach };
}

async function fetchAllAccounts(
  accounts: MetaAdAccount[],
  period: Period,
  tokenByAccountId: Map<string, string>
): Promise<{
  campaigns: CampaignInsight[];
  daily: DailyMetrics[];
  accountReach: AccountReach[];
  partialAccounts: AccountRef[];
}> {
  const settled = await Promise.allSettled(
    accounts.map((a) => fetchAccountPeriodData(a, period, tokenByAccountId.get(a.id)!))
  );

  const campaigns: CampaignInsight[] = [];
  const daily: DailyMetrics[] = [];
  const accountReach: AccountReach[] = [];
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
    accountReach.push({ accountId: accounts[i].id, reach: result.value.reach });
  });

  campaigns.sort((a, b) => b.spend - a.spend);
  daily.sort((a, b) => a.date.localeCompare(b.date));

  return { campaigns, daily, accountReach, partialAccounts };
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
      daily: [],
      accountReach: [],
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
      daily: prev.daily,
      accountReach: prev.accountReach,
    };
  }

  return {
    period,
    resolvedRange,
    accounts,
    campaigns: current.campaigns,
    daily: current.daily,
    accountReach: current.accountReach,
    comparison,
    partialAccounts: current.partialAccounts,
    generatedAt: new Date().toISOString(),
  };
}
