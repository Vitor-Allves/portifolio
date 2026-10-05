// Plain types + the canonical catalog of everything a report (PDF/CSV) can
// include — shared by the "Montar relatório" drawer (client), the admin
// permission editor (client), and every server-side validation/gating path
// (report-data.ts, pdf-report-core.ts). One list, one set of labels, so the
// drawer, the admin's "seleção padrão" checklist and the server's allow-list
// can never drift apart or disagree on an id's name.
//
// Two different kinds of thing share one id space here:
//  - a CampaignColumnId (already defined in client-permissions.ts) — a
//    column/KPI with its own per-client hiddenColumns gate;
//  - a ReportBlockId below — a whole section (a chart, a table, a block of
//    cards) that isn't a single campaign-table column and has no
//    hiddenColumns equivalent of its own.
// No "use client", no server-only imports — safe from the drawer, the admin
// form, and every server route alike.

import { CAMPAIGN_COLUMN_OPTIONS, type CampaignColumnId } from "./client-permissions";

export type ReportType = "simplificado" | "tecnico";

export const REPORT_TYPE_OPTIONS: { id: ReportType; label: string }[] = [
  { id: "simplificado", label: "Simplificado" },
  { id: "tecnico", label: "Técnico" },
];

/** Whole sections with no per-column id of their own. */
export type ReportBlockId =
  | "trendChart"
  | "compare"
  | "strategicInsights"
  | "spendByCampaign"
  | "campaignRanking"
  | "campaignHierarchy"
  | "bestAds"
  | "audienceAge"
  | "audienceGender"
  | "audienceRegion"
  | "platformDistribution"
  | "deviceDistribution"
  | "topHours"
  | "resultsByObjective"
  | "budgetPacing";

export type ReportIndicatorId = CampaignColumnId | ReportBlockId;

export const REPORT_BLOCK_OPTIONS: { id: ReportBlockId; label: string }[] = [
  { id: "trendChart", label: "Evolução no período (gráfico)" },
  { id: "compare", label: "Comparação com o período anterior" },
  { id: "strategicInsights", label: "Análises estratégicas (leitura automática)" },
  { id: "spendByCampaign", label: "Investimento por campanha" },
  { id: "campaignRanking", label: "Ranking de campanhas" },
  { id: "campaignHierarchy", label: "Campanha → conjunto → anúncio" },
  { id: "bestAds", label: "Melhores anúncios" },
  { id: "audienceAge", label: "Público por idade" },
  { id: "audienceGender", label: "Público por gênero" },
  { id: "audienceRegion", label: "Público por região" },
  { id: "platformDistribution", label: "Distribuição por plataforma" },
  { id: "deviceDistribution", label: "Distribuição por dispositivo" },
  { id: "topHours", label: "Melhores horários" },
  { id: "resultsByObjective", label: "Resultados por objetivo" },
  { id: "budgetPacing", label: "Orçamento do mês (ritmo de investimento)" },
];

/** "Indicadores principais" — the 4 the brief names explicitly. */
export const PRIMARY_INDICATOR_IDS: CampaignColumnId[] = ["spend", "impressions", "clicks", "ctr"];

/** "Outros indicadores" — the 7 the brief names explicitly (all exist today; "Custo por lead" does not — see the delivery checklist). */
export const SECONDARY_INDICATOR_IDS: CampaignColumnId[] = [
  "linkClicks",
  "conversations",
  "costPerConversation",
  "cpc",
  "cpm",
  "reach",
  "leads",
];

const NAMED_COLUMN_IDS = new Set<CampaignColumnId>([...PRIMARY_INDICATOR_IDS, ...SECONDARY_INDICATOR_IDS]);

/** Every other campaign-table column the brief didn't name explicitly but that exists today ("se o PDF tiver algum bloco que não está nesta lista, inclua também, usando os mesmos nomes que já aparecem no painel") — account/status/objective/resultado principal plus the Pixel/CAPI and engagement extras. */
export const OTHER_COLUMN_OPTIONS = CAMPAIGN_COLUMN_OPTIONS.filter((o) => !NAMED_COLUMN_IDS.has(o.id));

export type IndicatorGroupId = "primary" | "secondary" | "resultsByObjective" | "budgetPacing" | "blocks" | "otherColumns";

export type IndicatorOption = { id: ReportIndicatorId; label: string };

export const INDICATOR_GROUPS: { id: IndicatorGroupId; label: string; options: IndicatorOption[] }[] = [
  { id: "primary", label: "Indicadores principais", options: CAMPAIGN_COLUMN_OPTIONS.filter((o) => PRIMARY_INDICATOR_IDS.includes(o.id)) },
  { id: "secondary", label: "Outros indicadores", options: CAMPAIGN_COLUMN_OPTIONS.filter((o) => SECONDARY_INDICATOR_IDS.includes(o.id)) },
  { id: "resultsByObjective", label: "Resultados por objetivo", options: [{ id: "resultsByObjective", label: "Resultados por objetivo" }] },
  { id: "budgetPacing", label: "Orçamento do mês", options: [{ id: "budgetPacing", label: "Orçamento do mês (ritmo de investimento)" }] },
  {
    id: "blocks",
    label: "Blocos",
    options: REPORT_BLOCK_OPTIONS.filter((o) => o.id !== "resultsByObjective" && o.id !== "budgetPacing"),
  },
  { id: "otherColumns", label: "Outras colunas da tabela", options: OTHER_COLUMN_OPTIONS },
];

export const ALL_INDICATOR_IDS: ReportIndicatorId[] = INDICATOR_GROUPS.flatMap((g) => g.options.map((o) => o.id));
export const ALL_INDICATOR_LABELS: Record<string, string> = Object.fromEntries(
  INDICATOR_GROUPS.flatMap((g) => g.options.map((o) => [o.id, o.label] as const))
);

const VALID_INDICATOR_IDS = new Set<string>(ALL_INDICATOR_IDS);

export function isReportIndicatorId(value: unknown): value is ReportIndicatorId {
  return typeof value === "string" && VALID_INDICATOR_IDS.has(value);
}

/** Normalizes arbitrary input (a request body, a JSONB column) into a de-duplicated, valid ReportIndicatorId list — unknown ids are dropped rather than rejected. */
export function sanitizeIndicatorIds(input: unknown): ReportIndicatorId[] {
  if (!Array.isArray(input)) return [];
  const seen = new Set<ReportIndicatorId>();
  for (const v of input) {
    if (isReportIndicatorId(v)) seen.add(v);
  }
  return [...seen];
}

function isCampaignColumnId(id: ReportIndicatorId): id is CampaignColumnId {
  return CAMPAIGN_COLUMN_OPTIONS.some((o) => o.id === id);
}

export function isReportBlockId(id: ReportIndicatorId): id is ReportBlockId {
  return !isCampaignColumnId(id);
}

export { isCampaignColumnId };

/** Minimal shape of a campaign row this check needs — avoids importing the full CampaignInsight type just for a handful of nullable fields. */
export type NullableIndicatorRow = {
  conversations: number | null;
  purchases: number | null;
  purchaseValue: number | null;
  leads: number | null;
  addToCart: number | null;
  completeRegistrations: number | null;
  postEngagement: number | null;
  videoViews: number | null;
  videoCompletions: number | null;
  outboundClicks: number | null;
  uniqueClicks: number | null;
  estimatedAdRecallers: number | null;
};

const NULLABLE_FIELD_FOR_INDICATOR: Partial<Record<ReportIndicatorId, keyof NullableIndicatorRow>> = {
  conversations: "conversations",
  costPerConversation: "conversations",
  purchases: "purchases",
  purchaseValue: "purchaseValue",
  roas: "purchaseValue",
  leads: "leads",
  addToCart: "addToCart",
  completeRegistrations: "completeRegistrations",
  postEngagement: "postEngagement",
  videoViews: "videoViews",
  videoCompletions: "videoCompletions",
  videoAvgWatchTimeSeconds: "videoViews",
  outboundClicks: "outboundClicks",
  uniqueClicks: "uniqueClicks",
  estimatedAdRecallers: "estimatedAdRecallers",
  estimatedAdRecallRate: "estimatedAdRecallers",
};

/** "Indicador sem dado no período aparece desabilitado" (Parte 1) — true unless this id is one of the structurally-nullable fields AND every row in scope is null for it. A column that's merely always zero still "has data"; only a field the account/objective never reports at all (Pixel/CAPI not configured, non-messaging objective, …) counts as unavailable. */
export function hasDataForIndicator(id: ReportIndicatorId, campaigns: readonly NullableIndicatorRow[]): boolean {
  const field = NULLABLE_FIELD_FOR_INDICATOR[id];
  if (!field) return true;
  if (campaigns.length === 0) return true;
  return campaigns.some((c) => c[field] !== null);
}
