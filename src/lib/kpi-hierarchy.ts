// Which KPIs deserve top billing depends on what the filtered campaigns are
// actually optimizing for — a conversion metric (Conversa iniciada, Custo/
// Conversa) is only meaningful as a "primary" indicator when every visible
// campaign shares that kind of objective. The moment objectives are mixed
// (or absent), primary billing falls back to general delivery indicators
// that apply to any campaign regardless of what it's optimizing for —
// spend, reach and volume are always legible, a conversion rate isn't.

import type { CampaignInsight } from "./meta-ads-types";

export type KpiId =
  | "spend"
  | "impressions"
  | "clicks"
  | "linkClicks"
  | "conversations"
  | "costPerConversation"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach";

const GENERAL_PRIMARY: KpiId[] = ["spend", "impressions", "clicks", "reach"];

// Meta's raw objective strings (see campaign-labels.ts's OBJECTIVE_LABELS
// for the same set) grouped by what they're actually optimizing for.
//
// "conversations" (onsite_conversion.messaging_conversation_started_7d) is
// only meaningful for the MESSAGES objective — it counts conversations
// started on Messenger/Instagram/WhatsApp, not leads, purchases or app
// installs. Those other conversion-style objectives each have their own
// distinct Meta action_type (lead, purchase, mobile_app_install, ...) which
// this dashboard does not parse yet, so they fall back to the honest,
// objective-agnostic click metrics below rather than being mislabeled with
// a conversation count that doesn't apply to them.
const OBJECTIVE_PRIMARY: Record<string, KpiId[]> = {
  OUTCOME_AWARENESS: ["reach", "impressions", "cpm", "spend"],
  BRAND_AWARENESS: ["reach", "impressions", "cpm", "spend"],
  REACH: ["reach", "impressions", "cpm", "spend"],

  OUTCOME_TRAFFIC: ["clicks", "ctr", "cpc", "spend"],
  LINK_CLICKS: ["clicks", "ctr", "cpc", "spend"],

  OUTCOME_ENGAGEMENT: ["clicks", "ctr", "impressions", "spend"],
  POST_ENGAGEMENT: ["clicks", "ctr", "impressions", "spend"],
  VIDEO_VIEWS: ["clicks", "ctr", "impressions", "spend"],

  MESSAGES: ["conversations", "costPerConversation", "ctr", "spend"],

  OUTCOME_LEADS: ["clicks", "ctr", "cpc", "spend"],
  LEAD_GENERATION: ["clicks", "ctr", "cpc", "spend"],
  OUTCOME_SALES: ["clicks", "ctr", "cpc", "spend"],
  CONVERSIONS: ["clicks", "ctr", "cpc", "spend"],
  OUTCOME_APP_PROMOTION: ["clicks", "ctr", "cpc", "spend"],
  APP_INSTALLS: ["clicks", "ctr", "cpc", "spend"],
  PRODUCT_CATALOG_SALES: ["clicks", "ctr", "cpc", "spend"],
  STORE_VISITS: ["clicks", "ctr", "cpc", "spend"],
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
