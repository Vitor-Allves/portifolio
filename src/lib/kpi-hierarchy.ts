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

// ---------------------------------------------------------------------------
// Objective groups — same idea as OBJECTIVE_PRIMARY above, but as a label
// used to decide which campaigns are "comparable" to each other (never
// compare a reach campaign's CPC against a messages campaign's, even within
// the same account) and which single indicator best represents "resultado"
// for that group in strategic-insights.ts's rule engine.
// ---------------------------------------------------------------------------

export type ObjectiveGroup = "awareness" | "traffic" | "engagement" | "messages" | "conversion-other" | "unknown";

const OBJECTIVE_GROUP_BY_RAW: Record<string, ObjectiveGroup> = {
  OUTCOME_AWARENESS: "awareness",
  BRAND_AWARENESS: "awareness",
  REACH: "awareness",

  OUTCOME_TRAFFIC: "traffic",
  LINK_CLICKS: "traffic",

  OUTCOME_ENGAGEMENT: "engagement",
  POST_ENGAGEMENT: "engagement",
  VIDEO_VIEWS: "engagement",

  MESSAGES: "messages",

  OUTCOME_LEADS: "conversion-other",
  LEAD_GENERATION: "conversion-other",
  OUTCOME_SALES: "conversion-other",
  CONVERSIONS: "conversion-other",
  OUTCOME_APP_PROMOTION: "conversion-other",
  APP_INSTALLS: "conversion-other",
  PRODUCT_CATALOG_SALES: "conversion-other",
  STORE_VISITS: "conversion-other",
};

export const OBJECTIVE_GROUP_LABEL: Record<ObjectiveGroup, string> = {
  awareness: "reconhecimento/alcance",
  traffic: "tráfego",
  engagement: "engajamento",
  messages: "mensagens",
  "conversion-other": "conversão (leads/vendas/outros)",
  unknown: "objetivo não informado",
};

/** The one metric that best represents "resultado" for a group — never cost-per-conversation for an awareness campaign, never a fabricated conversion rate for an objective this dashboard can't measure. */
export const OBJECTIVE_GROUP_RESULT_METRIC: Record<ObjectiveGroup, KpiId> = {
  awareness: "reach",
  traffic: "clicks",
  engagement: "clicks",
  messages: "costPerConversation",
  "conversion-other": "clicks",
  unknown: "spend",
};

export function objectiveGroup(objective: string | null): ObjectiveGroup {
  if (objective === null) return "unknown";
  return OBJECTIVE_GROUP_BY_RAW[objective] ?? "unknown";
}
