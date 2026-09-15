"use client";

// Client-only: builds the branded, downloadable "Legado Intelligence" PDF
// report from an already filtered/permission-scoped slice of dashboard data.
// jsPDF/autotable only run in the browser (canvas/DOM APIs) for the asset
// loading step — the actual document-building function (buildReportPdf) is
// pure and side-effect-free, so it can also run in Node for QA/testing by
// passing in pre-loaded assets instead of fetching them.
//
// Layout is intentionally uniform A4 landscape on every page (cover
// included) — no portrait-to-landscape jump — with a repeated header/footer
// drawn by the same two functions everywhere, so the document reads as one
// consistent artifact rather than a screenshot glued to a data dump.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type {
  AudienceSegment,
  CampaignInsight,
  DailyMetrics,
  DateRange,
  RegionSegment,
} from "./meta-ads-types";
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
import { sumTotals, ctr, cpc, cpm, costPerConversation, pctChange, aggregateDailyByDate, type Totals } from "./metrics";
import { computeStrategicInsights, type StrategicInsights, type InsightItem } from "./strategic-insights";
import { primaryKpiIds, type KpiId } from "./kpi-hierarchy";

// ---------------------------------------------------------------------------
// Public input/output types
// ---------------------------------------------------------------------------

export type ReportPdfInput = {
  /** Report/template name — shown as the small caption under the client name. */
  title: string;
  /** Business name for a client-scoped report, or null for a consolidated multi-account view. */
  clientLabel: string | null;
  /** Accounts actually represented in `campaigns` (already permission-filtered upstream — never more than the caller is allowed to see). */
  accounts: { id: string; name: string }[];
  periodLabel: string;
  resolvedRange: DateRange;
  compare: boolean;
  comparisonRange: DateRange | null;
  /** Human-readable "Label: valor" pairs for every active filter, ready to print as-is. */
  filters: { label: string; value: string }[];
  /** When this document is being generated (the browser's clock). */
  generatedAt: Date;
  /** The dashboard payload's own generatedAt (ISO) — "última atualização dos dados", distinct from generatedAt above. */
  dataGeneratedAt: string;
  campaigns: CampaignInsight[];
  comparisonCampaigns: CampaignInsight[] | null;
  /** Raw per-account daily rows, already scoped to the selected accounts — NOT pre-aggregated, so per-account breakdowns stay possible. */
  daily: DailyMetrics[];
  comparisonDaily: DailyMetrics[] | null;
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
  /** Accounts that failed to load for this request — surfaced so totals are never mistaken for "genuinely zero". */
  partialAccountNames: string[];
};

export type ReportAssets = {
  logoDataUrl: string | null;
  montserratRegular: string | null;
  montserratSemiBold: string | null;
  montserratBold: string | null;
  cinzelBold: string | null;
};

export class ReportPdfError extends Error {}

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

type Fonts = { body: string; heading: string };

type Ctx = {
  fonts: Fonts;
  assets: ReportAssets;
  scopeLine: string;
  periodLine: string;
  footerLeft: string;
};

// ---------------------------------------------------------------------------
// Asset loading (browser only)
// ---------------------------------------------------------------------------

async function fetchAsDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error(`Falha ao ler ${path}`));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Never throws — a missing logo or font just falls back to a plain layout instead of failing the whole report. */
export async function loadReportAssets(): Promise<ReportAssets> {
  const [logoDataUrl, montserratRegular, montserratSemiBold, montserratBold, cinzelBold] = await Promise.all([
    fetchAsDataUrl("/brand/logo-legado.png"),
    fetchAsDataUrl("/fonts/Montserrat-Regular.ttf"),
    fetchAsDataUrl("/fonts/Montserrat-SemiBold.ttf"),
    fetchAsDataUrl("/fonts/Montserrat-Bold.ttf"),
    fetchAsDataUrl("/fonts/Cinzel-Bold.ttf"),
  ]);
  return { logoDataUrl, montserratRegular, montserratSemiBold, montserratBold, cinzelBold };
}

function dataUrlToBase64(dataUrl: string): string {
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
  doc.text("Confidencial — uso interno do cliente", PAGE_W - MARGIN_X, 18, { align: "right" });

  setColor(doc, "setDrawColor", BORDER);
  doc.setLineWidth(0.3);
  doc.line(MARGIN_X, HEADER_BOTTOM - 3, PAGE_W - MARGIN_X, HEADER_BOTTOM - 3);
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
// KPI grid (all 9 overview indicators — never trimmed for layout's sake)
// ---------------------------------------------------------------------------

type DeltaPolarity = "higher-better" | "lower-better" | "neutral";

type KpiDef = {
  id: KpiId;
  label: string;
  unitNote: string;
  polarity: DeltaPolarity;
  isPercent: boolean; // percentage-point delta instead of relative % delta
  value: (t: Totals, reach: number | null) => number | null;
  format: (n: number) => string;
};

const KPI_DEFS: KpiDef[] = [
  { id: "spend", label: "Investimento", unitNote: "R$", polarity: "neutral", isPercent: false, value: (t) => t.spend, format: formatCurrencyBRL },
  {
    id: "impressions",
    label: "Impressões",
    unitNote: "exibições",
    polarity: "neutral",
    isPercent: false,
    value: (t) => t.impressions,
    format: formatInteger,
  },
  {
    id: "clicks",
    label: "Cliques totais",
    unitNote: "cliques",
    polarity: "higher-better",
    isPercent: false,
    value: (t) => t.clicks,
    format: formatInteger,
  },
  {
    id: "linkClicks",
    label: "Cliques no link",
    unitNote: "cliques",
    polarity: "higher-better",
    isPercent: false,
    value: (t) => t.linkClicks,
    format: formatInteger,
  },
  {
    id: "conversations",
    label: "Conversa iniciada",
    unitNote: "conversas",
    polarity: "higher-better",
    isPercent: false,
    value: (t) => t.conversations,
    format: formatInteger,
  },
  {
    id: "costPerConversation",
    label: "Custo por conversa",
    unitNote: "R$/conversa",
    polarity: "lower-better",
    isPercent: false,
    value: (t) => costPerConversation(t),
    format: formatCurrencyBRL,
  },
  { id: "ctr", label: "CTR", unitNote: "cliques/impressões", polarity: "higher-better", isPercent: true, value: (t) => ctr(t), format: (n) => formatPercent(n) },
  { id: "cpc", label: "CPC", unitNote: "R$/clique", polarity: "lower-better", isPercent: false, value: (t) => cpc(t), format: formatCurrencyBRL },
  { id: "cpm", label: "CPM", unitNote: "R$/mil impressões", polarity: "lower-better", isPercent: false, value: (t) => cpm(t), format: formatCurrencyBRL },
  {
    id: "reach",
    label: "Alcance",
    unitNote: "pessoas (estimativa Meta)",
    polarity: "neutral",
    isPercent: false,
    value: (_t, reach) => reach,
    format: formatInteger,
  },
];

function deltaColor(delta: number, polarity: DeltaPolarity): [number, number, number] {
  if (polarity === "neutral" || Math.abs(delta) < 0.05) return TEXT_MUTED;
  const goingUp = delta > 0;
  const isGood = polarity === "higher-better" ? goingUp : !goingUp;
  return isGood ? GOOD : BAD;
}

const KPI_GRID_COLS = 3;
const KPI_GRID_GAP = 5;

function kpiGridHeight(hasComparison: boolean): number {
  const cardH = hasComparison ? 25 : 22;
  const rows = Math.ceil(KPI_DEFS.length / KPI_GRID_COLS);
  return rows * cardH + (rows - 1) * KPI_GRID_GAP + 8;
}

function drawKpiGrid(
  doc: jsPDF,
  ctx: Ctx,
  y: number,
  totals: Totals,
  reach: number | null,
  comparisonTotals: Totals | null,
  comparisonReach: number | null
): number {
  const cols = KPI_GRID_COLS;
  const gap = KPI_GRID_GAP;
  const cardW = (CONTENT_W - gap * (cols - 1)) / cols;
  const cardH = ctx.periodLine && comparisonTotals ? 25 : 22;

  KPI_DEFS.forEach((def, i) => {
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

  const rows = Math.ceil(KPI_DEFS.length / cols);
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
// Horizontal bar list (vector) — spend distribution, audience, region
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
// Campaign detail tables
// ---------------------------------------------------------------------------

function drawCampaignTables(doc: jsPDF, ctx: Ctx, y: number, campaigns: CampaignInsight[]): number {
  y = sectionTitle(doc, ctx, y, "Desempenho das campanhas");
  doc.setFont(ctx.fonts.body, "normal");
  doc.setFontSize(8);
  setColor(doc, "setTextColor", TEXT_MUTED);
  doc.text(`${campaigns.length} campanha${campaigns.length === 1 ? "" : "s"} nos filtros aplicados.`, MARGIN_X, y);
  y += 6;

  if (campaigns.length === 0) {
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(9);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text("Nenhuma campanha corresponde aos filtros selecionados neste período.", MARGIN_X, y + 4);
    return y + 12;
  }

  const headStyles = { fillColor: NAVY, textColor: WHITE as [number, number, number], fontStyle: "bold" as const, font: ctx.fonts.body, fontSize: 8 };
  const bodyStyles = { font: ctx.fonts.body, fontSize: 7.8, textColor: TEXT as [number, number, number], cellPadding: 2 };

  doc.setFont(ctx.fonts.body, "bold");
  doc.setFontSize(9);
  setColor(doc, "setTextColor", NAVY_DEEP);
  doc.text("Entrega", MARGIN_X, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_BOTTOM + 4, bottom: 16 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: bodyStyles,
    headStyles,
    alternateRowStyles: { fillColor: SILVER_TINT },
    columnStyles: {
      0: { cellWidth: 68 },
      4: { halign: "right" },
      5: { halign: "right" },
      6: { halign: "right" },
      7: { halign: "right" },
    },
    head: [["Campanha", "Conta", "Objetivo", "Status", "Investimento", "Impressões", "Alcance", "CPM"]],
    body: campaigns.map((c) => {
      const cCpm = cpm(c);
      return [
        c.campaignName,
        c.accountName,
        objectiveLabel(c.objective),
        statusLabel(c.status),
        formatCurrencyBRL(c.spend),
        formatInteger(c.impressions),
        formatInteger(c.reach),
        cCpm === null ? "—" : formatCurrencyBRL(cCpm),
      ];
    }),
    didDrawPage: () => {
      drawHeader(doc, ctx);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  y = (doc as any).lastAutoTable.finalY + 10;
  y = ensureSpace(doc, ctx, y, 30);

  doc.setFont(ctx.fonts.body, "bold");
  doc.setFontSize(9);
  setColor(doc, "setTextColor", NAVY_DEEP);
  doc.text("Interação e resultado", MARGIN_X, y);
  y += 5;

  autoTable(doc, {
    startY: y,
    margin: { left: MARGIN_X, right: MARGIN_X, top: HEADER_BOTTOM + 4, bottom: 16 },
    showHead: "everyPage",
    rowPageBreak: "avoid",
    styles: bodyStyles,
    headStyles,
    alternateRowStyles: { fillColor: SILVER_TINT },
    columnStyles: {
      0: { cellWidth: 88 },
      1: { cellWidth: 20, halign: "right" },
      2: { cellWidth: 22, halign: "right" },
      3: { cellWidth: 16, halign: "right" },
      4: { cellWidth: 18, halign: "right" },
      5: { cellWidth: 26, halign: "right" },
      6: { cellWidth: 28, halign: "right" },
    },
    head: [["Campanha", "Cliques totais", "Cliques no link", "CTR", "CPC", "Conversa iniciada", "Custo/conversa"]],
    body: campaigns.map((c) => {
      const cCtr = ctr(c);
      const cCpc = cpc(c);
      const cCostPerConversation = costPerConversation(c);
      return [
        c.campaignName,
        formatInteger(c.clicks),
        formatInteger(c.linkClicks),
        cCtr === null ? "—" : formatPercent(cCtr),
        cCpc === null ? "—" : formatCurrencyBRL(cCpc),
        c.conversations === null ? "Não disponível" : formatInteger(c.conversations),
        cCostPerConversation === null ? "—" : formatCurrencyBRL(cCostPerConversation),
      ];
    }),
    didDrawPage: () => {
      drawHeader(doc, ctx);
    },
  });

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (doc as any).lastAutoTable.finalY + 10;
}

// ---------------------------------------------------------------------------
// Strategic analysis (reuses the same rule-based engine as the dashboard —
// never a separate/invented interpretation)
// ---------------------------------------------------------------------------

function drawInsightBlock(doc: jsPDF, ctx: Ctx, y: number, heading: string, dotColor: [number, number, number], items: InsightItem[]): number {
  if (items.length === 0) return y;
  // Enough room for the heading plus at least the start of its first item —
  // otherwise the heading itself would strand alone at the bottom of a page.
  y = ensureSpace(doc, ctx, y, 22);
  doc.setFont(ctx.fonts.body, "bold");
  doc.setFontSize(9);
  setColor(doc, "setTextColor", NAVY_DEEP);
  doc.text(heading, MARGIN_X + 4, y);
  y += 5.5;

  for (const item of items) {
    const lines = wrapText(doc, item.text, CONTENT_W - 12);
    y = ensureSpace(doc, ctx, y, lines.length * 4.6 + 3);
    setColor(doc, "setFillColor", dotColor);
    doc.circle(MARGIN_X + 5, y - 1.3, 0.9, "F");
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(8.3);
    setColor(doc, "setTextColor", TEXT);
    doc.text(lines, MARGIN_X + 9, y);
    y += lines.length * 4.6 + 2.5;
  }
  return y + 3;
}

function drawAnalysisForScope(doc: jsPDF, ctx: Ctx, y: number, label: string | null, insights: StrategicInsights): number {
  if (label) {
    y = ensureSpace(doc, ctx, y, 24);
    doc.setFont(ctx.fonts.body, "bold");
    doc.setFontSize(10.5);
    setColor(doc, "setTextColor", NAVY);
    doc.text(label, MARGIN_X, y);
    y += 6;
  }
  if (!insights.hasData) {
    doc.setFont(ctx.fonts.body, "normal");
    doc.setFontSize(8.6);
    setColor(doc, "setTextColor", TEXT_MUTED);
    doc.text(wrapText(doc, insights.summary[0]?.text ?? "Sem dados suficientes para interpretação neste escopo.", CONTENT_W - 8), MARGIN_X + 4, y);
    return y + 10;
  }
  y = drawInsightBlock(doc, ctx, y, "Principais resultados", NAVY, insights.summary);
  y = drawInsightBlock(doc, ctx, y, "Pontos de atenção", BAD, insights.attention);
  y = drawInsightBlock(doc, ctx, y, "Oportunidades", GOOD, insights.opportunities);
  y = drawInsightBlock(doc, ctx, y, "Próximas ações priorizadas", NAVY, insights.nextActions);
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

/** Pure document builder — no fetching, no DOM download. Safe to call from Node (tests) or the browser alike once assets are already loaded. */
export function buildReportPdf(input: ReportPdfInput, assets: ReportAssets): jsPDF {
  const doc = new jsPDF({ orientation: "landscape", unit: "mm", format: "a4" });
  const fonts = registerFonts(doc, assets);

  const scopeLine = input.clientLabel ? `${input.clientLabel} · ${input.title}` : `Visão consolidada — múltiplas contas · ${input.title}`;
  const periodLine = input.compare && input.comparisonRange
    ? `${formatShortDate(input.resolvedRange.since)}–${formatShortDate(input.resolvedRange.until)} vs. ${formatShortDate(input.comparisonRange.since)}–${formatShortDate(input.comparisonRange.until)}`
    : `${formatShortDate(input.resolvedRange.since)}–${formatShortDate(input.resolvedRange.until)}`;
  const footerLeft = `${input.clientLabel ?? "Visão consolidada — múltiplas contas"} · ${periodLine}`;

  const ctx: Ctx = { fonts, assets, scopeLine, periodLine, footerLeft };

  const totals = sumTotals(input.campaigns);
  const totalReach = input.reach;
  const comparisonTotals = input.comparisonCampaigns ? sumTotals(input.comparisonCampaigns) : null;
  const comparisonReach = input.comparisonReach;

  const accountIdSet = new Set(input.accounts.map((a) => a.id));
  const dailyAgg = aggregateDailyByDate(input.daily, accountIdSet);
  const comparisonDailyAgg = input.comparisonDaily ? aggregateDailyByDate(input.comparisonDaily, accountIdSet) : null;

  const insights = computeStrategicInsights({
    campaigns: input.campaigns,
    comparisonCampaigns: input.comparisonCampaigns,
    daily: dailyAgg,
    resolvedRange: input.resolvedRange,
    partialAccountNames: input.partialAccountNames,
  });

  // ---- Page 1: abertura e visão executiva ----
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

  const metaCols = 3;
  const metaColW = CONTENT_W / metaCols;
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
    const lines = wrapText(doc, filtersText, CONTENT_W);
    doc.text(lines, MARGIN_X, y);
    y += lines.length * 4 + 3;
  }

  if (input.partialAccountNames.length > 0) {
    setColor(doc, "setTextColor", BAD);
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(7.6);
    const note = `${input.partialAccountNames.length} conta(s) não puderam ser carregadas neste momento (${input.partialAccountNames.join(", ")}) — os totais abaixo estão incompletos, não zerados.`;
    const lines = wrapText(doc, note, CONTENT_W);
    doc.text(lines, MARGIN_X, y);
    y += lines.length * 4 + 3;
  }

  y += 2;
  y = ensureSpace(doc, ctx, y, kpiGridHeight(Boolean(ctx.periodLine && comparisonTotals)));
  y = drawKpiGrid(doc, ctx, y, totals, totalReach, comparisonTotals, comparisonReach);

  y = ensureSpace(doc, ctx, y, 20);
  doc.setFont(fonts.body, "bold");
  doc.setFontSize(9.5);
  setColor(doc, "setTextColor", NAVY_DEEP);
  doc.text("Resumo executivo", MARGIN_X, y);
  y += 5.5;
  doc.setFont(fonts.body, "normal");
  doc.setFontSize(8.4);
  setColor(doc, "setTextColor", TEXT);
  for (const item of insights.summary) {
    const lines = wrapText(doc, item.text, CONTENT_W - 4);
    y = ensureSpace(doc, ctx, y, lines.length * 4.4 + 2);
    doc.text(lines, MARGIN_X, y);
    y += lines.length * 4.4 + 2;
  }

  // ---- Evolução e distribuição ----
  // A fresh page unless the executive summary above already spilled onto a
  // mostly-empty continuation page — then this keeps filling that page
  // instead of leaving it nearly blank and forcing yet another page break.
  y = ensureSpace(doc, ctx, y, 90);
  y = sectionTitle(doc, ctx, y, "Evolução e distribuição");

  const nonSpendPrimary = primaryKpiIds(input.campaigns).find((id) => id !== "spend") ?? "clicks";
  const xLabels = dailyAgg.map((d) => formatShortDate(d.date));
  const chartW = (CONTENT_W - 8) / 2;
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

    const spendSeries: LineSeries[] = [{ values: dailyAgg.map((d) => d.spend), color: NAVY }];
    const resultSeries: LineSeries[] = [{ values: derivedDailySeries(dailyAgg, nonSpendPrimary), color: NAVY }];
    if (input.compare && comparisonDailyAgg && comparisonDailyAgg.length > 0) {
      // Aligned by index (day offset), not calendar date — the two periods cover different dates by definition.
      const n = dailyAgg.length;
      const alignedSpend = Array.from({ length: n }, (_, i) => comparisonDailyAgg[i]?.spend ?? null);
      const alignedResult = derivedDailySeries(
        Array.from({ length: n }, (_, i) => comparisonDailyAgg[i] ?? { date: "", spend: 0, impressions: 0, clicks: 0, linkClicks: 0, reach: 0 }),
        nonSpendPrimary
      ).map((v, i) => (comparisonDailyAgg[i] ? v : null));
      spendSeries.push({ values: alignedSpend, color: SILVER, dashed: true });
      resultSeries.push({ values: alignedResult, color: SILVER, dashed: true });
    }

    drawLineChart(doc, ctx, { x: MARGIN_X, y, w: chartW, h: chartH }, {
      title: "Investimento ao longo do período",
      caption: "Métrica: Investimento (R$) por dia",
      xLabels,
      series: spendSeries,
      formatValue: formatCurrencyBRL,
      legend,
    });
    drawLineChart(doc, ctx, { x: MARGIN_X + chartW + 8, y, w: chartW, h: chartH }, {
      title: `${KPI_LABEL[nonSpendPrimary]} ao longo do período`,
      caption: `Métrica: ${KPI_LABEL[nonSpendPrimary]} por dia — indicador principal do objetivo predominante`,
      xLabels,
      series: resultSeries,
      formatValue: KPI_FORMAT[nonSpendPrimary],
      legend,
    });
    y += chartH + 10;
  }

  y = ensureSpace(doc, ctx, y, 70);
  const distItems = [...input.campaigns].sort((a, b) => b.spend - a.spend).map((c) => ({ label: c.campaignName, value: c.spend }));
  drawBarList(doc, ctx, { x: MARGIN_X, y, w: CONTENT_W, h: 62 }, {
    title: "Distribuição do investimento por campanha",
    caption: "Métrica: Investimento (R$) · até 8 maiores + agregado das demais",
    items: distItems,
    formatValue: formatCurrencyBRL,
  });
  y += 68;

  if (input.audience.length > 0) {
    y = ensureSpace(doc, ctx, y, 60);
    // null-propagation: a bucket only accumulates a number once at least one
    // of its rows actually reports conversations; buckets that never do stay
    // out of the bar list entirely rather than rendering a fabricated zero.
    const byAge = new Map<string, number>();
    const byGender = new Map<string, number>();
    for (const a of input.audience) {
      if (a.conversations === null) continue;
      byAge.set(a.age, (byAge.get(a.age) ?? 0) + a.conversations);
      byGender.set(a.gender, (byGender.get(a.gender) ?? 0) + a.conversations);
    }
    const genderLabel: Record<string, string> = { male: "Masculino", female: "Feminino", unknown: "Não informado" };
    drawBarList(doc, ctx, { x: MARGIN_X, y, w: chartW, h: 52 }, {
      title: "Público por idade",
      caption: "Métrica: Conversa iniciada",
      items: [...byAge.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      formatValue: formatInteger,
    });
    drawBarList(doc, ctx, { x: MARGIN_X + chartW + 8, y, w: chartW, h: 52 }, {
      title: "Público por gênero",
      caption: "Métrica: Conversa iniciada",
      items: [...byGender.entries()].map(([label, value]) => ({ label: genderLabel[label] ?? label, value })).sort((a, b) => b.value - a.value),
      formatValue: formatInteger,
    });
    y += 58;
  }

  if (input.regions.length > 0) {
    y = ensureSpace(doc, ctx, y, 60);
    const byRegion = new Map<string, number>();
    for (const r of input.regions) byRegion.set(r.region, (byRegion.get(r.region) ?? 0) + r.reach);
    drawBarList(doc, ctx, { x: MARGIN_X, y, w: CONTENT_W, h: 56 }, {
      title: "Público por região",
      caption: "Métrica: Alcance (estimativa Meta)",
      items: [...byRegion.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value),
      formatValue: formatInteger,
    });
    y += 62;
  }

  // ---- Campaign performance tables ----
  y = ensureSpace(doc, ctx, y, 60);
  y = drawCampaignTables(doc, ctx, y, input.campaigns);

  // ---- Analysis & next actions ----
  y = ensureSpace(doc, ctx, y, 60);
  y = sectionTitle(doc, ctx, y, "Análise e próximas ações");
  doc.setFont(fonts.body, "normal");
  doc.setFontSize(7.6);
  setColor(doc, "setTextColor", TEXT_MUTED);
  const limitLines = wrapText(doc, insights.limitations, CONTENT_W);
  doc.text(limitLines, MARGIN_X, y);
  y += limitLines.length * 3.8 + 6;

  if (input.accounts.length > 1) {
    for (const account of input.accounts) {
      const accCampaigns = input.campaigns.filter((c) => c.accountId === account.id);
      if (accCampaigns.length === 0) continue;
      const accComparison = input.comparisonCampaigns ? input.comparisonCampaigns.filter((c) => c.accountId === account.id) : null;
      const accDaily = aggregateDailyByDate(input.daily, new Set([account.id]));
      const accInsights = computeStrategicInsights({
        campaigns: accCampaigns,
        comparisonCampaigns: accComparison,
        daily: accDaily,
        resolvedRange: input.resolvedRange,
        partialAccountNames: [],
      });
      y = drawAnalysisForScope(doc, ctx, y, account.name, accInsights);
    }
  } else {
    y = drawAnalysisForScope(doc, ctx, y, null, insights);
  }

  // ---- Methodology notes ----
  y = ensureSpace(doc, ctx, y, 60);
  y = sectionTitle(doc, ctx, y, "Notas metodológicas");

  const methodology: { heading: string; body: string }[] = [
    {
      heading: "Definições das métricas",
      body:
        "Investimento: valor gasto no período. Impressões: exibições dos anúncios. Cliques totais: todo tipo de clique registrado pelo Meta, não apenas cliques no link de destino. Cliques no link: cliques que levam ao destino do anúncio (campo inline_link_clicks) — não é uma conversa iniciada. Conversa iniciada: conversas por mensagem efetivamente iniciadas no Messenger/Instagram/WhatsApp, com atribuição de 7 dias após clique (campo actions, action_type onsite_conversion.messaging_conversation_started_7d) — disponível apenas para campanhas com objetivo de mensagens; quando o objetivo da campanha não suporta essa métrica, ela aparece como \"Não disponível\", nunca como zero. Custo por conversa = Investimento ÷ Conversa iniciada válida, usando apenas o investimento do mesmo escopo filtrado. CTR = Cliques totais ÷ Impressões × 100. CPC = Investimento ÷ Cliques totais. CPM = Investimento ÷ Impressões × 1.000. Alcance: pessoas únicas estimadas alcançadas no período (ver limitação de deduplicação abaixo).",
    },
    { heading: "Fonte dos dados", body: "Meta Ads API, via os Business Managers configurados para esta conta Legado Enterprise, agregados por conta de anúncios e por campanha." },
    {
      heading: "Limitações de alcance e deduplicação",
      body:
        "O Alcance é uma estimativa do Meta, deduplicada apenas dentro de uma única consulta (uma conta, um período, e — quando os filtros deste relatório restringem a campanhas específicas — o mesmo conjunto de campanhas). Por isso o Alcance total nunca é a soma do alcance de cada campanha ou de cada dia — somar essas quebras contaria a mesma pessoa mais de uma vez; quando o filtro seleciona um subconjunto de campanhas, o Alcance é recalculado na origem para esse subconjunto exato, preservando a deduplicação, em vez de somar valores individuais. Os valores diários de alcance servem para observar tendência, nunca para somar em um total. Se essa apuração não puder ser concluída com confiança para os filtros aplicados, o indicador é exibido como \"Não disponível\" em vez do valor consolidado da conta.",
    },
    {
      heading: "Critério de atribuição",
      body: "As métricas seguem o critério de atribuição padrão configurado em cada conta de anúncios de origem no Meta Ads Manager — a Legado Intelligence não aplica um modelo de atribuição próprio nem o altera.",
    },
    {
      heading: "Tratamento de dados ausentes",
      body:
        input.partialAccountNames.length > 0
          ? `${input.partialAccountNames.length} conta(s) não puderam ser carregadas na geração deste relatório (${input.partialAccountNames.join(", ")}) — os totais não as incluem e não devem ser lidos como "zero" para essas contas. Um indicador exibido como "—" significa ausência de base para o cálculo (ex.: divisão por zero), não um valor nulo.`
          : 'Todas as contas do escopo carregaram normalmente. Um indicador exibido como "—" significa ausência de base para o cálculo (ex.: divisão por zero), não um valor de zero.',
    },
    { heading: "Limites das conclusões", body: insights.limitations },
  ];

  for (const section of methodology) {
    y = ensureSpace(doc, ctx, y, 14);
    doc.setFont(fonts.body, "bold");
    doc.setFontSize(8.6);
    setColor(doc, "setTextColor", NAVY_DEEP);
    doc.text(section.heading, MARGIN_X, y);
    y += 4.4;
    doc.setFont(fonts.body, "normal");
    doc.setFontSize(7.8);
    setColor(doc, "setTextColor", TEXT);
    const lines = wrapText(doc, section.body, CONTENT_W);
    y = ensureSpace(doc, ctx, y, lines.length * 3.9);
    doc.text(lines, MARGIN_X, y);
    y += lines.length * 3.9 + 5;
  }

  // ---- Final pass: footer with "Página X de Y" on every page ----
  const totalPages = doc.getNumberOfPages();
  for (let p = 1; p <= totalPages; p++) {
    doc.setPage(p);
    drawFooter(doc, ctx, p, totalPages);
  }

  void medFont; // reserved for future semibold-specific labels; kept resolvable now that the font is registered

  return doc;
}

/** Loads assets, builds the document and triggers a browser download. Never throws for a missing logo/font — the report still generates with graceful fallbacks. Throws ReportPdfError only if jsPDF itself fails to produce a document. */
export async function downloadCampaignReportPdf(input: ReportPdfInput): Promise<void> {
  const assets = await loadReportAssets();
  let doc: jsPDF;
  try {
    doc = buildReportPdf(input, assets);
  } catch (err) {
    throw new ReportPdfError(err instanceof Error ? err.message : "Falha ao montar o PDF.");
  }
  doc.save(reportFileName(input));
}
