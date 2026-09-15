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

// Meta's campaign `effective_status` has more values (PENDING_REVIEW,
// WITH_ISSUES, CAMPAIGN_PAUSED, ...) — collapsed here to the ones that are
// meaningful for filtering; anything else falls back to "other" rather than
// being silently mislabeled.
export const CAMPAIGN_STATUSES = ["ACTIVE", "PAUSED", "DELETED", "ARCHIVED", "OTHER"] as const;
export type CampaignStatus = (typeof CAMPAIGN_STATUSES)[number];

export type CampaignInsight = {
  campaignId: string;
  campaignName: string;
  accountId: string;
  accountName: string;
  objective: string | null; // Meta's raw objective (e.g. "OUTCOME_TRAFFIC"), null when unavailable
  status: CampaignStatus;
  spend: number;
  impressions: number;
  clicks: number; // Meta's "clicks" field — every click type, not just link clicks
  linkClicks: number; // Meta's "inline_link_clicks" — clicks to the destination link only. NOT a conversation: purely a click count, always <= clicks except for known Meta counting quirks on on-platform destinations (Instant Experience, lead forms, carousel cards).
  // Meta's `actions` array, action_type "onsite_conversion.messaging_conversation_started_7d"
  // (7-day click attribution). null means this row's actions array didn't
  // contain that action type at all — either the objective/destination
  // can't produce it, or it genuinely happened zero times; Meta's API gives
  // no way to tell those two apart, so null always means "não disponível",
  // never "zero". A real number (0 included, on the rare row where Meta
  // does return an explicit zero) means the metric applies here.
  conversations: number | null;
  reach: number;
  // Extra funnel/e-commerce results beyond "conversa iniciada" — same
  // null-means-not-reported rule as `conversations` above, since Meta's API
  // gives no way to distinguish "this objective can't produce this action"
  // from "it happened zero times". These only populate for accounts with a
  // Meta Pixel/Conversions API actually wired up on the destination; most
  // client accounts will see "Não disponível" here, and that's expected,
  // not a bug. `purchases`/`purchaseValue` use Meta's "omni_purchase"
  // action_type/action_values (combined web+app+offline); `leads` uses
  // "lead"; `addToCart` and `completeRegistrations` use their own
  // "omni_add_to_cart"/"omni_complete_registration" action_types.
  purchases: number | null;
  purchaseValue: number | null; // R$, from Meta's `action_values`, same action_type as `purchases`
  leads: number | null;
  addToCart: number | null;
  completeRegistrations: number | null;
  // From the Campaign node itself (not Insights) — Meta sets at most one of
  // daily/lifetime, and neither at all when this campaign delegates
  // budgeting to its ad sets instead (CBO off). `budgetRemaining` mirrors
  // whichever one is actually configured.
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  budgetRemaining: number | null;
};

// Tagged per account (not pre-summed) so the client can re-aggregate
// whichever subset of accounts the client filter has selected.
//
// `reach` here is per-day, each day's own independent number straight from
// Meta — safe to plot as a trend line (each point is correct on its own),
// but NEVER sum across days into a total: unlike spend/impressions/clicks,
// the same person reached on multiple days would be counted once per day.
// The one correct total lives in AccountReach, from a separate whole-period
// call with no time_increment breakdown.
export type DailyMetrics = {
  accountId: string;
  date: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  // See CampaignInsight.conversations — same "null means not reported for
  // this row" rule, applied per day here.
  conversations: number | null;
  reach: number;
};

export type AccountRef = { id: string; name: string };

// Fetched at account level (one call per account, like CampaignInsight) and
// included directly in the main dashboard payload — a first-class dimension
// alongside campaigns, not a separate on-demand lookup.
export type AdSetInsight = {
  adSetId: string;
  adSetName: string;
  campaignId: string;
  accountId: string;
  status: CampaignStatus;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  // See CampaignInsight.conversations.
  conversations: number | null;
  reach: number;
  // See CampaignInsight.purchases/purchaseValue/leads/addToCart/completeRegistrations.
  purchases: number | null;
  purchaseValue: number | null;
  leads: number | null;
  addToCart: number | null;
  completeRegistrations: number | null;
  // See CampaignInsight.dailyBudget/lifetimeBudget/budgetRemaining — an ad
  // set only carries its own budget when the campaign has CBO off.
  dailyBudget: number | null;
  lifetimeBudget: number | null;
  budgetRemaining: number | null;
};

// One level below AdSetInsight — the individual ad creative. Same fetch
// pattern: one call per account at level="ad", not one call per ad set.
export type AdInsight = {
  adId: string;
  adName: string;
  adSetId: string;
  campaignId: string;
  accountId: string;
  status: CampaignStatus;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  // See CampaignInsight.conversations.
  conversations: number | null;
  reach: number;
  // See CampaignInsight.purchases/purchaseValue/leads/addToCart/completeRegistrations.
  purchases: number | null;
  purchaseValue: number | null;
  leads: number | null;
  addToCart: number | null;
  completeRegistrations: number | null;
  // Meta's ad relevance diagnostics — how this ad ranks against other
  // advertisers competing for the same audience, e.g. "ABOVE_AVERAGE",
  // "AVERAGE", "BELOW_AVERAGE_35"/"_20"/"_10". null when Meta hasn't
  // delivered this ad enough yet to rank it ("UNKNOWN") — never a rank.
  // Ad-set/campaign level has no equivalent; this only exists per ad.
  qualityRanking: string | null;
  engagementRateRanking: string | null;
  conversionRateRanking: string | null;
  // From the Ad node's `creative` sub-field expansion — the actual asset
  // shown to people, not an insights metric. All null when the ad's
  // creative couldn't be resolved (deleted creative, unsupported format).
  thumbnailUrl: string | null;
  creativeTitle: string | null;
  creativeBody: string | null;
  callToAction: string | null; // Meta's raw call_to_action_type, e.g. "SHOP_NOW", "LEARN_MORE"
};

// One number per account for the whole period — NOT the sum of each
// campaign's own `reach`, and not the sum of daily reach either. Meta's
// "reach" is already deduplicated (estimated unique people) within a single
// insights call, but only within that one call's scope: summing per-campaign
// or per-day reach would double-count anyone reached more than once.
export type AccountReach = { accountId: string; reach: number };

// Meta's age/gender breakdown, fetched at account level (one call per
// account). Unlike per-campaign or per-day reach, these buckets ARE safe to
// sum across — age and gender are mutually exclusive per person (everyone
// falls into exactly one bucket), so this doesn't have the double-counting
// problem AccountReach's own doc comment warns about.
export type AudienceSegment = {
  accountId: string;
  age: string; // e.g. "18-24", "65+", or "unknown"
  gender: string; // "male" | "female" | "unknown"
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  // See CampaignInsight.conversations.
  conversations: number | null;
  reach: number;
};

// Meta's region breakdown (state-level for Brazil, e.g. "São Paulo"),
// fetched the same way as AudienceSegment — one call per account, safe to
// sum across regions for the same reason age/gender buckets are: each
// reached person is attributed to exactly one region.
export type RegionSegment = {
  accountId: string;
  region: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  // See CampaignInsight.conversations.
  conversations: number | null;
  reach: number;
};

// The four breakdowns below share the exact same "safe to sum" reasoning as
// RegionSegment: each is its own Meta breakdown dimension (one call per
// account, `breakdowns` set to exactly one value each — deliberately NOT
// combined into a single multi-breakdown call, since Meta only allows
// specific breakdown combinations and guessing wrong caused a production
// incident before; see meta-ads.ts), and each reached person/impression is
// attributed to exactly one bucket per dimension.

/** Meta's `publisher_platform` breakdown: "facebook" | "instagram" | "audience_network" | "messenger". */
export type PlatformSegment = {
  accountId: string;
  platform: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversations: number | null;
  reach: number;
};

/** Meta's `platform_position` breakdown: "feed" | "instagram_stories" | "instream_video" | etc. */
export type PlacementSegment = {
  accountId: string;
  placement: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversations: number | null;
  reach: number;
};

/** Meta's `device_platform` breakdown: "mobile" | "desktop". */
export type DeviceSegment = {
  accountId: string;
  device: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversations: number | null;
  reach: number;
};

/** Meta's `country` breakdown — ISO country code (e.g. "BR"). */
export type CountrySegment = {
  accountId: string;
  country: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversations: number | null;
  reach: number;
};

// Meta's `hourly_stats_aggregated_by_advertiser_time_zone` breakdown — one
// row per hour-of-day bucket (e.g. "13:00:00 - 13:59:59"), in the ad
// account's own timezone. Unlike the other breakdowns here, a person
// reached in multiple hours on the same day IS counted in each hour they
// appeared — so `reach` here is NOT safe to sum into a daily/period total
// the way region/platform/placement/device/country are (same caveat as
// DailyMetrics.reach). Spend/impressions/clicks remain safe to sum.
export type HourSegment = {
  accountId: string;
  hour: string;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  conversations: number | null;
  reach: number;
};

export type DashboardData = {
  period: Period;
  // The concrete since/until this period resolved to — presets are
  // resolved server-side so the header/labels can show exact dates too.
  resolvedRange: DateRange;
  accounts: MetaAdAccount[];
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
  // Same shape as the primary period, for the "compare to previous period"
  // filter — omitted entirely when comparison wasn't requested.
  comparison: {
    period: DateRange;
    campaigns: CampaignInsight[];
    adSets: AdSetInsight[];
    daily: DailyMetrics[];
    accountReach: AccountReach[];
  } | null;
  // Accounts that failed to load for this request (transient Meta error,
  // token not yet propagated, ...) — surfaced so the UI can distinguish
  // "genuinely zero" from "we couldn't fetch this", instead of silently
  // dropping them like a zero-result account.
  partialAccounts: AccountRef[];
  generatedAt: string;
};
