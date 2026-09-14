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

export type DailySpend = { date: string; spend: number };

export type DashboardData = {
  datePreset: DatePreset;
  accounts: MetaAdAccount[];
  campaigns: CampaignInsight[];
  dailySpend: DailySpend[];
  totals: {
    spend: number;
    impressions: number;
    clicks: number;
    ctr: number;
    cpc: number;
  };
  generatedAt: string;
};
