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
  MetaAdAccount,
  CampaignInsight,
  DailySpend,
  DashboardData,
} from "./meta-ads-types";
export { DATE_PRESETS, isValidDatePreset } from "./meta-ads-types";
export type { DatePreset, MetaAdAccount, CampaignInsight, DailySpend, DashboardData };

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

type CampaignInsightNode = {
  campaign_id?: string;
  campaign_name?: string;
  spend?: string;
  impressions?: string;
  clicks?: string;
  ctr?: string;
  cpc?: string;
  reach?: string;
};

async function getAccountCampaignInsights(
  account: MetaAdAccount,
  datePreset: DatePreset
): Promise<CampaignInsight[]> {
  const data = await graphGet<{ data: CampaignInsightNode[] }>(`/${account.id}/insights`, {
    level: "campaign",
    date_preset: datePreset,
    fields: "campaign_id,campaign_name,spend,impressions,clicks,ctr,cpc,reach",
    limit: "500",
  });

  return (data.data ?? []).map((row) => ({
    campaignId: row.campaign_id ?? "",
    campaignName: row.campaign_name ?? "Campanha sem nome",
    accountId: account.id,
    accountName: account.name,
    spend: Number(row.spend ?? 0),
    impressions: Number(row.impressions ?? 0),
    clicks: Number(row.clicks ?? 0),
    ctr: Number(row.ctr ?? 0),
    cpc: Number(row.cpc ?? 0),
    reach: Number(row.reach ?? 0),
  }));
}

type DailyInsightNode = { date_start?: string; spend?: string };

async function getAccountDailySpend(
  account: MetaAdAccount,
  datePreset: DatePreset
): Promise<DailySpend[]> {
  const data = await graphGet<{ data: DailyInsightNode[] }>(`/${account.id}/insights`, {
    level: "account",
    date_preset: datePreset,
    time_increment: "1",
    fields: "spend",
    limit: "500",
  });

  return (data.data ?? [])
    .filter((row) => row.date_start)
    .map((row) => ({
      accountId: account.id,
      date: row.date_start!,
      spend: Number(row.spend ?? 0),
    }));
}

/**
 * Fetches and aggregates campaign performance across every ad account the
 * configured Business Manager owns or manages for a client. Fails closed:
 * any missing config or upstream error surfaces as a MetaApiError for the
 * caller to render a friendly message from — it never returns partial or
 * fabricated numbers.
 */
export async function getDashboardData(
  datePreset: DatePreset,
  allowedAccountIds?: string[]
): Promise<DashboardData> {
  let accounts = await listAdAccounts();
  if (allowedAccountIds) {
    const allowed = new Set(allowedAccountIds);
    accounts = accounts.filter((a) => allowed.has(a.id));
  }

  if (accounts.length === 0) {
    return {
      datePreset,
      accounts: [],
      campaigns: [],
      dailySpend: [],
      generatedAt: new Date().toISOString(),
    };
  }

  // One account failing (e.g. the system user not yet assigned to it, or a
  // transient Meta error) shouldn't take down the whole dashboard — settle
  // per account and just skip + log the ones that errored.
  const [campaignResults, dailyResults] = await Promise.all([
    Promise.allSettled(accounts.map((a) => getAccountCampaignInsights(a, datePreset))),
    Promise.allSettled(accounts.map((a) => getAccountDailySpend(a, datePreset))),
  ]);

  const campaigns = campaignResults
    .flatMap((result, i) => {
      if (result.status === "rejected") {
        console.error(
          `[meta-ads] failed to fetch campaign insights for ${accounts[i].id}`,
          result.reason
        );
        return [];
      }
      return result.value;
    })
    .sort((a, b) => b.spend - a.spend);

  const dailySpend = dailyResults
    .flatMap((result, i) => {
      if (result.status === "rejected") {
        console.error(
          `[meta-ads] failed to fetch daily spend for ${accounts[i].id}`,
          result.reason
        );
        return [];
      }
      return result.value;
    })
    .sort((a, b) => a.date.localeCompare(b.date));

  return {
    datePreset,
    accounts,
    campaigns,
    dailySpend,
    generatedAt: new Date().toISOString(),
  };
}
