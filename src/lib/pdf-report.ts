"use client";

// Client-only: builds a branded, downloadable PDF report from an already
// filtered set of campaigns — used both for the "Baixar PDF" button (the
// current on-screen view) and for a report template's "Aplicar e gerar PDF"
// (an isolated fetch + filter, never touching the live dashboard's state).
// jsPDF/autotable only run in the browser (canvas/DOM APIs), so this module
// must only ever be invoked from a click handler in a "use client" component
// — never at render/SSR time.

import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import type { CampaignInsight } from "./meta-ads-types";
import { objectiveLabel, statusLabel } from "./campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "./format";
import { ctr, cpc, cpm, costPerConversation, type Totals } from "./metrics";

const NAVY: [number, number, number] = [15, 27, 46];
const CYAN: [number, number, number] = [56, 217, 245];
const GRAY: [number, number, number] = [100, 116, 139];
const LIGHT_GRAY: [number, number, number] = [243, 244, 246];
const BORDER_GRAY: [number, number, number] = [226, 232, 240];

export type ReportPdfInput = {
  /** Report/template name shown as the document subtitle. */
  title: string;
  /** Business name for a client-scoped report, or null for "todas as contas". */
  clientLabel: string | null;
  periodLabel: string;
  generatedAt: Date;
  campaigns: CampaignInsight[];
  /** spend/impressions/clicks/linkClicks from sumTotals() — its own `reach` field is ignored (see totalReach). */
  totals: Totals;
  /** The true deduplicated reach for this scope, from AccountReach — never derived from summing campaign rows. */
  totalReach: number;
};

function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(date);
}

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

async function loadLogoDataUrl(): Promise<string | null> {
  try {
    const res = await fetch("/brand/logo-legado.png");
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error("Falha ao ler o logo"));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

type Kpi = { label: string; value: string };

function buildKpis(totals: Totals, totalReach: number): Kpi[] {
  const cCtr = ctr(totals);
  const cCpc = cpc(totals);
  const cCpm = cpm(totals);
  const cCostPerConversation = costPerConversation(totals);
  return [
    { label: "Investimento", value: formatCurrencyBRL(totals.spend) },
    { label: "Impressões", value: formatInteger(totals.impressions) },
    { label: "Cliques (todos)", value: formatInteger(totals.clicks) },
    { label: "Conversa iniciada", value: formatInteger(totals.linkClicks) },
    { label: "Custo/conversa", value: cCostPerConversation === null ? "—" : formatCurrencyBRL(cCostPerConversation) },
    { label: "CTR", value: cCtr === null ? "—" : formatPercent(cCtr) },
    { label: "CPC", value: cCpc === null ? "—" : formatCurrencyBRL(cCpc) },
    { label: "CPM", value: cCpm === null ? "—" : formatCurrencyBRL(cCpm) },
    { label: "Alcance", value: formatInteger(totalReach) },
  ];
}

/** Builds the branded PDF and triggers a browser download. Never throws for a missing logo — the report still generates without it. */
export async function downloadCampaignReportPdf(input: ReportPdfInput): Promise<void> {
  const logoDataUrl = await loadLogoDataUrl();

  const doc = new jsPDF({ orientation: "portrait", unit: "mm", format: "a4" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const marginX = 15;
  let y = 20;

  const hasLogo = Boolean(logoDataUrl);
  if (logoDataUrl) {
    doc.addImage(logoDataUrl, "PNG", marginX, y - 8, 18, 18);
  }
  const textX = hasLogo ? marginX + 24 : marginX;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(17);
  doc.setTextColor(...NAVY);
  doc.text("Legado Intelligence", textX, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10.5);
  doc.setTextColor(...GRAY);
  doc.text(input.title, textX, y + 6.5);
  y += 18;

  doc.setDrawColor(...CYAN);
  doc.setLineWidth(0.8);
  doc.line(marginX, y, pageWidth - marginX, y);
  y += 8;

  doc.setFontSize(10.5);
  doc.setFont("helvetica", "bold");
  doc.setTextColor(...NAVY);
  doc.text(`Cliente: ${input.clientLabel ?? "Legado Enterprise — todas as contas"}`, marginX, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...GRAY);
  doc.text(`Período: ${input.periodLabel}`, marginX, y);
  y += 5.5;
  doc.text(`Gerado em: ${formatDateTime(input.generatedAt)}`, marginX, y);
  y += 12;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(...NAVY);
  doc.text("Resumo do período", marginX, y);
  y += 7;

  const kpis = buildKpis(input.totals, input.totalReach);
  const cols = 3;
  const gap = 4;
  const cardWidth = (pageWidth - marginX * 2 - gap * (cols - 1)) / cols;
  const cardHeight = 20;
  kpis.forEach((kpi, i) => {
    const col = i % cols;
    const row = Math.floor(i / cols);
    const x = marginX + col * (cardWidth + gap);
    const cardY = y + row * (cardHeight + gap);

    doc.setDrawColor(...BORDER_GRAY);
    doc.setFillColor(...LIGHT_GRAY);
    doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, "FD");
    doc.setFillColor(...CYAN);
    doc.rect(x, cardY, 1.2, cardHeight, "F");

    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...GRAY);
    doc.text(kpi.label.toUpperCase(), x + 4, cardY + 7);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(12.5);
    doc.setTextColor(...NAVY);
    doc.text(kpi.value, x + 4, cardY + 15);
  });

  if (input.campaigns.length === 0) {
    y += Math.ceil(kpis.length / cols) * (cardHeight + gap) + 6;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(10);
    doc.setTextColor(...GRAY);
    doc.text("Sem campanhas no período para os filtros selecionados.", marginX, y);
    doc.save(fileName(input.title));
    return;
  }

  doc.addPage("a4", "landscape");
  const landscapeWidth = doc.internal.pageSize.getWidth();
  const landscapeHeight = doc.internal.pageSize.getHeight();

  autoTable(doc, {
    startY: 14,
    margin: { left: 10, right: 10, bottom: 14 },
    head: [
      [
        "Campanha",
        "Conta",
        "Objetivo",
        "Status",
        "Investimento",
        "Impressões",
        "Cliques",
        "Conversa iniciada",
        "Custo/conversa",
        "CTR",
        "CPC",
        "CPM",
        "Alcance",
      ],
    ],
    body: input.campaigns.map((c) => {
      const cCtr = ctr(c);
      const cCpc = cpc(c);
      const cCpm = cpm(c);
      const cCostPerConversation = costPerConversation(c);
      return [
        c.campaignName,
        c.accountName,
        objectiveLabel(c.objective),
        statusLabel(c.status),
        formatCurrencyBRL(c.spend),
        formatInteger(c.impressions),
        formatInteger(c.clicks),
        formatInteger(c.linkClicks),
        cCostPerConversation === null ? "—" : formatCurrencyBRL(cCostPerConversation),
        cCtr === null ? "—" : formatPercent(cCtr),
        cCpc === null ? "—" : formatCurrencyBRL(cCpc),
        cCpm === null ? "—" : formatCurrencyBRL(cCpm),
        formatInteger(c.reach),
      ];
    }),
    styles: { fontSize: 7.5, cellPadding: 1.8, textColor: NAVY },
    headStyles: { fillColor: NAVY, textColor: 255, fontStyle: "bold" },
    alternateRowStyles: { fillColor: LIGHT_GRAY },
    didDrawPage: () => {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...GRAY);
      doc.text(
        `Legado Intelligence · página ${doc.getNumberOfPages()}`,
        landscapeWidth - 10,
        landscapeHeight - 6,
        { align: "right" }
      );
    },
  });

  doc.save(fileName(input.title));
}

function fileName(title: string): string {
  const today = new Date().toISOString().slice(0, 10);
  return `relatorio-${slugify(title)}-${today}.pdf`;
}
