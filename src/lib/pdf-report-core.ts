// Pure, framework-agnostic PDF document builder — no "use client", no fetch,
// no DOM/FileReader. jsPDF/jspdf-autotable are isomorphic (verified: fonts,
// embedded images and tables all render correctly from plain Node), so this
// same module runs both server-side (the permission-enforcing API route —
// see /api/analise/reports/pdf) and, via pdf-report.ts's thin client
// wrapper, in the browser for local/dev use. Never import "react" or any
// browser-only API here.
//
// Layout is intentionally uniform A4 landscape on every page (cover
// included) — no portrait-to-landscape jump — with a repeated header/footer
// drawn by the same two functions everywhere, so the document reads as one
// consistent artifact rather than a screenshot glued to a data dump.
//
// Permission model: every field a viewer isn't authorized to see is passed
// through `allowedColumns` (mirroring client-permissions.ts's own
// CampaignColumnId set — the single source of truth also used by the live
// dashboard) and is never drawn — not as a card, a column, a chart axis, or
// a sentence in the automated analysis. The caller (the server route) is
// responsible for computing `allowedColumns` from the actual recipient's
// permissions; this module only ever consults that set, never a client-
// supplied list of what to show.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  AdSetInsight,
  AudienceSegment,
  CampaignInsight,
  DateRange,
  RegionSegment,
  PlatformSegment,
  DeviceSegment,
  HourSegment,
} from "./meta-ads-types";
import type { CampaignColumnId } from "./client-permissions";
import { objectiveLabel, statusLabel } from "./campaign-labels";
import {
  formatCurrencyBRL,
  formatInteger,
  formatPercent,
  formatSignedPercent,
  formatSignedPercentagePoints,
  formatShortDate,
  formatDateTimeTz,
  REFERENCE_TIME_ZONE,
} from "./format";
import {
  sumTotals,
  ctr,
  cpc,
  cpm,
  costPerConversation,
  roas,
  pctChange,
  aggregateDailyByDate,
  primaryResultKind,
  primaryResultFor,
  PRIMARY_RESULT_LABEL,
  type Totals,
} from "./metrics";
import { computeStrategicInsights } from "./strategic-insights";
import { primaryKpiIds, type KpiId } from "./kpi-hierarchy";

// ---------------------------------------------------------------------------
// Public input/output types
// ---------------------------------------------------------------------------

/** Every CampaignColumnId the recipient is authorized to see — computed by the caller from the SAME ClientPermissions record the live dashboard uses (never a parallel, independently-maintained list). */
export type AllowedColumns = ReadonlySet<CampaignColumnId>;

export type ReportPdfInput = {
  /** Report/template name — shown as the small caption under the client name. */
  title: string;
  /** Business name for a client-scoped report, or null for a consolidated multi-account view. */
  clientLabel: string | null;
  /**
   * True when a specific recipient's permissions were actually resolved and
   * applied (the client generated their own report, or an admin generated
   * one explicitly on behalf of a named client). False for an admin's own
   * unrestricted, all-metrics export — in that case the "Permissões
   * aplicadas" methodology note is omitted entirely, since there's no
   * recipient-specific permission set to describe.
   */
  isClientScoped: boolean;
  allowedColumns: AllowedColumns;
  /** Accounts actually represented in `campaigns` (already permission-filtered upstream — never more than the caller is allowed to see). */
  accounts: { id: string; name: string }[];
  periodLabel: string;
  resolvedRange: DateRange;
  compare: boolean;
  comparisonRange: DateRange | null;
  /** Human-readable "Label: valor" pairs for every active filter, ready to print as-is. */
  filters: { label: string; value: string }[];
  /** When this document is being generated (the server or browser's clock). */
  generatedAt: Date;
  /** The dashboard payload's own generatedAt (ISO) — "última atualização dos dados", distinct from generatedAt above. */
  dataGeneratedAt: string;
  /** Which sections to draw — see PdfReportType. */
  reportType: PdfReportType;
  campaigns: CampaignInsight[];
  comparisonCampaigns: CampaignInsight[] | null;
  /**
   * Every ad set belonging to `campaigns` (account/campaign/objective/status
   * filters already applied) — NOT yet narrowed by an ad-set filter, so the
   * builder can report "N de M conjuntos" when `selectedAdSetIds` narrows
   * further. Ad sets outside `campaigns`' scope must never be included.
   */
  adSets: AdSetInsight[];
  /** null = no ad-set filter active (list every ad set in `adSets` for each campaign); otherwise only these ids are actually detailed, with the rest counted in the "N de M" note. */
  selectedAdSetIds: Set<string> | null;
  /** Raw per-account daily rows, already scoped to the selected accounts — NOT pre-aggregated, so per-account breakdowns stay possible. */
  daily: { accountId: string; date: string; spend: number; impressions: number; clicks: number; linkClicks: number; conversations: number | null; reach: number }[];
  comparisonDaily: ReportPdfInput["daily"] | null;
  /**
   * Meta's own deduplicated reach for exactly the filters above, already
   * summed across accounts by the caller — null means it could not be
   * apurado com confiança for this filter combination (never a silent
   * fallback to an unfiltered/consolidated number). See the same-named
   * outcome in Dashboard.tsx for how this is produced.
   */
  reach: number | null;
  comparisonReach: number | null;
  audience: AudienceSegment[];
  regions: RegionSegment[];
  platforms: PlatformSegment[];
  devices: DeviceSegment[];
  hours: HourSegment[];
  /** Accounts that failed to load for this request — surfaced so totals are never mistaken for "genuinely zero". */
  partialAccountNames: string[];
};

export type ReportAssets = {
  /** Legado Intelligence's colored logo — used in the repeated header and on the cover page. */
  logoDataUrl: string | null;
  /** Titan waving — the cover page and, alongside legacyOlaDataUrl, the opening page's info block. */
  titanBoasVindasDataUrl: string | null;
  /** Legacy waving — the cover page, the opening page's info block, and the closing block. */
  legacyOlaDataUrl: string | null;
  /** Titan pointing at the numbers — small accent next to "Resumo executivo". */
  titanIndicadoresDataUrl: string | null;
  montserratRegular: string | null;
  montserratSemiBold: string | null;
  montserratBold: string | null;
  cinzelBold: string | null;
};

export class ReportPdfError extends Error {}

/**
 * Which sections buildReportPdf draws. "detailed" is the original full
 * report (unchanged). "executive" keeps only what a decision-maker reads in
 * one pass: headline KPIs, the executive summary, the evolution charts and
 * the strategic analysis — no campaign-by-campaign detail, no distribution
 * breakdowns. "audience" flips that: only the audience/distribution
 * breakdowns (age/gender, region, platform/device, hour), nothing else.
 */
export type PdfReportType = "executive" | "detailed" | "audience";

// ---------------------------------------------------------------------------
// Brand tokens (print/light identity — deliberately NOT the dashboard's dark
// cyan-accented theme: this is the identity the brief asks for on paper).
// ---------------------------------------------------------------------------

const NAVY: [number, number, number] = [31, 58, 99]; // #1F3A63
const NAVY_DEEP: [number, number, number] = [18, 33, 57];
const SILVER: [number, number, number] = [191, 195, 201]; // #BFC3C9
const SILVER_TINT: [number, number, number] = [241, 243, 245];
const BORDER: [number, number, number] = [219, 223, 228];
const TEXT: [number, number, number] = [33, 41, 54];
const TEXT_MUTED: [number, number, number] = [104, 113, 128];
const GOOD: [number, number, number] = [21, 128, 61];
const BAD: [number, number, number] = [185, 28, 28];
const WHITE: [number, number, number] = [255, 255, 255];

const PAGE_W = 297;
const PAGE_H = 210;
const MARGIN_X = 14;
const HEADER_BOTTOM = 24;
const FOOTER_TOP = PAGE_H - 14;
const CONTENT_W = PAGE_W - MARGIN_X * 2;

// Fixed width/height ratios of the source art (public/brand/pdf/*.png) —
// hardcoded rather than read from the image bytes since these are our own
// curated, never-user-supplied assets; update these if the source files are
// ever re-exported at different pixel dimensions.
const TITAN_ASPECT_WH = 512 / 768;
const LEGACY_ASPECT_WH = 540 / 768;
const LOGO_ASPECT_WH = 1168 / 1270;

type Fonts = { body: string; heading: string };

type Ctx = {
  fonts: Fonts;
  assets: ReportAssets;
  scopeLine: string;
  periodLine: string;
  footerLeft: string;
};

// ---------------------------------------------------------------------------
// Font registration (isomorphic — both loaders below produce the same
// data-URL shaped ReportAssets, only how the bytes are fetched differs)
// ---------------------------------------------------------------------------

export function dataUrlToBase64(dataUrl: string): string {
  const comma = dataUrl.indexOf(",");
  return comma === -1 ? dataUrl : dataUrl.slice(comma + 1);
}

/** Registers embedded fonts on the doc, falling back to jsPDF's built-in Helvetica for any family that failed to load. Fonts are subset by jsPDF to only the glyphs actually used, so the size cost stays modest. */
function registerFonts(doc: jsPDF, assets: ReportAssets): Fonts {
  let bodyOk = false;
  try {
    if (assets.montserratRegular) {
      doc.addFileToVFS("Montserrat-Regular.ttf", dataUrlToBase64(assets.montserratRegular));
      doc.addFont("Montserrat-Regular.ttf", "Montserrat", "normal");
      bodyOk = true;
    }
    if (assets.montserratSemiBold) {
      doc.addFileToVFS("Montserrat-SemiBold.ttf", dataUrlToBase64(assets.montserratSemiBold));
      doc.addFont("Montserrat-SemiBold.ttf", "MontserratMed", "normal");
    }
    if (assets.montserratBold) {
      doc.addFileToVFS("Montserrat-Bold.ttf", dataUrlToBase64(assets.montserratBold));
      doc.addFont("Montserrat-Bold.ttf", "Montserrat", "bold");
    }
  } catch {
    bodyOk = false;
  }
  let headingOk = false;
  try {
    if (assets.cinzelBold) {
      doc.addFileToVFS("Cinzel-Bold.ttf", dataUrlToBase64(assets.cinzelBold));
      doc.addFont("Cinzel-Bold.ttf", "Cinzel", "bold");
      headingOk = true;
    }
  } catch {
    headingOk = false;
  }
  return { body: bodyOk ? "Montserrat" : "helvetica", heading: headingOk ? "Cinzel" : "helvetica" };
}

/** "MontserratMed" (semibold) is only registered when Montserrat itself loaded — falls back to bold body font otherwise, since helvetica has no semibold slot. */
function medFont(doc: jsPDF, fonts: Fonts): { family: string; style: "normal" | "bold" } {
  if (fonts.body !== "Montserrat") return { family: fonts.body, style: "bold" };
  const list = doc.getFontList();
  return list["MontserratMed"] ? { family: "MontserratMed", style: "normal" } : { family: "Montserrat", style: "bold" };
}

// ---------------------------------------------------------------------------
// Small drawing primitives
// ---------------------------------------------------------------------------

function setColor(doc: jsPDF, fn: "setTextColor" | "setDrawColor" | "setFillColor", c: [number, number, number]) {
  if (fn === "setTextColor") doc.setTextColor(c[0], c[1], c[2]);
  else if (fn === "setDrawColor") doc.setDrawColor(c[0], c[1], c[2]);
  else doc.setFillColor(c[0], c[1], c[2]);
}

function drawHeader(doc: jsPDF, ctx: Ctx) {
  setColor(doc, "setFillColor", NAVY);
  doc.rect(0, 0, PAGE_W, 2.4, "F");

  let x = MARGIN_X;
  const logoSize = 12;
  if (ctx.assets.logoDataUrl) {
    try {
      doc.addImage(ctx.assets.logoDataUrl, "PNG", x, 7, logoSize, logoSize);
      x += logoSize + 5;
    } catch {
      // A corrupt/unsupported logo asset never blocks the report itself.
    }
  }

  doc.setFont(ctx.fonts.heading, "bold");
  doc.setFontSize(13.5);
  setColor(doc, "setTextColor", NAVY);
  doc.text("LEGADO INTELLIGENCE", x, 12.5);

  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(8.5);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(ctx.scopeLine, x, 18);

  doc.setFontSize(8.5);
  doc.text(ctx.periodLine, PAGE_W - MARGIN_X, 12.5, { align: "right" });
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text("Legado Intelligence · Relatório executivo", PAGE_W - MARGIN_X, 18, { align: "right" });

  setColor(doc, "setDrawColor", BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, HEADER_BOTTOM - 3, PAGE_W - MARGIN_X, HEADER_BOTTOM - 3);
}

/** Small label drawn in the reserved header gutter on a table's continuation pages — "Campanha X — continuação" — so a reader who jumps straight to page 6 of 9 can still tell which campaign's ad sets they're looking at. */
function drawContinuationLabel(doc: jsPDF, ctx: Ctx, label: string) {
  doc.setFont(ctx.fonts.body, "bold");
  doc.setFontSize(8);
  setColor(doc, "setTextColor", NAVY);
  doc.text(label, MARGIN_X, HEADER_BOTTOM + 5.5);
  void ctx;
}

function drawFooter(doc: jsPDF, ctx: Ctx, pageIdx: number, totalPages: number) {
  setColor(doc, "setDrawColor", BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, FOOTER_TOP, PAGE_W - MARGIN_X, FOOTER_TOP);
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(7.5);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(ctx.footerLeft, MARGIN_X, FOOTER_TOP + 5);
  doc.text(`Página ${pageIdx} de ${totalPages}`, PAGE_W - MARGIN_X, FOOTER_TOP + 5, { align: "right" });
}

function newPage(doc: jsPDF, ctx: Ctx): number {
  doc.addPage("a4", "landscape");
  drawHeader(doc, ctx);
  return HEADER_BOTTOM + 6;
}

function ensureSpace(doc: jsPDF, ctx: Ctx, y: number, needed: number): number {
  if (y + needed > FOOTER_TOP - 2) return newPage(doc, ctx);
  return y;
}

function sectionTitle(doc: jsPDF, ctx: Ctx, y: number, label: string): number {
  doc.setFont(ctx.fonts.heading, "bold");
  doc.setFontSize(12.5);
  setColor(doc, "setTextColor", NAVY);
  doc.text(label.toUpperCase(), MARGIN_X, y);
  setColor(doc, "setDrawColor", NAVY);
  doc.setLineWidth(0.6);
  doc.line(MARGIN_X, y + 2, MARGIN_X + 22, y + 2);
  return y + 9;
}

function wrapText(doc: jsPDF, text: string, maxWidth: number): string[] {
  return doc.splitTextToSize(text, maxWidth) as string[];
}

// ---------------------------------------------------------------------------
// Metric catalog — the single list every KPI card, chart and table column
// draws from, and the thing `allowedColumns` filters before anything is
// drawn. `T` is any row shape with the base Totals fields plus `reach` —
// CampaignInsight and AdSetInsight both qualify, so campaign cards and ad-
// set tables share one definition list instead of two parallel ones that
// could quietly drift apart.
// ---------------------------------------------------------------------------

type MetricRow = Totals & { reach: number };

type MetricColDef = {
  id: KpiId;
  label: string;
  format: (n: number) => string;
  /** Text shown when value(row) is null — "Não disponível" for a metric that genuinely doesn't apply (conversations), "—" for a plain division-by-zero (rates). */
  unavailableText: string;
  value: (row: MetricRow) => number | null;
};

const METRIC_DEFS: Record<KpiId, MetricColDef> = {
  spend: { id: "spend", label: "Investimento", format: formatCurrencyBRL, unavailableText: "—", value: (t) => t.spend },
  impressions: { id: "impressions", label: "Impressões", format: formatInteger, unavailableText: "—", value: (t) => t.impressions },
  reach: { id: "reach", label: "Alcance", format: formatInteger, unavailableText: "—", value: (t) => t.reach },
  cpm: { id: "cpm", label: "CPM", format: formatCurrencyBRL, unavailableText: "—", value: (t) => cpm(t) },
  clicks: { id: "clicks", label: "Cliques totais", format: formatInteger, unavailableText: "—", value: (t) => t.clicks },
  linkClicks: { id: "linkClicks", label: "Cliques no link", format: formatInteger, unavailableText: "—", value: (t) => t.linkClicks },
  ctr: { id: "ctr", label: "CTR", format: (n) => formatPercent(n), unavailableText: "—", value: (t) => ctr(t) },
  cpc: { id: "cpc", label: "CPC", format: formatCurrencyBRL, unavailableText: "—", value: (t) => cpc(t) },
  conversations: { id: "conversations", label: "Conversa iniciada", format: formatInteger, unavailableText: "Não disponível", value: (t) => t.conversations },
  costPerConversation: { id: "costPerConversation", label: "Custo/conversa", format: formatCurrencyBRL, unavailableText: "—", value: (t) => costPerConversation(t) },
};

/** "Entrega" vs. "Interação e resultado" — the same two logical groups the campaign table has always used, reused now for ad sets too so the split (when there are enough allowed metrics to need one) reads consistently at both levels. */
const METRIC_GROUP_A: KpiId[] = ["spend", "impressions", "reach", "cpm"];
const METRIC_GROUP_B: KpiId[] = ["clicks", "linkClicks", "ctr", "cpc", "conversations", "costPerConversation"];

function isAllowed(allowed: AllowedColumns, id: CampaignColumnId): boolean {
  return allowed.has(id);
}

// For KpiDef ids whose *display* should be gated on a raw structural field
// being populated (Pixel/CAPI never configured, ad objective doesn't support
// messaging, etc.) rather than on the derived value itself, which can be
// null for the unrelated reason of a zero denominator (e.g. "Custo por
// conversa" is null both when conversations isn't tracked at all AND when
// conversations is a real, reportable zero for the period — only the first
// case should hide the card). ctr/cpc/cpm and the raw spend/impressions/
// clicks/linkClicks fields are never structurally absent, so they're simply
// left out of this map and always considered populated.
const STRUCTURAL_GATE: Partial<Record<CampaignColumnId, (t: Totals) => boolean>> = {
  conversations: (t) => t.conversations !== null,
  costPerConversation: (t) => t.conversations !== null,
  purchases: (t) => t.purchases !== null,
  purchaseValue: (t) => t.purchaseValue !== null,
  roas: (t) => t.purchaseValue !== null,
  leads: (t) => t.leads !== null,
  addToCart: (t) => t.addToCart !== null,
  completeRegistrations: (t) => t.completeRegistrations !== null,
  postEngagement: (t) => t.postEngagement !== null,
  videoViews: (t) => t.videoViews !== null,
  videoCompletions: (t) => t.videoCompletions !== null,
  outboundClicks: (t) => t.outboundClicks !== null,
  uniqueClicks: (t) => t.uniqueClicks !== null,
  estimatedAdRecallers: (t) => t.estimatedAdRecallers !== null,
};

/** True when this KPI genuinely has something to report — never true/false based on permission (that's isAllowed's job), only on whether the underlying data exists at all. A KpiDef never named in STRUCTURAL_GATE (spend/impressions/clicks/linkClicks/ctr/cpc/cpm) is always populated. "reach" is gated on the reach argument since a null reach means "couldn't be apurado com confiança", not a real zero. */
function isKpiPopulated(def: KpiDef, totals: Totals, reach: number | null): boolean {
  if (def.id === "reach") return reach !== null;
  const gate = STRUCTURAL_GATE[def.id];
  return gate ? gate(totals) : true;
}

function allowedMetricDefs(allowed: AllowedColumns, ids: KpiId[]): MetricColDef[] {
  return ids.filter((id) => isAllowed(allowed, id)).map((id) => METRIC_DEFS[id]);
}

function formatMetricCell(def: MetricColDef, row: MetricRow): string {
  const raw = def.value(row);
  return raw === null ? def.unavailableText : def.format(raw);
}

// ---------------------------------------------------------------------------
// KPI grid (cover-page indicators — only the ones `allowedColumns` permits;
// a fully-restricted recipient simply gets a shorter grid, never a blank
// card or a placeholder hinting at what's hidden)
// ---------------------------------------------------------------------------

type DeltaPolarity = "higher-better" | "lower-better" | "neutral";

type KpiDef = {
  id: CampaignColumnId;
  label: string;
  polarity: DeltaPolarity;
  isPercent: boolean; // percentage-point delta instead of relative % delta
  value: (t: Totals, reach: number | null) => number | null;
  format: (n: number) => string;
};

const KPI_DEFS: KpiDef[] = [
  { id: "spend", label: "Investimento", polarity: "neutral", isPercent: false, value: (t) => t.spend, format: formatCurrencyBRL },
  { id: "impressions", label: "Impressões", polarity: "neutral", isPercent: false, value: (t) => t.impressions, format: formatInteger },
  { id: "clicks", label: "Cliques totais", polarity: "higher-better", isPercent: false, value: (t) => t.clicks, format: formatInteger },
  { id: "linkClicks", label: "Cliques no link", polarity: "higher-better", isPercent: false, value: (t) => t.linkClicks, format: formatInteger },
  { id: "conversations", label: "Conversa iniciada", polarity: "higher-better", isPercent: false, value: (t) => t.conversations, format: formatInteger },
  { id: "costPerConversation", label: "Custo por conversa", polarity: "lower-better", isPercent: false, value: (t) => costPerConversation(t), format: formatCurrencyBRL },
  { id: "ctr", label: "CTR", polarity: "higher-better", isPercent: true, value: (t) => ctr(t), format: (n) => formatPercent(n) },
  { id: "cpc", label: "CPC", polarity: "lower-better", isPercent: false, value: (t) => cpc(t), format: formatCurrencyBRL },
  { id: "cpm", label: "CPM", polarity: "lower-better", isPercent: false, value: (t) => cpm(t), format: formatCurrencyBRL },
  { id: "reach", label: "Alcance", polarity: "neutral", isPercent: false, value: (_t, reach) => reach, format: formatInteger },
];

// Same KpiDef/drawKpiGrid machinery as KPI_DEFS above, reused for the two
// supplementary grids below (Pixel/CAPI conversions + engagement/video) —
// deliberately NOT folded into KPI_DEFS/KpiId/primaryKpiIds: those exist to
// pick which 4 indicators lead the report based on campaign objective, and
// none of these metrics should ever compete for that "primary" billing.
const EXTRA_CONVERSION_KPI_DEFS: KpiDef[] = [
  { id: "purchases", label: "Compras", polarity: "higher-better", isPercent: false, value: (t) => t.purchases, format: formatInteger },
  { id: "purchaseValue", label: "Valor de compra", polarity: "higher-better", isPercent: false, value: (t) => t.purchaseValue, format: formatCurrencyBRL },
  { id: "roas", label: "ROAS", polarity: "higher-better", isPercent: false, value: (t) => roas(t), format: (n) => `${n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x` },
  { id: "leads", label: "Leads", polarity: "higher-better", isPercent: false, value: (t) => t.leads, format: formatInteger },
  { id: "addToCart", label: "Adicionar ao carrinho", polarity: "higher-better", isPercent: false, value: (t) => t.addToCart, format: formatInteger },
  { id: "completeRegistrations", label: "Cadastro completo", polarity: "higher-better", isPercent: false, value: (t) => t.completeRegistrations, format: formatInteger },
];

const EXTRA_ENGAGEMENT_KPI_DEFS: KpiDef[] = [
  { id: "postEngagement", label: "Engajamento", polarity: "higher-better", isPercent: false, value: (t) => t.postEngagement, format: formatInteger },
  { id: "videoViews", label: "Visualizações de vídeo", polarity: "higher-better", isPercent: false, value: (t) => t.videoViews, format: formatInteger },
  { id: "videoCompletions", label: "Vídeo assistido até o fim", polarity: "higher-better", isPercent: false, value: (t) => t.videoCompletions, format: formatInteger },
  { id: "outboundClicks", label: "Cliques para fora da plataforma", polarity: "higher-better", isPercent: false, value: (t) => t.outboundClicks, format: formatInteger },
  { id: "uniqueClicks", label: "Cliques únicos", polarity: "higher-better", isPercent: false, value: (t) => t.uniqueClicks, format: formatInteger },
  { id: "estimatedAdRecallers", label: "Pessoas que lembrarão do anúncio", polarity: "higher-better", isPercent: false, value: (t) => t.estimatedAdRecallers, format: formatInteger },
];

function deltaColor(delta: number, polarity: DeltaPolarity): [number, number, number] {
  if (polarity === "neutral" || Math.abs(delta) < 0.05) return TEXT_MUTED;
  const goingUp = delta > 0;
  const isGood = polarity === "higher-better" ? goingUp : !goingUp;
  return isGood ? GOOD : BAD;
}

const KPI_GRID_COLS = 3;
const KPI_GRID_GAP = 5;

function kpiGridHeight(defs: KpiDef[], hasComparison: boolean): number {
  if (defs.length === 0) return 0;
  const cardH = hasComparison ? 25 : 22;
  const rows = Math.ceil(defs.length / KPI_GRID_COLS);
  return rows * cardH + (rows - 1) * KPI_GRID_GAP + 8;
}

function drawKpiGrid(
  doc: jsPDF,
  ctx: Ctx,
  y: number,
  defs: KpiDef[],
  totals: Totals,
  reach: number | null,
  comparisonTotals: Totals | null,
  comparisonReach: number | null
): number {
  if (defs.length === 0) return y;
  const cols = KPI_GRID_COLS;
  const gap = KPI_GRID_GAP;
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cardH = ctx.periodLine && comparisonTotals ? 25 : 22;

  defs.forEach((def, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = MARGIN_X + col * (cardW + gap);
    const cardY = y + row * (cardH + gap);

    setColor(doc, "setDrawColor", BORDER);
    doc.setLineWidth(0.25);
    setColor(doc, "setFillColor", WHITE);
    doc.roundedRect(x, cardY, cardW, cardH, 1.6, 1.6, "FD");
    setColor(doc, "setFillColor", NAVY);
    doc.rect(x, cardY, 1.3, cardH, "F");

    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(7.6);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text(def.label.toUpperCase(), x + 5, cardY + 6.5);

    const raw = def.value(totals, reach);
    const valueText = raw === null ? "Não disponível para o período" : def.format(raw);
    doc.setFont(ctx.fonts.body, "bold");
    doc.setFontSize(raw === null ? 9.5 : 14.5);
    setColor(doc, "setTextColor", raw === null ? TEXT_MUTED : NAVY_DEEP);
    doc.text(valueText, x + 5, cardY + 15);

    if (comparisonTotals) {
      const prevRaw = def.value(comparisonTotals, comparisonReach);
      doc.setFont(ctx.fonts.body, "normal");
      doc.setFontSize(7.6);
      if (raw === null || prevRaw === null) {
        setColor(doc, "setTextColor", TEXT_MUTED);
        doc.text("Sem base de comparação", x + 5, cardY + 21.5);
      } else {
        const delta = def.isPercent ? raw - prevRaw : pctChange(raw, prevRaw);
        const deltaText = delta === null ? "—" : def.isPercent ? formatSignedPercentagePoints(delta) : formatSignedPercent(delta);
        setColor(doc, "setTextColor", delta === null ? TEXT_MUTED : deltaColor(delta, def.polarity));
        doc.text(`${deltaText} vs. período anterior`, x + 5, cardY + 21.5);
      }
    }
  });

  const rows = Math.ceil(defs.length / cols);
  return y + rows * cardH + (rows - 1) * gap + 8;
}

// ---------------------------------------------------------------------------
// Line chart (vector) — used for the evolution section
// ---------------------------------------------------------------------------

type LineSeries = { values: (number | null)[]; color: [number, number, number]; dashed?: boolean };

function drawLineChart(
  doc: jsPDF,
  ctx: Ctx,
  box: { x: number; y: number; w: number; h: number },
  opts: { title: string; caption: string; xLabels: string[]; series: LineSeries[]; formatValue: (n: number) => string; legend: { label: string; color: [number, number, number]; dashed?: boolean }[] }
) {
  doc.setFont(ctx.fonts.body, "bold");
  doc.setFontSize(9.5);
  setColor(doc, "setTextColor", NAVY);
  doc.text(opts.title, box.x, box.y + 4);
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(7.5);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(opts.caption, box.x, box.y + 9);

  const plot = { x: box.x + 22, y: box.y + 14, w: box.w - 24, h: box.h - 30 };
  const allValues = opts.series.flatMap((s) => s.values.filter((v): v is number => v !== null));
  const maxV = allValues.length > 0 ? Math.max(...allValues, 0.0001) : 1;

  setColor(doc, "setDrawColor", BORDER);
  doc.setLineWidth(0.2);
  const gridSteps = 4;
  for (let g = 0; g <= gridSteps; g++) {
    const gy = plot.y + plot.h - (g / gridSteps) * plot.h;
    doc.line(plot.x, gy, plot.x + plot.w, gy);
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(6.8);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text(opts.formatValue((g / gridSteps) * maxV), plot.x - 2.5, gy + 1.2, { align: "right" });
  }

  const n = opts.xLabels.length;
  const stepX = n > 1 ? plot.w / (n - 1) : 0;

  for (const series of opts.series) {
    setColor(doc, "setDrawColor", series.color);
    doc.setLineWidth(0.7);
    doc.setLineDashPattern(series.dashed ? [1.4, 1.2] : [], 0);
    let prevPoint: [number, number] | null = null;
    series.values.forEach((v, i) => {
      if (v === null) {
        prevPoint = null;
        return;
      }
      const px = plot.x + i * stepX;
      const py = plot.y + plot.h - (v / maxV) * plot.h;
      if (prevPoint) doc.line(prevPoint[0], prevPoint[1], px, py);
      prevPoint = [px, py];
    });
    doc.setLineDashPattern([], 0);
  }

  // Sparse x-axis labels: first, middle, last (dense daily labels would overlap in this width).
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(6.8);
  const tickIdx = n > 2 ? [0, Math.floor((n - 1) / 2), n - 1] : n === 2 ? [0, 1] : [0];
  for (const i of tickIdx) {
    const px = plot.x + i * stepX;
    const align = i === 0 ? "left" : i === n - 1 ? "right" : "center";
    doc.text(opts.xLabels[i] ?? "", px, plot.y + plot.h + 5, { align });
  }

  // Legend — line style differs (solid vs. dashed), not color alone, so the
  // distinction survives grayscale printing too.
  let lx = box.x;
  const ly = box.y + box.h - 3;
  for (const item of opts.legend) {
    setColor(doc, "setDrawColor", item.color);
    doc.setLineWidth(0.8);
    doc.setLineDashPattern(item.dashed ? [1.2, 1] : [], 0);
    doc.line(lx, ly, lx + 6, ly);
    doc.setLineDashPattern([], 0);
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(7);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text(item.label, lx + 8, ly + 0.8);
    lx += 8 + doc.getTextWidth(item.label) + 8;
  }
}

// ---------------------------------------------------------------------------
// Horizontal bar list (vector) — spend distribution, audience, region, and
// the per-campaign ad-set comparison. Deliberately never labels an entry as
// "the best" — a longer bar is a proportion, not a verdict.
// ---------------------------------------------------------------------------

function drawBarList(
  doc: jsPDF,
  ctx: Ctx,
  box: { x: number; y: number; w: number; h: number },
  opts: { title: string; caption: string; items: { label: string; value: number }[]; formatValue: (n: number) => string }
) {
  doc.setFont(ctx.fonts.body, "bold");
  doc.setFontSize(9.5);
  setColor(doc, "setTextColor", NAVY);
  doc.text(opts.title, box.x, box.y + 4);
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(7.5);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(opts.caption, box.x, box.y + 9);

  const top = opts.items.slice(0, 8);
  const rest = opts.items.slice(8);
  const rows = [...top];
  if (rest.length > 0) {
    rows.push({ label: `Outras (${rest.length})`, value: rest.reduce((s, r) => s + r.value, 0) });
  }
  if (rows.length === 0) {
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.setFontSize(8);
    doc.text("Sem dados para este recorte.", box.x, box.y + 18);
    return;
  }

  const maxV = Math.max(...rows.map((r) => r.value), 0.0001);
  const labelW = 62;
  const valueW = 26;
  const barAreaW = box.w - labelW - valueW - 4;
  const rowH = Math.min(7, (box.h - 14) / rows.length);
  let ry = box.y + 15;

  for (const row of rows) {
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(7.3);
    setColor(doc, "setTextColor", TEXT);
    const wrapped = wrapText(doc, row.label, labelW);
    const label = wrapped.length > 1 ? `${wrapped[0]}…` : (wrapped[0] ?? row.label);
    doc.text(label, box.x, ry + rowH / 2 + 1, { baseline: "middle" });

    const barX = box.x + labelW;
    const barW = Math.max((row.value / maxV) * barAreaW, 0.6);
    setColor(doc, "setFillColor", SILVER_TINT);
    doc.rect(barX, ry, barAreaW, rowH - 1.4, "F");
    setColor(doc, "setFillColor", NAVY);
    doc.rect(barX, ry, barW, rowH - 1.4, "F");

    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(7.3);
    setColor(doc, "setTextColor", TEXT);
    doc.text(opts.formatValue(row.value), barX + barAreaW + 3, ry + (rowH - 1.4) / 2 + 1, { baseline: "middle" });

    ry += rowH;
  }
}

// ---------------------------------------------------------------------------
// Derived per-day series for whichever KPI the dominant objective calls out
// ---------------------------------------------------------------------------

function derivedDailySeries(
  daily: { date: string; spend: number; impressions: number; clicks: number; linkClicks: number; conversations: number | null }[],
  kpi: KpiId
): (number | null)[] {
  return daily.map((d) => {
    switch (kpi) {
      case "spend":
        return d.spend;
      case "impressions":
        return d.impressions;
      case "clicks":
        return d.clicks;
      case "linkClicks":
        return d.linkClicks;
      case "conversations":
        return d.conversations;
      case "ctr":
        return d.impressions > 0 ? (d.clicks / d.impressions) * 100 : null;
      case "cpc":
        return d.clicks > 0 ? d.spend / d.clicks : null;
      case "cpm":
        return d.impressions > 0 ? (d.spend / d.impressions) * 1000 : null;
      case "costPerConversation":
        return d.conversations !== null && d.conversations > 0 ? d.spend / d.conversations : null;
      case "reach":
        return null; // daily reach isn't part of DailyMetrics' derivable set here
    }
  });
}

const KPI_LABEL: Record<KpiId, string> = {
  spend: "Investimento",
  impressions: "Impressões",
  clicks: "Cliques totais",
  linkClicks: "Cliques no link",
  conversations: "Conversa iniciada",
  costPerConversation: "Custo por conversa",
  ctr: "CTR",
  cpc: "CPC",
  cpm: "CPM",
  reach: "Alcance",
};

const KPI_FORMAT: Record<KpiId, (n: number) => string> = {
  spend: formatCurrencyBRL,
  impressions: formatInteger,
  clicks: formatInteger,
  linkClicks: formatInteger,
  conversations: formatInteger,
  costPerConversation: formatCurrencyBRL,
  ctr: (n) => formatPercent(n),
  cpc: formatCurrencyBRL,
  cpm: formatCurrencyBRL,
  reach: formatInteger,
};

// ---------------------------------------------------------------------------
// Campaign → ad-set hierarchy
// ---------------------------------------------------------------------------

const HEAD_STYLES = { fillColor: NAVY, textColor: WHITE as [number, number, number], fontStyle: "bold" as const, fontSize: 8 };
const BODY_STYLES = { fontSize: 7.8, textColor: TEXT as [number, number, number], cellPadding: 2 };

const NAME_COL_W = 62;
const STATUS_COL_W = 20;
const MIN_METRIC_COL_W = 24;

/** How many metric columns fit in one readable table at the established font size — the split point between "one combined table" and "Entrega / Interação e resultado" complementary tables. */
function maxMetricColsPerTable(): number {
  return Math.max(1, Math.floor((CONTENT_W - NAME_COL_W - STATUS_COL_W) / MIN_METRIC_COL_W));
}

/** Groups allowed metrics into 1 table (few enough to fit) or the established Entrega/Interação split (many) — never cramming more columns than MIN_METRIC_COL_W allows. */
function chunkMetricDefs(allowed: AllowedColumns): MetricColDef[][] {
  const all = allowedMetricDefs(allowed, [...METRIC_GROUP_A, ...METRIC_GROUP_B]);
  if (all.length === 0) return [];
  const maxCols = maxMetricColsPerTable();
  if (all.length <= maxCols) return [all];
  const groupA = allowedMetricDefs(allowed, METRIC_GROUP_A);
  const groupB = allowedMetricDefs(allowed, METRIC_GROUP_B);
  const chunks: MetricColDef[][] = [];
  for (const group of [groupA, groupB]) {
    for (let i = 0; i < group.length; i += maxCols) chunks.push(group.slice(i, i + maxCols));
  }
  return chunks.filter((c) => c.length > 0);
}

/** One "Desempenho por conjunto" table for a single metric chunk, with header repeated on every page and a "Campanha X — continuação" label drawn into the reserved header gutter on any page after the first this particular table spans. */
function drawAdSetTableChunk(doc: jsPDF, ctx: Ctx, y: number, campaignName: string, adSets: AdSetInsight[], metrics: MetricColDef[]): number {
  const metricColW = (CONTENT_W - NAME_COL_W - STATUS_COL_W) / metrics.length;
  const columnStyles: Record<number, { cellWidth?: number; halign?: "left" | "right" }> = {
    0: { cellWidth: NAME_COL_W },
    1: { cellWidth: STATUS_COL_W },
  };
  metrics.forEach((_, i) => {
    columnStyles[i + 2] = { cellWidth: metricColW, halign: "right" };
  });

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_BOTTOM + 9, bottom: 16 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: { font: ctx.fonts.body, ...BODY_STYLES },
    headStyles: { font: ctx.fonts.body, ...HEAD_STYLES },
    alternateRowStyles: { fillColor: SILVER_TINT },
    columnStyles,
    head: [["Conjunto", "Status", ...metrics.map((m) => m.label)]],
    body: adSets.map((a) => [a.adSetName, statusLabel(a.status), ...metrics.map((m) => formatMetricCell(m, a))]),
    didDrawPage: (data) => {
      drawHeader(doc, ctx);
      if (data.pageNumber > 1) drawContinuationLabel(doc, ctx, `Campanha ${campaignName} — continuação`);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 6;
}

/**
 * Ranks hour-of-day buckets by investment and tables only the best 6 —
 * deliberately its own titled section, never folded into the generic
 * "Distribuição" bar-list loop above it. For every other dimension there
 * (age, region, device, ...) the useful question is "how is spend spread
 * across every bucket"; for hour of day the useful question is "which
 * handful of hours are actually worth acting on", which a 24-row bar list
 * answers poorly. Mirrors the dashboard's own "Melhores horários" table.
 */
function drawTopHoursTable(doc: jsPDF, ctx: Ctx, y: number, hours: HourSegment[], allowed: AllowedColumns): number {
  const byHour = new Map<string, { spend: number; clicks: number; impressions: number; conversations: number | null }>();
  for (const h of hours) {
    const entry = byHour.get(h.hour) ?? { spend: 0, clicks: 0, impressions: 0, conversations: null };
    entry.spend += h.spend;
    entry.clicks += h.clicks;
    entry.impressions += h.impressions;
    if (h.conversations !== null) entry.conversations = (entry.conversations ?? 0) + h.conversations;
    byHour.set(h.hour, entry);
  }
  const ranked = [...byHour.entries()]
    .map(([hour, totals]) => ({ hour, ...totals }))
    .sort((a, b) => b.spend - a.spend)
    .slice(0, 6);
  if (ranked.length === 0) return y;
  const hasConversations = ranked.some((r) => r.conversations !== null);

  y = sectionTitle(doc, ctx, y, "Melhores horários do período");
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(7.4);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(
    "Os 6 horários com maior investimento no período — horário local de cada conta.",
    MARGIN_X,
    y + 3
  );
  y += 8;

  type HourRow = { hour: string; spend: number; clicks: number; impressions: number; conversations: number | null };
  const extraCols: { label: string; render: (r: HourRow) => string }[] = [];
  if (isAllowed(allowed, "clicks")) extraCols.push({ label: "Cliques", render: (r) => formatInteger(r.clicks) });
  if (isAllowed(allowed, "ctr")) {
    extraCols.push({ label: "CTR", render: (r) => (r.impressions > 0 ? formatPercent((r.clicks / r.impressions) * 100) : "—") });
  }
  if (isAllowed(allowed, "conversations") && hasConversations) {
    extraCols.push({ label: "Conversa iniciada", render: (r) => (r.conversations === null ? "Não disponível" : formatInteger(r.conversations)) });
  }

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_BOTTOM + 9, bottom: 16 },
    styles: { font: ctx.fonts.body, ...BODY_STYLES },
    headStyles: { font: ctx.fonts.body, ...HEAD_STYLES },
    alternateRowStyles: { fillColor: SILVER_TINT },
    columnStyles: { 0: { cellWidth: 42 }, 1: { cellWidth: 42, halign: "right" } },
    head: [["Horário", "Investimento", ...extraCols.map((c) => c.label)]],
    body: ranked.map((r, i) => [`${i + 1}º · ${r.hour.slice(0, 2)}h`, formatCurrencyBRL(r.spend), ...extraCols.map((c) => c.render(r))]),
    didDrawPage: () => drawHeader(doc, ctx),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 8;
}

type BreakdownRow = { key: string; label: string; spend: number; clicks: number; impressions: number; reach: number; conversations: number | null };

/**
 * Aggregates one Meta breakdown dimension (age, gender, region, platform,
 * device — each attributes exactly one bucket per reached person, so
 * summing spend/clicks/reach across rows is safe) into ranked totals.
 * "unknown" (Meta couldn't determine the value for a row) is excluded
 * outright, same as the live dashboard's BreakdownAnalysis component.
 */
function aggregateBreakdown<T extends { spend: number; impressions: number; clicks: number; reach: number; conversations: number | null }>(
  segments: T[],
  keyOf: (s: T) => string,
  labelOf: (key: string) => string
): BreakdownRow[] {
  const byKey = new Map<string, BreakdownRow>();
  for (const seg of segments) {
    const key = keyOf(seg);
    if (key === "unknown") continue;
    const entry = byKey.get(key) ?? { key, label: labelOf(key), spend: 0, clicks: 0, impressions: 0, reach: 0, conversations: null };
    entry.spend += seg.spend;
    entry.clicks += seg.clicks;
    entry.impressions += seg.impressions;
    entry.reach += seg.reach;
    if (seg.conversations !== null) entry.conversations = (entry.conversations ?? 0) + seg.conversations;
    byKey.set(key, entry);
  }
  return [...byKey.values()].sort((a, b) => b.spend - a.spend);
}

/**
 * Same "columns, not a single-metric bar list" logic as drawTopHoursTable:
 * every core metric the recipient is allowed to see, shown side by side per
 * bucket, mirroring the live dashboard's BreakdownAnalysis table. A column
 * only appears when its own permission allows it, and the whole section is
 * skipped if none do — never a table with only a label column.
 */
function drawBreakdownTable(
  doc: jsPDF,
  ctx: Ctx,
  y: number,
  title: string,
  caption: string,
  bucketColumnLabel: string,
  rows: BreakdownRow[],
  allowed: AllowedColumns
): number {
  if (rows.length === 0) return y;
  const hasConversations = rows.some((r) => r.conversations !== null);

  type Col = { label: string; render: (r: BreakdownRow) => string };
  const cols: Col[] = [];
  if (isAllowed(allowed, "spend")) cols.push({ label: "Investimento", render: (r) => formatCurrencyBRL(r.spend) });
  if (isAllowed(allowed, "clicks")) cols.push({ label: "Cliques", render: (r) => formatInteger(r.clicks) });
  if (isAllowed(allowed, "ctr")) {
    cols.push({ label: "CTR", render: (r) => (r.impressions > 0 ? formatPercent((r.clicks / r.impressions) * 100) : "—") });
  }
  if (isAllowed(allowed, "reach")) cols.push({ label: "Alcance", render: (r) => formatInteger(r.reach) });
  if (isAllowed(allowed, "conversations") && hasConversations) {
    cols.push({ label: "Conversa iniciada", render: (r) => (r.conversations === null ? "Não disponível" : formatInteger(r.conversations)) });
  }
  if (cols.length === 0) return y;

  y = sectionTitle(doc, ctx, y, title);
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(7.4);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(caption, MARGIN_X, y + 3);
  y += 8;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_BOTTOM + 9, bottom: 16 },
    styles: { font: ctx.fonts.body, ...BODY_STYLES },
    headStyles: { font: ctx.fonts.body, ...HEAD_STYLES },
    alternateRowStyles: { fillColor: SILVER_TINT },
    columnStyles: { 0: { cellWidth: 62 } },
    head: [[bucketColumnLabel, ...cols.map((c) => c.label)]],
    body: rows.map((r) => [r.label, ...cols.map((c) => c.render(r))]),
    didDrawPage: () => drawHeader(doc, ctx),
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 8;
}

function campaignInfoCardHeight(metricCount: number, hasBudget: boolean, hasResultLine: boolean): number {
  const budgetExtra = hasBudget ? 5 : 0;
  const resultExtra = hasResultLine ? 5 : 0;
  if (metricCount === 0) return 17 + budgetExtra + resultExtra;
  const cols = Math.min(4, metricCount);
  const rows = Math.ceil(metricCount / cols);
  return 15 + budgetExtra + resultExtra + rows * 9.5 + 4;
}

/** Name, objective, status and every allowed consolidated metric for one campaign — always the campaign's OWN full totals (never derived from whatever ad-set subset is listed below it), so a reader can never mistake a partial ad-set detail for the campaign's real total. */
function drawCampaignInfoCard(doc: jsPDF, ctx: Ctx, y: number, campaign: CampaignInsight, allowed: AllowedColumns): number {
  const top = y;
  const hasBudget = campaign.dailyBudget !== null || campaign.lifetimeBudget !== null;
  const hasResultLine = allowed.has("primaryResult") || allowed.has("costPerResult");
  setColor(doc, "setFillColor", NAVY);
  doc.rect(
    MARGIN_X,
    top,
    1.3,
    campaignInfoCardHeight(allowedMetricDefs(allowed, [...METRIC_GROUP_A, ...METRIC_GROUP_B]).length, hasBudget, hasResultLine) - 3,
    "F"
  );

  doc.setFont(ctx.fonts.body, "bold");
  doc.setFontSize(11.5);
  setColor(doc, "setTextColor", NAVY_DEEP);
  const nameLines = wrapText(doc, campaign.campaignName, CONTENT_W - 10);
  doc.text(nameLines[0] ?? campaign.campaignName, MARGIN_X + 5, y + 6);

  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(8);
  setColor(doc, "setTextColor", TEXT_MUTED);
  const metaLine = allowed.has("objective") && allowed.has("status")
    ? `${objectiveLabel(campaign.objective)} · ${statusLabel(campaign.status)}`
    : allowed.has("objective")
      ? objectiveLabel(campaign.objective)
      : allowed.has("status")
        ? statusLabel(campaign.status)
        : "";
  if (metaLine) doc.text(metaLine, MARGIN_X + 5, y + 11);

  y += 15;
  if (hasBudget) {
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(7.4);
    setColor(doc, "setTextColor", TEXT_MUTED);
    const parts: string[] = [];
    if (campaign.dailyBudget !== null) parts.push(`Orçamento diário: ${formatCurrencyBRL(campaign.dailyBudget)}`);
    if (campaign.lifetimeBudget !== null) parts.push(`Orçamento total: ${formatCurrencyBRL(campaign.lifetimeBudget)}`);
    if (campaign.budgetRemaining !== null) parts.push(`Restante: ${formatCurrencyBRL(campaign.budgetRemaining)}`);
    doc.text(parts.join(" · "), MARGIN_X + 5, y);
    y += 5;
  }
  const metricDefs = allowedMetricDefs(allowed, [...METRIC_GROUP_A, ...METRIC_GROUP_B]);
  if (metricDefs.length > 0) {
    const cols = Math.min(4, metricDefs.length);
    const colW = (CONTENT_W - 10) / cols;
    metricDefs.forEach((def, i) => {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const x = MARGIN_X + 5 + col * colW;
      const my = y + row * 9.5;
      doc.setFont(ctx.fonts.body, "normal");
      doc.setFontSize(6.7);
      setColor(doc, "setTextColor", TEXT_MUTED);
      doc.text(def.label.toUpperCase(), x, my);
      doc.setFont(ctx.fonts.body, "bold");
      doc.setFontSize(8.6);
      const raw = def.value(campaign);
      setColor(doc, "setTextColor", raw === null ? TEXT_MUTED : TEXT);
      doc.text(formatMetricCell(def, campaign), x, my + 4.6);
    });
    const rows = Math.ceil(metricDefs.length / cols);
    y += rows * 9.5 + 4;
  } else {
    y += 2;
  }

  if (allowed.has("primaryResult") || allowed.has("costPerResult")) {
    const kind = primaryResultKind(campaign.objective);
    const { value, costPerResult } = primaryResultFor(kind, campaign);
    const parts: string[] = [];
    if (allowed.has("primaryResult")) {
      parts.push(
        kind === "undefined"
          ? "Resultado principal: não definido"
          : `Resultado principal: ${value === null ? "não disponível" : `${formatInteger(value)} ${PRIMARY_RESULT_LABEL[kind].toLowerCase()}`}`
      );
    }
    if (allowed.has("costPerResult") && kind !== "undefined") {
      parts.push(`Custo por resultado: ${costPerResult === null ? "—" : formatCurrencyBRL(costPerResult)}`);
    }
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(7.4);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text(parts.join("   ·   "), MARGIN_X + 5, y);
    y += 5;
  }

  setColor(doc, "setDrawColor", BORDER);
  doc.setLineWidth(0.2);
  doc.line(MARGIN_X, y, PAGE_W - MARGIN_X, y);
  return y + 5;
}

/**
 * The full Cliente/conta → Campanha → Conjuntos hierarchy. Ad sets are
 * never summarized into one line, however many there are — every ad set
 * matching the filters and permissions gets its own table row, page after
 * page if needed, with the campaign identity re-stated via the
 * continuation label so context is never lost.
 */
function drawCampaignHierarchy(
  doc: jsPDF,
  ctx: Ctx,
  y: number,
  campaigns: CampaignInsight[],
  adSets: AdSetInsight[],
  selectedAdSetIds: Set<string> | null,
  allowed: AllowedColumns
): number {
  y = sectionTitle(doc, ctx, y, "Desempenho por campanha e conjuntos de anúncios");
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(8);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(
    `${campaigns.length} campanha${campaigns.length === 1 ? "" : "s"} nos filtros aplicados. Uma campanha pode reunir conjuntos com públicos, criativos ou estratégias diferentes — por isso o consolidado da campanha não substitui o detalhamento abaixo.`,
    MARGIN_X,
    y
  );
  y += 8;

  if (campaigns.length === 0) {
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(9);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text("Nenhuma campanha corresponde aos filtros selecionados neste período.", MARGIN_X, y + 4);
    return y + 12;
  }

  const byAccount = new Map<string, CampaignInsight[]>();
  for (const c of campaigns) {
    const list = byAccount.get(c.accountId) ?? [];
    list.push(c);
    byAccount.set(c.accountId, list);
  }

  const adSetsByCampaign = new Map<string, AdSetInsight[]>();
  for (const a of adSets) {
    const list = adSetsByCampaign.get(a.campaignId) ?? [];
    list.push(a);
    adSetsByCampaign.set(a.campaignId, list);
  }

  const metricChunks = chunkMetricDefs(allowed);

  for (const [, accCampaigns] of byAccount) {
    y = ensureSpace(doc, ctx, y, 14);
    doc.setFont(ctx.fonts.body, "bold");
    doc.setFontSize(9.5);
    setColor(doc, "setTextColor", NAVY);
    doc.text(`CONTA: ${accCampaigns[0].accountName}`.toUpperCase(), MARGIN_X, y);
    y += 3;
    setColor(doc, "setDrawColor", NAVY);
    doc.setLineWidth(0.4);
    doc.line(MARGIN_X, y, MARGIN_X + 16, y);
    y += 6;

    for (const campaign of [...accCampaigns].sort((a, b) => b.spend - a.spend)) {
      const cardH = campaignInfoCardHeight(
        allowedMetricDefs(allowed, [...METRIC_GROUP_A, ...METRIC_GROUP_B]).length,
        campaign.dailyBudget !== null || campaign.lifetimeBudget !== null,
        allowed.has("primaryResult") || allowed.has("costPerResult")
      );
      y = ensureSpace(doc, ctx, y, cardH + 24);
      y = drawCampaignInfoCard(doc, ctx, y, campaign, allowed);

      const allForCampaign = adSetsByCampaign.get(campaign.campaignId) ?? [];
      const shown = selectedAdSetIds === null ? allForCampaign : allForCampaign.filter((a) => selectedAdSetIds.has(a.adSetId));

      doc.setFont(ctx.fonts.body, "bold");
      doc.setFontSize(9);
      setColor(doc, "setTextColor", NAVY_DEEP);
      doc.text("Desempenho por conjunto", MARGIN_X, y);
      y += 5;

      if (allForCampaign.length === 0) {
        doc.setFont(ctx.fonts.body, "normal");
        doc.setFontSize(8.2);
        setColor(doc, "setTextColor", TEXT_MUTED);
        doc.text("Nenhum conjunto de anúncios disponível para esta campanha no período.", MARGIN_X, y + 3);
        y += 12;
        continue;
      }

      if (shown.length < allForCampaign.length) {
        doc.setFont(ctx.fonts.body, "normal");
        doc.setFontSize(7.6);
        setColor(doc, "setTextColor", TEXT_MUTED);
        const note = `Mostrando ${shown.length} de ${allForCampaign.length} conjuntos desta campanha, conforme o filtro de conjunto aplicado — os indicadores da campanha acima são o total da campanha inteira, não a soma apenas destes conjuntos.`;
        const lines = wrapText(doc, note, CONTENT_W);
        doc.text(lines, MARGIN_X, y);
        y += lines.length * 3.6 + 3;
      }

      if (metricChunks.length === 0) {
        doc.setFont(ctx.fonts.body, "normal");
        doc.setFontSize(8.2);
        setColor(doc, "setTextColor", TEXT_MUTED);
        doc.text("Nenhum indicador autorizado disponível para este detalhamento.", MARGIN_X, y + 3);
        y += 12;
      } else if (shown.length === 0) {
        doc.setFont(ctx.fonts.body, "normal");
        doc.setFontSize(8.2);
        setColor(doc, "setTextColor", TEXT_MUTED);
        doc.text("Nenhum conjunto corresponde ao filtro de conjunto aplicado.", MARGIN_X, y + 3);
        y += 12;
      } else {
        for (const chunk of metricChunks) {
          y = ensureSpace(doc, ctx, y, 24);
          y = drawAdSetTableChunk(doc, ctx, y, campaign.campaignName, shown, chunk);
        }

        // Visual comparison between ad sets — proportional bars only, no
        // "best" label, and only drawn when there's more than one ad set
        // and an allowed metric with actual variation to show.
        const compareMetric = [...METRIC_GROUP_A, ...METRIC_GROUP_B].map((id) => METRIC_DEFS[id]).find((d) => isAllowed(allowed, d.id));
        if (shown.length >= 2 && compareMetric) {
          const items = shown
            .map((a) => ({ label: a.adSetName, value: compareMetric.value(a) }))
            .filter((r): r is { label: string; value: number } => r.value !== null && r.value > 0);
          if (items.length >= 2) {
            y = ensureSpace(doc, ctx, y, 56);
            drawBarList(doc, ctx, { x: MARGIN_X, y, w: CONTENT_W, h: 50 }, {
              title: `Comparação entre conjuntos — ${campaign.campaignName}`,
              caption: `Métrica: ${compareMetric.label} · comparação proporcional, não uma classificação de qualidade`,
              items,
              formatValue: compareMetric.format,
            });
            y += 54;
          }
        }
      }

      y += 4;
    }
  }

  return y;
}

// ---------------------------------------------------------------------------
// Main builder
// ---------------------------------------------------------------------------

function slugify(value: string): string {
  return (
    value
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "relatorio"
  );
}

export function reportFileName(input: Pick<ReportPdfInput, "clientLabel" | "resolvedRange">): string {
  const scope = slugify(input.clientLabel ?? "consolidado");
  return `legado-intelligence_${scope}_${input.resolvedRange.since}_a_${input.resolvedRange.until}.pdf`;
}

/**
 * A dedicated opening page — logo, title/client/period, then Titan and
 * Legacy together near the bottom — drawn on the document's first page
 * before any content page is added. Deliberately skips the repeated
 * header/footer chrome (drawHeader/drawFooter): this is a brand moment, not
 * a content page, and it's left out of the "Página X de Y" footer pass in
 * buildReportPdf so numbering starts clean on the first real content page.
 */
function drawCoverPage(doc: jsPDF, ctx: Ctx, input: ReportPdfInput) {
  const { assets, fonts } = ctx;

  setColor(doc, "setFillColor", NAVY);
  doc.rect(0, 0, PAGE_W, 3, "F");
  doc.rect(0, PAGE_H - 3, PAGE_W, 3, "F");

  let y = 18;
  if (assets.logoDataUrl) {
    const h = 34;
    const w = h * LOGO_ASPECT_WH;
    try {
      doc.addImage(assets.logoDataUrl, "PNG", (PAGE_W - w) / 2, y, w, h);
    } catch {
      // A corrupt/unsupported logo asset never blocks the cover itself.
    }
    y += h;
  }
  y += 14;

  doc.setFont(fonts.heading, "bold");
  doc.setFontSize(23);
  setColor(doc, "setTextColor", NAVY);
  doc.text(input.title || "Relatório executivo", PAGE_W / 2, y, { align: "center" });
  y += 9;

  doc.setFont(fonts.body, "normal");
  doc.setFontSize(12);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(input.clientLabel ?? "Visão consolidada — múltiplas contas", PAGE_W / 2, y, { align: "center" });
  y += 8;

  doc.setFontSize(9.5);
  doc.text(ctx.periodLine, PAGE_W / 2, y, { align: "center" });
  y += 6;

  doc.setFontSize(8);
  doc.text(`Gerado em ${formatDateTimeTz(input.generatedAt)}`, PAGE_W / 2, y, { align: "center" });

  const mascotH = 70;
  const titanW = mascotH * TITAN_ASPECT_WH;
  const legacyW = mascotH * LEGACY_ASPECT_WH;
  const gap = 8;
  const startX = (PAGE_W - (titanW + gap + legacyW)) / 2;
  const mascotY = PAGE_H - 14 - mascotH;
  try {
    if (assets.titanBoasVindasDataUrl) {
      doc.addImage(assets.titanBoasVindasDataUrl, "PNG", startX, mascotY, titanW, mascotH);
    }
    if (assets.legacyOlaDataUrl) {
      doc.addImage(assets.legacyOlaDataUrl, "PNG", startX + titanW + gap, mascotY, legacyW, mascotH);
    }
  } catch {
    // A corrupt/unsupported mascot asset never blocks the cover itself.
  }
}

/** Pure document builder — no fetching, no DOM download. Runs identically in Node (the permission-enforcing server route) or the browser. */
export function buildReportPdf(input: ReportPdfInput, assets: ReportAssets): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const fonts = registerFonts(doc, assets);
  const allowed = input.allowedColumns;

  const scopeLine = input.clientLabel ? `${input.clientLabel} · ${input.title}` : `Visão consolidada — múltiplas contas · ${input.title}`;
  const periodLine = input.compare && input.comparisonRange
    ? `${formatShortDate(input.resolvedRange.since)}–${formatShortDate(input.resolvedRange.until)} vs. ${formatShortDate(input.comparisonRange.since)}–${formatShortDate(input.comparisonRange.until)}`
    : `${formatShortDate(input.resolvedRange.since)}–${formatShortDate(input.resolvedRange.until)}`;
  const footerLeft = `${input.clientLabel ?? "Visão consolidada — múltiplas contas"} · ${periodLine}`;

  const ctx: Ctx = { fonts, assets, scopeLine, periodLine, footerLeft };

  const totals = sumTotals(input.campaigns);
  const totalReach = isAllowed(allowed, "reach") ? input.reach : null;
  const comparisonTotals = input.comparisonCampaigns ? sumTotals(input.comparisonCampaigns) : null;
  const comparisonReach = isAllowed(allowed, "reach") ? input.comparisonReach : null;

  const accountIdSet = new Set(input.accounts.map((a) => a.id));
  const dailyAgg = aggregateDailyByDate(input.daily, accountIdSet);
  const comparisonDailyAgg = input.comparisonDaily ? aggregateDailyByDate(input.comparisonDaily, accountIdSet) : null;

  const allowedKpiIds = new Set<KpiId>((Object.keys(METRIC_DEFS) as KpiId[]).filter((id) => isAllowed(allowed, id)));
  const insights = computeStrategicInsights({
    campaigns: input.campaigns,
    comparisonCampaigns: input.comparisonCampaigns,
    daily: dailyAgg,
    resolvedRange: input.resolvedRange,
    partialAccountNames: input.partialAccountNames,
    allowedMetrics: allowedKpiIds,
  });

  // ---- Cover page ----
  drawCoverPage(doc, ctx, input);
  doc.addPage("a4", "landscape");

  // ---- Page 2: abertura e visão executiva ----
  drawHeader(doc, ctx);
  let y = HEADER_BOTTOM + 8;

  doc.setFont(fonts.heading, "bold");
  doc.setFontSize(19);
  setColor(doc, "setTextColor", NAVY);
  doc.text(input.clientLabel ?? "Visão consolidada — múltiplas contas", MARGIN_X, y);
  y += 6;
  doc.setFont(fonts.body, "normal");
  doc.setFontSize(9.5);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(`${input.title} · ${input.periodLabel}`, MARGIN_X, y);
  y += 9;

  {
    const duoH = 52;
    const titanW = duoH * TITAN_ASPECT_WH;
    const legacyW = duoH * LEGACY_ASPECT_WH;
    const duoX = PAGE_W - MARGIN_X - (titanW + 4 + legacyW);
    const duoY = HEADER_BOTTOM + 6;
    try {
      if (assets.titanBoasVindasDataUrl) {
        doc.addImage(assets.titanBoasVindasDataUrl, "PNG", duoX, duoY, titanW, duoH);
      }
      if (assets.legacyOlaDataUrl) {
        doc.addImage(assets.legacyOlaDataUrl, "PNG", duoX + titanW + 4, duoY, legacyW, duoH);
      }
    } catch {
      // A corrupt/unsupported mascot asset never blocks the page itself.
    }
  }

  // Reserved on the right for the Titan+Legacy duo below — every line in
  // this info block (meta grid, filters, partial-accounts warning) wraps at
  // this narrower width instead of CONTENT_W so none of them ever runs text
  // under the mascots, whichever optional lines end up present.
  const PAGE2_MASCOT_GUTTER = 85;
  const infoBlockW = CONTENT_W - PAGE2_MASCOT_GUTTER;

  const metaCols = 3;
  const metaColW = infoBlockW / metaCols;
  const metaRows: [string, string][] = [
    ["Período", `${formatShortDate(input.resolvedRange.since)} a ${formatShortDate(input.resolvedRange.until)}`],
    [
      "Comparando com",
      input.compare && input.comparisonRange
        ? `${formatShortDate(input.comparisonRange.since)} a ${formatShortDate(input.comparisonRange.until)}`
        : "Comparação não ativada",
    ],
    ["Contas incluídas", input.accounts.length === 0 ? "Nenhuma" : input.accounts.map((a) => a.name).join(", ")],
    ["Gerado em", formatDateTimeTz(input.generatedAt)],
    ["Dados atualizados em", formatDateTimeTz(new Date(input.dataGeneratedAt))],
    ["Fuso horário de referência", `${REFERENCE_TIME_ZONE} (horário de Brasília) — usado nos horários acima`],
  ];
  const metaRowH = 14;
  metaRows.forEach(([label, value], i) => {
    const col = i % metaCols;
    const row = Math.floor(i / metaCols);
    const x = MARGIN_X + col * metaColW;
    const my = y + row * metaRowH;
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(7);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text(label.toUpperCase(), x, my);
    doc.setFont(fonts.body, "bold");
    doc.setFontSize(8.4);
    setColor(doc, "setTextColor", TEXT);
    const lines = wrapText(doc, value, metaColW - 4).slice(0, 2);
    doc.text(lines, x, my + 4.2);
  });
  y += Math.ceil(metaRows.length / metaCols) * metaRowH + 2;

  if (input.filters.length > 0) {
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(7.6);
    setColor(doc, "setTextColor", TEXT_MUTED);
    const filtersText = `Filtros ativos: ${input.filters.map((f) => `${f.label}: ${f.value}`).join(" · ")}`;
    const lines = wrapText(doc, filtersText, infoBlockW);
    doc.text(lines, MARGIN_X, y);
    y += lines.length * 4 + 3;
  }

  if (input.partialAccountNames.length > 0) {
    setColor(doc, "setTextColor", BAD);
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(7.6);
    const note = `${input.partialAccountNames.length} conta(s) não puderam ser carregadas neste momento (${input.partialAccountNames.join(", ")}) — os totais abaixo estão incompletos, não zerados.`;
    const lines = wrapText(doc, note, infoBlockW);
    doc.text(lines, MARGIN_X, y);
    y += lines.length * 4 + 3;
  }

  const showKpiGrid = input.reportType !== "audience";
  const visibleKpiDefs = showKpiGrid ? KPI_DEFS.filter((d) => isAllowed(allowed, d.id) && isKpiPopulated(d, totals, totalReach)) : [];
  y += 2;
  if (showKpiGrid && visibleKpiDefs.length > 0) {
    y = ensureSpace(doc, ctx, y, kpiGridHeight(visibleKpiDefs, Boolean(ctx.periodLine && comparisonTotals)));
    y = drawKpiGrid(doc, ctx, y, visibleKpiDefs, totals, totalReach, comparisonTotals, comparisonReach);
  } else if (showKpiGrid) {
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(9);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text("Nenhum indicador disponível para exibição neste relatório.", MARGIN_X, y + 4);
    y += 14;
  }

  const showExecutiveSummary = input.reportType !== "audience";
  if (showExecutiveSummary && insights.summary.length > 0) {
    y = ensureSpace(doc, ctx, y, 20);
    const summaryTitleY = y;
    doc.setFont(fonts.body, "bold");
    doc.setFontSize(9.5);
    setColor(doc, "setTextColor", NAVY_DEEP);
    doc.text("Resumo executivo", MARGIN_X, y);
    y += 5.5;
    if (assets.titanIndicadoresDataUrl) {
      const h = 28;
      const w = h * TITAN_ASPECT_WH;
      const imgY = summaryTitleY - 5;
      try {
        doc.addImage(assets.titanIndicadoresDataUrl, "PNG", PAGE_W - MARGIN_X - w, imgY, w, h);
        // Pushes the summary bullets below the image's bottom instead of
        // wrapping them beside it, so a small decorative accent can never
        // run text underneath it.
        y = Math.max(y, imgY + h + 3);
      } catch {
        // A corrupt/unsupported mascot asset never blocks the section itself.
      }
    }
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(8.4);
    setColor(doc, "setTextColor", TEXT);
    for (const item of insights.summary) {
      const lines = wrapText(doc, item.text, CONTENT_W - 4);
      y = ensureSpace(doc, ctx, y, lines.length * 4.4 + 2);
      doc.text(lines, MARGIN_X, y);
      y += lines.length * 4.4 + 2;
    }
  }

  // ---- Evolução e distribuição ----
  const showEvolution = input.reportType !== "audience";
  const nonSpendPrimary = primaryKpiIds(input.campaigns).find((id) => id !== "spend" && isAllowed(allowed, id)) ?? [...METRIC_GROUP_B, ...METRIC_GROUP_A].find((id) => isAllowed(allowed, id));
  const hasEvolutionSection = showEvolution && (isAllowed(allowed, "spend") || nonSpendPrimary !== undefined);

  if (hasEvolutionSection) {
    // A fresh page unless the executive summary above already spilled onto a
    // mostly-empty continuation page — then this keeps filling that page
    // instead of leaving it nearly blank and forcing yet another page break.
    y = ensureSpace(doc, ctx, y, 90);
    y = sectionTitle(doc, ctx, y, "Evolução e distribuição");

    const xLabels = dailyAgg.map((d) => formatShortDate(d.date));
    const chartW = isAllowed(allowed, "spend") && nonSpendPrimary ? (CONTENT_W - 8) / 2 : CONTENT_W;
    const chartH = 58;

    if (dailyAgg.length === 0) {
      doc.setFont(fonts.body, "normal");
      doc.setFontSize(8.6);
      setColor(doc, "setTextColor", TEXT_MUTED);
      doc.text("Sem série diária disponível para este período/filtro.", MARGIN_X, y + 4);
      y += 14;
    } else {
      const legend = input.compare && comparisonDailyAgg
        ? [
            { label: `Período atual (${formatShortDate(input.resolvedRange.since)}–${formatShortDate(input.resolvedRange.until)})`, color: NAVY },
            { label: `Período anterior (${input.comparisonRange ? `${formatShortDate(input.comparisonRange.since)}–${formatShortDate(input.comparisonRange.until)}` : "—"})`, color: SILVER, dashed: true },
          ]
        : [{ label: `Período atual (${formatShortDate(input.resolvedRange.since)}–${formatShortDate(input.resolvedRange.until)})`, color: NAVY }];

      let chartX = MARGIN_X;
      if (isAllowed(allowed, "spend")) {
        const spendSeries: LineSeries[] = [{ values: dailyAgg.map((d) => d.spend), color: NAVY }];
        if (input.compare && comparisonDailyAgg && comparisonDailyAgg.length > 0) {
          const n = dailyAgg.length;
          spendSeries.push({ values: Array.from({ length: n }, (_, i) => comparisonDailyAgg[i]?.spend ?? null), color: SILVER, dashed: true });
        }
        drawLineChart(doc, ctx, { x: chartX, y, w: chartW, h: chartH }, {
          title: "Investimento ao longo do período",
          caption: "Métrica: Investimento (R$) por dia",
          xLabels,
          series: spendSeries,
          formatValue: formatCurrencyBRL,
          legend,
        });
        chartX += chartW + 8;
      }

      if (nonSpendPrimary) {
        const resultSeries: LineSeries[] = [{ values: derivedDailySeries(dailyAgg, nonSpendPrimary), color: NAVY }];
        if (input.compare && comparisonDailyAgg && comparisonDailyAgg.length > 0) {
          const n = dailyAgg.length;
          const alignedResult = derivedDailySeries(
            Array.from({ length: n }, (_, i) => comparisonDailyAgg[i] ?? { date: "", spend: 0, impressions: 0, clicks: 0, linkClicks: 0, conversations: null, reach: 0 }),
            nonSpendPrimary
          ).map((v, i) => (comparisonDailyAgg[i] ? v : null));
          resultSeries.push({ values: alignedResult, color: SILVER, dashed: true });
        }
        drawLineChart(doc, ctx, { x: chartX, y, w: chartW, h: chartH }, {
          title: `${KPI_LABEL[nonSpendPrimary]} ao longo do período`,
          caption: `Métrica: ${KPI_LABEL[nonSpendPrimary]} por dia — indicador principal do objetivo predominante`,
          xLabels,
          series: resultSeries,
          formatValue: KPI_FORMAT[nonSpendPrimary],
          legend,
        });
      }
      y += chartH + 10;
    }
  }

  const showCampaignDistribution = input.reportType === "detailed";
  if (showCampaignDistribution && isAllowed(allowed, "spend")) {
    y = ensureSpace(doc, ctx, y, 70);
    const distItems = [...input.campaigns].sort((a, b) => b.spend - a.spend).map((c) => ({ label: c.campaignName, value: c.spend }));
    drawBarList(doc, ctx, { x: MARGIN_X, y, w: CONTENT_W, h: 62 }, {
      title: "Distribuição do investimento por campanha",
      caption: "Métrica: Investimento (R$) · até 8 maiores + agregado das demais",
      items: distItems,
      formatValue: formatCurrencyBRL,
    });
    y += 68;
  }

  // Standalone title for the audience-only report — "detailed" already got
  // one from the evolution section above, and "executive" never reaches
  // this branch (showAudienceBreakdowns is false for it).
  const showAudienceBreakdowns = input.reportType === "detailed" || input.reportType === "audience";
  if (input.reportType === "audience") {
    y = ensureSpace(doc, ctx, y, 16);
    y = sectionTitle(doc, ctx, y, "Público e distribuição");
  }

  if (showAudienceBreakdowns && input.audience.length > 0) {
    y = ensureSpace(doc, ctx, y, 60);
    const genderLabel: Record<string, string> = { male: "Masculino", female: "Feminino" };
    const ageRows = aggregateBreakdown(input.audience, (a) => a.age, (k) => k);
    const genderRows = aggregateBreakdown(input.audience, (a) => a.gender, (k) => genderLabel[k] ?? k);
    y = drawBreakdownTable(doc, ctx, y, "Público por idade", "Faixas etárias com dados reportados pela Meta no período.", "Idade", ageRows, allowed);
    y = drawBreakdownTable(doc, ctx, y, "Público por gênero", "Gêneros com dados reportados pela Meta no período.", "Gênero", genderRows, allowed);
  }

  if (showAudienceBreakdowns && input.regions.length > 0) {
    y = ensureSpace(doc, ctx, y, 60);
    const regionRows = aggregateBreakdown(input.regions, (r) => r.region, (k) => k);
    y = drawBreakdownTable(doc, ctx, y, "Público por região", "Estados com dados reportados pela Meta no período.", "Região", regionRows, allowed);
  }

  const platformLabel: Record<string, string> = {
    facebook: "Facebook",
    instagram: "Instagram",
    audience_network: "Audience Network",
    messenger: "Messenger",
  };
  const deviceLabel: Record<string, string> = { desktop: "Desktop", mobile_app: "App mobile", mobile_web: "Web mobile" };

  if (showAudienceBreakdowns && input.platforms.length > 0) {
    y = ensureSpace(doc, ctx, y, 60);
    const platformRows = aggregateBreakdown(input.platforms, (p) => p.platform, (k) => platformLabel[k] ?? k);
    y = drawBreakdownTable(doc, ctx, y, "Distribuição por plataforma", "Plataformas com dados reportados pela Meta no período.", "Plataforma", platformRows, allowed);
  }

  if (showAudienceBreakdowns && input.devices.length > 0) {
    y = ensureSpace(doc, ctx, y, 60);
    const deviceRows = aggregateBreakdown(input.devices, (d) => d.device, (k) => deviceLabel[k] ?? k);
    y = drawBreakdownTable(doc, ctx, y, "Distribuição por dispositivo", "Dispositivos com dados reportados pela Meta no período.", "Dispositivo", deviceRows, allowed);
  }

  if (showAudienceBreakdowns && isAllowed(allowed, "spend") && input.hours.length > 0) {
    y = ensureSpace(doc, ctx, y, 60);
    y = drawTopHoursTable(doc, ctx, y, input.hours, allowed);
  }

  const showDetailedExtras = input.reportType === "detailed";
  const visibleConversionDefs = showDetailedExtras
    ? EXTRA_CONVERSION_KPI_DEFS.filter((d) => isAllowed(allowed, d.id) && isKpiPopulated(d, totals, null))
    : [];
  if (visibleConversionDefs.length > 0) {
    y = ensureSpace(doc, ctx, y, 12);
    doc.setFont(fonts.body, "bold");
    doc.setFontSize(9.5);
    setColor(doc, "setTextColor", NAVY_DEEP);
    doc.text("Outras conversões (Pixel/Conversions API)", MARGIN_X, y);
    y += 3;
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(7.4);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text("Mostra apenas os indicadores com dado real reportado pela conta — Pixel/Conversions API configurados parcialmente exibem só os efetivamente reportados.", MARGIN_X, y + 3);
    y += 9;
    y = ensureSpace(doc, ctx, y, kpiGridHeight(visibleConversionDefs, false));
    y = drawKpiGrid(doc, ctx, y, visibleConversionDefs, totals, null, null, null);
  }

  const visibleEngagementDefs = showDetailedExtras
    ? EXTRA_ENGAGEMENT_KPI_DEFS.filter((d) => isAllowed(allowed, d.id) && isKpiPopulated(d, totals, null))
    : [];
  if (visibleEngagementDefs.length > 0) {
    y = ensureSpace(doc, ctx, y, 12);
    doc.setFont(fonts.body, "bold");
    doc.setFontSize(9.5);
    setColor(doc, "setTextColor", NAVY_DEEP);
    doc.text("Engajamento, vídeo e reconhecimento de marca", MARGIN_X, y);
    y += 6;
    y = ensureSpace(doc, ctx, y, kpiGridHeight(visibleEngagementDefs, false));
    y = drawKpiGrid(doc, ctx, y, visibleEngagementDefs, totals, null, null, null);
  }

  // ---- Campaign → ad set hierarchy ----
  if (showDetailedExtras) {
    y = ensureSpace(doc, ctx, y, 60);
    y = drawCampaignHierarchy(doc, ctx, y, input.campaigns, input.adSets, input.selectedAdSetIds, allowed);
  }

  // ---- Closing block ----
  if (assets.legacyOlaDataUrl) {
    const h = 40;
    const w = h * LEGACY_ASPECT_WH;
    y = ensureSpace(doc, ctx, y, h + 6);
    try {
      doc.addImage(assets.legacyOlaDataUrl, "PNG", MARGIN_X, y, w, h);
      doc.setFont(fonts.body, "normal");
      doc.setFontSize(10);
      setColor(doc, "setTextColor", NAVY_DEEP);
      const closingLines = wrapText(doc, "Dúvidas sobre estes números? Fale com o seu consultor da Legado.", CONTENT_W - w - 8);
      const textY = y + h / 2 - (closingLines.length * 4.6) / 2 + 3;
      doc.text(closingLines, MARGIN_X + w + 8, textY);
      y += h + 6;
    } catch {
      // A corrupt/unsupported mascot asset never blocks the report itself.
    }
  }

  // ---- Final pass: footer with "Página X de Y" on every page except the cover ----
  const totalPages = doc.getNumberOfPages();
  for (let p = 2; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, ctx, p, totalPages);
  }

  void medFont; // reserved for future semibold-specific labels; kept resolvable now that the font is registered

  return doc;
}
