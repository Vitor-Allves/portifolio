// Types and constants shared between the server-only Google Ads client
// (src/lib/google-ads.ts) and client components — nothing here touches
// process.env or performs a fetch, so it's safe to import from either side.

import type { CampaignStatus, DateRange, Period } from "./meta-ads-types";

// Google Ads customer ids are stored in the same account_ids arrays (client
// access, staff users) as Meta's "act_…" ids, so a client can be granted
// accounts on both platforms from one place. The prefix keeps the two id
// spaces from ever colliding and lets each platform's fetcher pick out only
// its own ids — Meta's getDashboardData already ignores anything it doesn't
// recognize as one of its own accounts.
export const GOOGLE_ACCOUNT_PREFIX = "gads_";

export function isGoogleAccountId(id: string): boolean {
  return id.startsWith(GOOGLE_ACCOUNT_PREFIX);
}

export function toGoogleAccountId(customerId: string): string {
  return `${GOOGLE_ACCOUNT_PREFIX}${customerId}`;
}

export function customerIdFromAccountId(accountId: string): string {
  return accountId.slice(GOOGLE_ACCOUNT_PREFIX.length);
}

export type GoogleAdsAccount = {
  id: string; // "gads_1234567890"
  customerId: string; // "1234567890" — no dashes, as the API expects it
  name: string;
  currencyCode: string | null;
};

export type GoogleCampaignInsight = {
  campaignId: string;
  campaignName: string;
  accountId: string;
  accountName: string;
  // Google's advertising_channel_type: SEARCH, PERFORMANCE_MAX, DISPLAY, VIDEO, …
  channelType: string | null;
  status: CampaignStatus;
  spend: number;
  impressions: number;
  clicks: number;
  // metrics.conversions — the account's own "primary" conversion actions as
  // configured in Google Ads. Fractional under data-driven attribution, and
  // a real 0 (never null) when nothing converted: unlike Meta's
  // conversations, Google always reports this field.
  conversions: number;
  conversionsValue: number;
};

export type GoogleDailyMetrics = {
  accountId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  conversions: number;
  conversionsValue: number;
};

export type GoogleAdsDashboardData = {
  // false when the GOOGLE_ADS_* env vars aren't set — every other field is
  // then empty, so the UI can show a setup notice instead of an error.
  configured: boolean;
  period: Period;
  resolvedRange: DateRange;
  accounts: GoogleAdsAccount[];
  campaigns: GoogleCampaignInsight[];
  // Google omits days with no delivery at all — callers plotting a series
  // must fill missing dates with zeros themselves.
  daily: GoogleDailyMetrics[];
  comparison: { period: DateRange; campaigns: GoogleCampaignInsight[]; daily: GoogleDailyMetrics[] } | null;
  partialAccounts: { id: string; name: string }[];
  generatedAt: string;
};

export const GOOGLE_CHANNEL_LABEL: Record<string, string> = {
  SEARCH: "Pesquisa",
  DISPLAY: "Display",
  SHOPPING: "Shopping",
  VIDEO: "Vídeo (YouTube)",
  PERFORMANCE_MAX: "Performance Max",
  DEMAND_GEN: "Demand Gen",
  MULTI_CHANNEL: "App",
  LOCAL: "Local",
  SMART: "Inteligente",
  HOTEL: "Hotel",
  LOCAL_SERVICES: "Serviços locais",
  TRAVEL: "Viagens",
};
