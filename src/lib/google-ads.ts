// Server-only client for the Google Ads API (REST transport). Never import
// this from a "use client" component — it reads the GOOGLE_ADS_* secrets,
// which must never reach the browser.
//
// Auth mirrors the Meta integration's "one long-lived credential set once,
// no login flow inside the app" model: an OAuth refresh token generated a
// single time outside the app (see docs/google-ads-setup.md) is exchanged
// here for a short-lived access token as needed.
//
// Setup guide: docs/google-ads-setup.md

import type { CampaignStatus, DateRange, Period } from "./meta-ads-types";
import { resolvePeriodRange, previousEquivalentRange } from "./meta-ads";
import {
  toGoogleAccountId,
  type GoogleAdsAccount,
  type GoogleAdsDashboardData,
  type GoogleCampaignInsight,
  type GoogleDailyMetrics,
} from "./google-ads-types";

// Overridable without a deploy-time code change: Google sunsets each major
// version roughly a year after release, so bumping this is routine.
const DEFAULT_API_VERSION = "v26";
const API_HOST = "https://googleads.googleapis.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
// Google returns at most 10,000 rows per page; no account this dashboard
// reads comes anywhere near this many, it only guards against a runaway loop.
const MAX_PAGES = 50;

export class GoogleAdsApiError extends Error {
  constructor(
    message: string,
    readonly cause?: unknown
  ) {
    super(message);
    this.name = "GoogleAdsApiError";
  }
}

export class GoogleAdsConfigError extends GoogleAdsApiError {
  constructor(missing: string[]) {
    super(`Missing required env var(s): ${missing.join(", ")}`);
    this.name = "GoogleAdsConfigError";
  }
}

const REQUIRED_VARS = [
  "GOOGLE_ADS_DEVELOPER_TOKEN",
  "GOOGLE_ADS_CLIENT_ID",
  "GOOGLE_ADS_CLIENT_SECRET",
  "GOOGLE_ADS_REFRESH_TOKEN",
] as const;

type GoogleAdsConfig = {
  developerToken: string;
  clientId: string;
  clientSecret: string;
  refreshToken: string;
  // The manager (MCC) account the refresh token's user reaches client
  // accounts through. null = the user has direct access to each account.
  loginCustomerId: string | null;
  apiVersion: string;
};

export function isGoogleAdsConfigured(): boolean {
  return REQUIRED_VARS.every((name) => Boolean(process.env[name]));
}

/** "123-456-7890" (as Google Ads shows it) → "1234567890" (as the API expects it). */
function normalizeCustomerId(raw: string | undefined): string {
  return (raw ?? "").replace(/\D/g, "");
}

function getConfig(): GoogleAdsConfig {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new GoogleAdsConfigError(missing);
  return {
    developerToken: process.env.GOOGLE_ADS_DEVELOPER_TOKEN!,
    clientId: process.env.GOOGLE_ADS_CLIENT_ID!,
    clientSecret: process.env.GOOGLE_ADS_CLIENT_SECRET!,
    refreshToken: process.env.GOOGLE_ADS_REFRESH_TOKEN!,
    loginCustomerId: normalizeCustomerId(process.env.GOOGLE_ADS_LOGIN_CUSTOMER_ID) || null,
    apiVersion: process.env.GOOGLE_ADS_API_VERSION || DEFAULT_API_VERSION,
  };
}

// Access tokens live ~1h; reused across requests within a warm instance so
// every dashboard load doesn't pay an extra OAuth round-trip.
let cachedToken: { value: string; expiresAt: number } | null = null;

async function getAccessToken(config: GoogleAdsConfig): Promise<string> {
  if (cachedToken && cachedToken.expiresAt - 60_000 > Date.now()) return cachedToken.value;

  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      client_id: config.clientId,
      client_secret: config.clientSecret,
      refresh_token: config.refreshToken,
    }),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { access_token?: string; expires_in?: number; error?: string } | null;
  if (!res.ok || !body?.access_token) {
    throw new GoogleAdsApiError(
      `Não foi possível renovar o acesso ao Google Ads (OAuth ${res.status}${body?.error ? `: ${body.error}` : ""}). Verifique o refresh token e o client ID/secret.`
    );
  }
  cachedToken = { value: body.access_token, expiresAt: Date.now() + (Number(body.expires_in) || 3600) * 1000 };
  return cachedToken.value;
}

type GoogleAdsErrorBody = {
  error?: {
    code?: number;
    message?: string;
    details?: { errors?: { message?: string }[] }[];
  };
};

/** Google's REST errors bury the actually-useful message (e.g. "The developer token is only approved for use with test accounts") inside error.details[].errors[] — surface that first. */
function describeApiError(status: number, body: unknown): string {
  const err = (body as GoogleAdsErrorBody | null)?.error;
  const detailed = err?.details?.flatMap((d) => d.errors ?? []).find((e) => e.message)?.message;
  return `Google Ads API ${status}: ${detailed ?? err?.message ?? "erro desconhecido"}`;
}

function apiHeaders(config: GoogleAdsConfig, accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`,
    "developer-token": config.developerToken,
    "Content-Type": "application/json",
    ...(config.loginCustomerId ? { "login-customer-id": config.loginCustomerId } : {}),
  };
}

/** Runs one GAQL query against one customer, following nextPageToken until exhausted. */
async function searchAll<T>(config: GoogleAdsConfig, customerId: string, query: string): Promise<T[]> {
  const accessToken = await getAccessToken(config);
  const url = `${API_HOST}/${config.apiVersion}/customers/${customerId}/googleAds:search`;
  const rows: T[] = [];
  let pageToken: string | undefined;

  for (let page = 0; page < MAX_PAGES; page++) {
    const res = await fetch(url, {
      method: "POST",
      headers: apiHeaders(config, accessToken),
      body: JSON.stringify(pageToken ? { query, pageToken } : { query }),
      cache: "no-store",
    });
    const body = (await res.json().catch(() => null)) as { results?: T[]; nextPageToken?: string } | null;
    if (!res.ok) throw new GoogleAdsApiError(describeApiError(res.status, body));
    rows.push(...(body?.results ?? []));
    pageToken = body?.nextPageToken || undefined;
    if (!pageToken) break;
  }
  return rows;
}

// ---------------------------------------------------------------------------
// Accounts
// ---------------------------------------------------------------------------

type CustomerClientRow = {
  customerClient?: { id?: string; descriptiveName?: string; currencyCode?: string };
};

type CustomerRow = {
  customer?: { id?: string; descriptiveName?: string; currencyCode?: string; manager?: boolean };
};

function accountFrom(id: string, name: string | undefined, currencyCode: string | undefined): GoogleAdsAccount {
  return { id: toGoogleAccountId(id), customerId: id, name: name || `Conta ${id}`, currencyCode: currencyCode ?? null };
}

/**
 * Every client (non-manager) account the configured credentials can read.
 * With a manager account set, that's every enabled account anywhere in its
 * hierarchy (customer_client includes all levels, not just direct
 * children); without one, every account the OAuth user was invited to
 * directly. Only ENABLED accounts — a canceled/suspended account can't be
 * queried at all (the API rejects it), so listing it would only ever
 * produce an error row.
 */
export async function listGoogleAdsAccounts(): Promise<GoogleAdsAccount[]> {
  const config = getConfig();

  if (config.loginCustomerId) {
    const rows = await searchAll<CustomerClientRow>(
      config,
      config.loginCustomerId,
      "SELECT customer_client.id, customer_client.descriptive_name, customer_client.currency_code FROM customer_client WHERE customer_client.manager = FALSE AND customer_client.status = 'ENABLED'"
    );
    return rows
      .filter((r) => r.customerClient?.id)
      .map((r) => accountFrom(r.customerClient!.id!, r.customerClient!.descriptiveName, r.customerClient!.currencyCode))
      .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }

  const accessToken = await getAccessToken(config);
  const res = await fetch(`${API_HOST}/${config.apiVersion}/customers:listAccessibleCustomers`, {
    headers: apiHeaders(config, accessToken),
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as { resourceNames?: string[] } | null;
  if (!res.ok) throw new GoogleAdsApiError(describeApiError(res.status, body));
  const customerIds = (body?.resourceNames ?? []).map((name) => name.replace("customers/", ""));

  const settled = await Promise.allSettled(
    customerIds.map((id) =>
      searchAll<CustomerRow>(config, id, "SELECT customer.id, customer.descriptive_name, customer.currency_code, customer.manager FROM customer")
    )
  );
  const accounts: GoogleAdsAccount[] = [];
  settled.forEach((result, i) => {
    if (result.status === "rejected") {
      console.error(`[google-ads] could not read customer ${customerIds[i]}`, result.reason);
      return;
    }
    const customer = result.value[0]?.customer;
    if (!customer || customer.manager) return;
    accounts.push(accountFrom(customerIds[i], customer.descriptiveName, customer.currencyCode));
  });
  return accounts.sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
}

// ---------------------------------------------------------------------------
// Insights
// ---------------------------------------------------------------------------

// REST JSON encodes int64 fields (ids, cost_micros, impressions, clicks) as
// strings; doubles (conversions, conversions_value) as plain numbers.
type MetricsNode = {
  costMicros?: string;
  impressions?: string;
  clicks?: string;
  conversions?: number;
  conversionsValue?: number;
};

type CampaignRow = {
  campaign?: { id?: string; name?: string; status?: string; advertisingChannelType?: string };
  metrics?: MetricsNode;
};

type DailyRow = {
  segments?: { date?: string };
  metrics?: MetricsNode;
};

function parseMetrics(m: MetricsNode | undefined) {
  return {
    // cost_micros is in millionths of the account currency.
    spend: Number(m?.costMicros ?? 0) / 1_000_000,
    impressions: Number(m?.impressions ?? 0),
    clicks: Number(m?.clicks ?? 0),
    conversions: Number(m?.conversions ?? 0),
    conversionsValue: Number(m?.conversionsValue ?? 0),
  };
}

function normalizeStatus(status: string | undefined): CampaignStatus {
  switch (status) {
    case "ENABLED":
      return "ACTIVE";
    case "PAUSED":
      return "PAUSED";
    case "REMOVED":
      return "DELETED";
    default:
      return "OTHER";
  }
}

async function fetchAccountInsights(
  config: GoogleAdsConfig,
  account: GoogleAdsAccount,
  range: DateRange
): Promise<{ campaigns: GoogleCampaignInsight[]; daily: GoogleDailyMetrics[] }> {
  const during = `segments.date BETWEEN '${range.since}' AND '${range.until}'`;
  const metrics = "metrics.cost_micros, metrics.impressions, metrics.clicks, metrics.conversions, metrics.conversions_value";

  // `metrics.impressions > 0` keeps this in line with Meta's insights, which
  // only ever return campaigns that actually delivered in the period —
  // otherwise every paused/removed campaign in the account's history shows
  // up as an all-zero row.
  const [campaignRows, dailyRows] = await Promise.all([
    searchAll<CampaignRow>(
      config,
      account.customerId,
      `SELECT campaign.id, campaign.name, campaign.status, campaign.advertising_channel_type, ${metrics} FROM campaign WHERE ${during} AND metrics.impressions > 0`
    ),
    searchAll<DailyRow>(config, account.customerId, `SELECT segments.date, ${metrics} FROM customer WHERE ${during}`),
  ]);

  const campaigns = campaignRows
    .filter((r) => r.campaign?.id)
    .map((r) => ({
      campaignId: r.campaign!.id!,
      campaignName: r.campaign!.name || "Campanha sem nome",
      accountId: account.id,
      accountName: account.name,
      channelType: r.campaign!.advertisingChannelType ?? null,
      status: normalizeStatus(r.campaign!.status),
      ...parseMetrics(r.metrics),
    }));

  const daily = dailyRows
    .filter((r) => r.segments?.date)
    .map((r) => ({ accountId: account.id, date: r.segments!.date!, ...parseMetrics(r.metrics) }));

  return { campaigns, daily };
}

async function fetchAllAccounts(config: GoogleAdsConfig, accounts: GoogleAdsAccount[], range: DateRange) {
  const settled = await Promise.allSettled(accounts.map((a) => fetchAccountInsights(config, a, range)));
  const campaigns: GoogleCampaignInsight[] = [];
  const daily: GoogleDailyMetrics[] = [];
  const partialAccounts: { id: string; name: string }[] = [];
  settled.forEach((result, i) => {
    if (result.status === "fulfilled") {
      campaigns.push(...result.value.campaigns);
      daily.push(...result.value.daily);
    } else {
      console.error(`[google-ads] failed to load ${accounts[i].id}`, result.reason);
      partialAccounts.push({ id: accounts[i].id, name: accounts[i].name });
    }
  });
  return { campaigns, daily, partialAccounts };
}

export async function getGoogleAdsDashboardData(
  period: Period,
  allowedAccountIds?: string[],
  options: { compare?: boolean } = {}
): Promise<GoogleAdsDashboardData> {
  const resolvedRange = resolvePeriodRange(period);
  const empty: GoogleAdsDashboardData = {
    configured: false,
    period,
    resolvedRange,
    accounts: [],
    campaigns: [],
    daily: [],
    comparison: null,
    partialAccounts: [],
    generatedAt: new Date().toISOString(),
  };
  if (!isGoogleAdsConfigured()) return empty;

  const config = getConfig();
  let accounts = await listGoogleAdsAccounts();
  if (allowedAccountIds) {
    const allowed = new Set(allowedAccountIds);
    accounts = accounts.filter((a) => allowed.has(a.id));
  }
  if (accounts.length === 0) return { ...empty, configured: true };

  const current = await fetchAllAccounts(config, accounts, resolvedRange);

  let comparison: GoogleAdsDashboardData["comparison"] = null;
  if (options.compare) {
    const prevRange = previousEquivalentRange(resolvedRange);
    const prev = await fetchAllAccounts(config, accounts, prevRange);
    comparison = { period: prevRange, campaigns: prev.campaigns, daily: prev.daily };
  }

  return {
    configured: true,
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
