// Which KPIs deserve top billing depends on what the filtered campaigns are
// actually optimizing for — a conversion metric (Conversa iniciada, Custo/
// Conversa) is only meaningful as a "primary" indicator when every visible
// campaign shares that kind of objective. The moment objectives are mixed
// (or absent), primary billing falls back to general delivery indicators
// that apply to any campaign regardless of what it's optimizing for —
// spend, reach and volume are always legible, a conversion rate isn't.

import type { CampaignInsight } from "./meta-ads-types";

export type KpiId = "spend" | "impressions" | "clicks" | "linkClicks" | "costPerConversation" | "ctr" | "cpc" | "cpm" | "reach";

const GENERAL_PRIMARY: KpiId[] = ["spend", "impressions", "clicks", "reach"];

// Meta's raw objective strings (see campaign-labels.ts's OBJECTIVE_LABELS
// for the same set) grouped by what they're actually optimizing for.
const OBJECTIVE_PRIMARY: Record<string, KpiId[]> = {
  OUTCOME_AWARENESS: ["reach", "impressions", "cpm", "spend"],
  BRAND_AWARENESS: ["reach", "impressions", "cpm", "spend"],
  REACH: ["reach", "impressions", "cpm", "spend"],

  OUTCOME_TRAFFIC: ["clicks", "ctr", "cpc", "spend"],
  LINK_CLICKS: ["clicks", "ctr", "cpc", "spend"],

  OUTCOME_ENGAGEMENT: ["clicks", "ctr", "impressions", "spend"],
  POST_ENGAGEMENT: ["clicks", "ctr", "impressions", "spend"],
  VIDEO_VIEWS: ["clicks", "ctr", "impressions", "spend"],

  OUTCOME_LEADS: ["linkClicks", "costPerConversation", "ctr", "spend"],
  LEAD_GENERATION: ["linkClicks", "costPerConversation", "ctr", "spend"],
  MESSAGES: ["linkClicks", "costPerConversation", "ctr", "spend"],
  OUTCOME_SALES: ["linkClicks", "costPerConversation", "ctr", "spend"],
  CONVERSIONS: ["linkClicks", "costPerConversation", "ctr", "spend"],
  OUTCOME_APP_PROMOTION: ["linkClicks", "costPerConversation", "ctr", "spend"],
  APP_INSTALLS: ["linkClicks", "costPerConversation", "ctr", "spend"],
  PRODUCT_CATALOG_SALES: ["linkClicks", "costPerConversation", "ctr", "spend"],
  STORE_VISITS: ["linkClicks", "costPerConversation", "ctr", "spend"],
};

/**
 * The 4 KPIs to highlight for this set of campaigns. Falls back to the
 * general set whenever objectives are mixed, absent, or unrecognized —
 * never presents a conversion-specific metric as if it applied to every
 * campaign in view when some of them aren't actually optimizing for it.
 */
export function primaryKpiIds(campaigns: CampaignInsight[]): KpiId[] {
  const objectives = new Set(campaigns.map((c) => c.objective).filter((o): o is string => o !== null));
  if (objectives.size !== 1) return GENERAL_PRIMARY;
  const [objective] = objectives;
  return OBJECTIVE_PRIMARY[objective] ?? GENERAL_PRIMARY;
}
