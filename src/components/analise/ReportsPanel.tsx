"use client";

import { useEffect, useState } from "react";
import type { CampaignInsight, DateRange, Period } from "@/lib/meta-ads-types";
import { DATE_PRESETS } from "@/lib/meta-ads-types";
import { formatShortDate } from "@/lib/format";
import { toSavedIdFilter } from "@/lib/campaign-filters";
import type { ReportFilters, ReportTemplateSummary } from "@/lib/report-templates-types";
import type { PdfReportType } from "@/lib/pdf-report-core";
import type { ClientAccessSummary } from "@/lib/client-access-types";
import type { ResolvedReportSettings, ReportType } from "@/lib/client-permissions";
import { OTHER_COLUMN_OPTIONS, type ReportIndicatorId } from "@/lib/report-indicators";
import type { FilterOption } from "./MultiSelectFilter";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";
import { MascotState } from "./Mascot";
import ReportBuilderDrawer from "./ReportBuilderDrawer";

class ExportError extends Error {}

/** Slugified default filename mirror of pdf-report-core.ts's own reportFileName — used only for the pre-generation preview text; the real filename is the one the server actually sends in Content-Disposition. */
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

function previewFileNameFor(clientLabel: string | null, isMultiClient: boolean, resolvedRange: DateRange, reportVersion: ReportType): string {
  const scope = isMultiClient ? "multiplas-contas" : slugify(clientLabel ?? "consolidado");
  const suffix = reportVersion === "tecnico" ? "_tecnico" : "";
  return `legado-intelligence_${scope}${suffix}_${resolvedRange.since}_a_${resolvedRange.until}.pdf`;
}

/** Extracts a server-sent filename from Content-Disposition, falling back to the local preview name if the header is missing or unparsable. */
function fileNameFromContentDisposition(header: string | null, fallback: string): string {
  if (!header) return fallback;
  const match = /filename="?([^";]+)"?/.exec(header);
  return match?.[1] ?? fallback;
}

async function downloadFromServer(url: string, body: unknown, fallbackFileName: string, errorFallback: string): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const errBody = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new ExportError(errBody?.error ?? errorFallback);
  }
  const blob = await res.blob();
  const fileName = fileNameFromContentDisposition(res.headers.get("Content-Disposition"), fallbackFileName);
  const downloadUrl = URL.createObjectURL(blob);
  try {
    const a = document.createElement("a");
    a.href = downloadUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    a.remove();
  } finally {
    URL.revokeObjectURL(downloadUrl);
  }
}

type PdfRequestBody = {
  title: string;
  filters: ReportFilters;
  reportType?: PdfReportType;
  reportVersion: ReportType;
  indicators: ReportIndicatorId[];
  rememberSelection?: boolean;
  recipientClientId?: string | null;
};

async function downloadPdfFromServer(body: PdfRequestBody, fallbackFileName: string): Promise<void> {
  return downloadFromServer("/api/analise/reports/pdf/", body, fallbackFileName, "Não foi possível gerar o PDF. Tente novamente.");
}

async function downloadCsvFromServer(
  body: { kind: "campaigns" | "account-summary" | "ads"; filters: ReportFilters; recipientClientId?: string | null },
  fallbackFileName: string
): Promise<void> {
  return downloadFromServer("/api/analise/reports/csv/", body, fallbackFileName, "Não foi possível gerar a exportação. Tente novamente.");
}

// The five fixed, always-available report shapes — distinct from the
// "Modelos de relatório" below (saved FILTER presets that still render the
// one full PDF). These vary what's actually drawn/exported, always against
// whatever filters are active on screen right now, so there's no separate
// scope to configure.
type PredefinedPdfReport = { id: PdfReportType; format: "pdf"; label: string; description: string; indicators: ReportIndicatorId[] };
type PredefinedCsvReport = { id: "creative" | "raw"; format: "csv"; csvKind: "ads" | "campaigns"; label: string; description: string };
type PredefinedReport = PredefinedPdfReport | PredefinedCsvReport;

const AUDIENCE_INDICATORS: ReportIndicatorId[] = [
  "audienceAge",
  "audienceGender",
  "audienceRegion",
  "platformDistribution",
  "deviceDistribution",
  "topHours",
];

const EXECUTIVE_INDICATORS: ReportIndicatorId[] = [
  "spend",
  "impressions",
  "clicks",
  "linkClicks",
  "conversations",
  "costPerConversation",
  "ctr",
  "cpc",
  "cpm",
  "reach",
  // Em vez de um único gráfico de evolução, o Executivo organiza seus KPIs
  // em torno de 3 indicadores-âncora (Investimento, Conversa iniciada,
  // Custo por conversa iniciada) — cada um com seu próprio gráfico e seu
  // próprio ranking de campanhas reordenado por ele (a pedido do cliente).
  "kpiBreakdownByAnchor",
  "compare",
  "strategicInsights",
  "resultsByObjective",
  "budgetPacing",
];

// Deliberadamente SEM kpiBreakdownByAnchor/strategicInsights/resultsByObjective/
// budgetPacing — esses são o conteúdo exclusivo do Executivo, e repeti-los
// aqui faria o Executivo perder o sentido de existir como relatório à parte.
// Também sem os breakdowns de público/distribuição, que são exclusivos de
// "Público e distribuição". O que sobra é o que só este relatório tem:
// detalhe campanha a campanha (ranking, investimento por campanha,
// hierarquia campanha → conjunto → anúncio, melhores anúncios).
const CAMPAIGN_PERFORMANCE_INDICATORS: ReportIndicatorId[] = [
  "spend",
  "impressions",
  "clicks",
  "linkClicks",
  "conversations",
  "costPerConversation",
  "ctr",
  "cpc",
  "cpm",
  "reach",
  "trendChart",
  "compare",
  "spendByCampaign",
  "campaignRanking",
  "campaignHierarchy",
  "bestAds",
  ...OTHER_COLUMN_OPTIONS.map((o) => o.id),
];

const PREDEFINED_REPORTS: PredefinedReport[] = [
  {
    id: "executive",
    format: "pdf",
    label: "Executivo",
    description: "Uma página com os KPIs principais, resumo executivo e evolução — para decisão rápida, sem detalhe campanha a campanha.",
    indicators: EXECUTIVE_INDICATORS,
  },
  {
    id: "detailed",
    format: "pdf",
    label: "Performance por campanha",
    description: "Detalhe campanha a campanha: investimento por campanha, ranking, hierarquia campanha → conjunto → anúncio e melhores anúncios.",
    indicators: CAMPAIGN_PERFORMANCE_INDICATORS,
  },
  {
    id: "audience",
    format: "pdf",
    label: "Público e distribuição",
    description: "Só os breakdowns de público e entrega: idade/gênero, região, plataforma, posicionamento, dispositivo, país e horário.",
    indicators: AUDIENCE_INDICATORS,
  },
  {
    id: "creative",
    format: "csv",
    csvKind: "ads",
    label: "Criativos e qualidade",
    description: "Uma linha por anúncio: ranking de qualidade/engajamento/conversão, miniatura, título, corpo e CTA do criativo.",
  },
  {
    id: "raw",
    format: "csv",
    csvKind: "campaigns",
    label: "Exportação bruta completa",
    description: "Todos os dados por campanha em CSV, prontos para sua própria planilha ou BI.",
  },
];

type ReportsPanelProps = {
  campaigns: CampaignInsight[];
  periodLabel: string;
  clientLabel: string | null;
  isMultiClient: boolean;
  isAdmin: boolean;
  dbConfigured: boolean;
  reportSettings: ResolvedReportSettings;
  internalIndicatorIds: ReportIndicatorId[];
  hiddenIndicatorIds: Set<ReportIndicatorId>;

  period: Period;
  resolvedRange: DateRange;
  comparisonRange: DateRange | null;
  compare: boolean;
  /** True while the scoped reach recalculation triggered by a campaign/ad set/objective/status filter is still in flight — the ad-hoc PDF is held back rather than fired while this screen's own filters are still settling (the server recomputes reach itself from the submitted filters, never from anything held in the browser). */
  reachPending: boolean;

  accountIds: Set<string>;
  accountOptions: FilterOption[];
  campaignIds: Set<string>;
  campaignOptions: FilterOption[];
  adSetIds: Set<string>;
  adSetOptions: FilterOption[];
  objectiveIds: Set<string>;
  objectiveOptions: FilterOption[];
  statusIds: Set<string>;
  statusOptions: FilterOption[];
};

function periodSummary(period: Period): string {
  if (period.kind === "preset") {
    return DATE_PRESETS.find((p) => p.value === period.preset)?.label ?? period.preset;
  }
  return `${formatShortDate(period.range.since)} – ${formatShortDate(period.range.until)}`;
}

function idsSummary(saved: string[], options: FilterOption[]): string {
  if (options.length === 0) return `${saved.length} selecionado${saved.length === 1 ? "" : "s"}`;
  const byId = new Map(options.map((o) => [o.id, o.label]));
  const labels = saved.map((id) => byId.get(id)).filter((l): l is string => Boolean(l));
  if (labels.length === 0) return `${saved.length} selecionado${saved.length === 1 ? "" : "s"}`;
  if (labels.length <= 2) return labels.join(", ");
  return `${labels.length} selecionados`;
}

function templateSummary(
  filters: ReportFilters,
  options: {
    accountOptions: FilterOption[];
    campaignOptions: FilterOption[];
    adSetOptions: FilterOption[];
    objectiveOptions: FilterOption[];
    statusOptions: FilterOption[];
  }
): string {
  const parts = [periodSummary(filters.period)];
  if (filters.compare) parts.push("Comparando com período anterior");
  if (filters.accountIds !== null) parts.push(`Contas: ${idsSummary(filters.accountIds, options.accountOptions)}`);
  if (filters.campaignIds !== null) parts.push(`Campanhas: ${idsSummary(filters.campaignIds, options.campaignOptions)}`);
  if (filters.adSetIds !== null) parts.push(`Conjuntos: ${idsSummary(filters.adSetIds, options.adSetOptions)}`);
  if (filters.objectiveIds !== null) parts.push(`Objetivo: ${idsSummary(filters.objectiveIds, options.objectiveOptions)}`);
  if (filters.statusIds !== null) parts.push(`Status: ${idsSummary(filters.statusIds, options.statusOptions)}`);
  return parts.join(" · ");
}

type DrawerContext = {
  title: string;
  filters: ReportFilters;
  initialIndicatorSet: ReportIndicatorId[] | null;
  periodLabel: string;
  comparisonLabel: string | null;
};

export default function ReportsPanel({
  campaigns,
  periodLabel,
  clientLabel,
  isMultiClient,
  isAdmin,
  dbConfigured,
  reportSettings,
  internalIndicatorIds,
  hiddenIndicatorIds,
  period,
  resolvedRange,
  comparisonRange,
  compare,
  reachPending,
  accountIds,
  accountOptions,
  campaignIds,
  campaignOptions,
  adSetIds,
  adSetOptions,
  objectiveIds,
  objectiveOptions,
  statusIds,
  statusOptions,
}: ReportsPanelProps) {
  const today = new Date().toISOString().slice(0, 10);

  const [templates, setTemplates] = useState<ReportTemplateSummary[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!successMessage) return;
    const t = setTimeout(() => setSuccessMessage(null), 5000);
    return () => clearTimeout(t);
  }, [successMessage]);

  // Admin-only: which client this PDF should be generated FOR — "" means the
  // administrator's own unrestricted, all-metrics export, never silently
  // treated as if it were already scoped to a specific client. The
  // permissions actually applied are always resolved server-side from this
  // id, never trusted from anything else sent by the browser.
  const [recipientClients, setRecipientClients] = useState<ClientAccessSummary[] | null>(null);
  const [recipientClientId, setRecipientClientId] = useState<string>("");

  const [exportingCsv, setExportingCsv] = useState<"campaigns" | "account-summary" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const [predefinedLoading, setPredefinedLoading] = useState<PredefinedReport["id"] | null>(null);
  const [predefinedError, setPredefinedError] = useState<{ id: PredefinedReport["id"]; message: string } | null>(null);

  const [drawerContext, setDrawerContext] = useState<DrawerContext | null>(null);
  const [downloading, setDownloading] = useState(false);
  const [templateGenerating, setTemplateGenerating] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  useEffect(() => {
    if (!dbConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analise/report-templates/");
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          if (!cancelled) setTemplatesError(body?.error ?? "Não foi possível carregar os modelos.");
          return;
        }
        const body = (await res.json()) as { templates: ReportTemplateSummary[] };
        if (!cancelled) setTemplates(body.templates);
      } catch {
        if (!cancelled) setTemplatesError("Falha de conexão ao carregar os modelos.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [dbConfigured]);

  useEffect(() => {
    if (!isAdmin || !dbConfigured) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/analise/admin/clients/");
        if (!res.ok) return;
        const body = (await res.json()) as { clients: ClientAccessSummary[] };
        if (!cancelled) setRecipientClients(body.clients);
      } catch {
        // Recipient selector simply stays unavailable — the admin can still generate their own internal report.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, dbConfigured]);

  // Both CSV exports are generated server-side from the exact same
  // permission-resolved dataset as the PDF (see report-data.ts) — a hidden
  // column is genuinely absent from the file, not just omitted from a
  // client-side loop over data that was already sitting fully unrestricted
  // in the browser.
  function currentFiltersForExport(): ReportFilters {
    return {
      period,
      compare,
      accountIds: toSavedIdFilter(accountIds, accountOptions),
      campaignIds: toSavedIdFilter(campaignIds, campaignOptions),
      adSetIds: toSavedIdFilter(adSetIds, adSetOptions),
      objectiveIds: toSavedIdFilter(objectiveIds, objectiveOptions),
      statusIds: toSavedIdFilter(statusIds, statusOptions),
    };
  }

  const currentComparisonLabel =
    compare && comparisonRange ? `comparando com ${formatShortDate(comparisonRange.since)} a ${formatShortDate(comparisonRange.until)}` : null;

  // Pulls the exact bytes the drawer's own "Baixar PDF" button would fetch,
  // using the entry point's own indicator set (null for ad-hoc — the server
  // then applies its own "every indicator this recipient isn't denied"
  // default) and the recipient's default report type. Used only when
  // reportSettings.canBuild is false: nothing calls this while the picker
  // is reachable, since then the drawer's own button is what fires it.
  async function generateReportPdfNow(ctx: DrawerContext): Promise<void> {
    await downloadPdfFromServer(
      {
        title: ctx.title,
        filters: ctx.filters,
        reportVersion: reportSettings.defaultType,
        indicators: ctx.initialIndicatorSet ?? [],
        rememberSelection: false,
        recipientClientId: recipientClientId || null,
      },
      previewFileNameFor(clientLabel, isMultiClient, resolvedRange, reportSettings.defaultType)
    );
  }

  function openDrawerForCurrent() {
    if (reachPending) {
      setDownloadError("Aguarde o cálculo do alcance para os filtros atuais antes de gerar o PDF.");
      return;
    }
    setDownloadError(null);
    const ctx: DrawerContext = {
      title: "Relatório de campanhas",
      filters: currentFiltersForExport(),
      initialIndicatorSet: null,
      periodLabel,
      comparisonLabel: currentComparisonLabel,
    };
    if (!reportSettings.canBuild) {
      if (downloading) return;
      setDownloading(true);
      generateReportPdfNow(ctx)
        .then(() => setSuccessMessage("Relatório gerado!"))
        .catch((err) => setDownloadError(err instanceof ExportError ? err.message : "Não foi possível gerar o PDF. Tente novamente."))
        .finally(() => setDownloading(false));
      return;
    }
    setDrawerContext(ctx);
  }

  function openDrawerForPredefined(report: PredefinedPdfReport) {
    if (reachPending) {
      setPredefinedError({ id: report.id, message: "Aguarde o cálculo do alcance para os filtros atuais antes de gerar o PDF." });
      return;
    }
    setDownloadError(null);
    const ctx: DrawerContext = {
      title: `Relatório ${report.label.toLowerCase()}`,
      filters: currentFiltersForExport(),
      initialIndicatorSet: report.indicators,
      periodLabel,
      comparisonLabel: currentComparisonLabel,
    };
    if (!reportSettings.canBuild) {
      if (predefinedLoading) return;
      setPredefinedLoading(report.id);
      setPredefinedError(null);
      generateReportPdfNow(ctx)
        .then(() => setSuccessMessage("Relatório gerado!"))
        .catch((err) => setPredefinedError({ id: report.id, message: err instanceof ExportError ? err.message : "Não foi possível gerar. Tente novamente." }))
        .finally(() => setPredefinedLoading(null));
      return;
    }
    setDrawerContext(ctx);
  }

  function openDrawerForTemplate(template: ReportTemplateSummary) {
    setRowError(null);
    setDownloadError(null);
    const ctx: DrawerContext = {
      title: template.name,
      filters: template.filters,
      initialIndicatorSet: template.indicators,
      periodLabel: periodSummary(template.filters.period),
      comparisonLabel: template.filters.compare ? "comparando com o período anterior" : null,
    };
    if (!reportSettings.canBuild) {
      if (templateGenerating) return;
      setTemplateGenerating(template.id);
      generateReportPdfNow(ctx)
        .then(() => setSuccessMessage("Relatório gerado!"))
        .catch((err) => setRowError({ id: template.id, message: err instanceof ExportError ? err.message : "Não foi possível gerar. Tente novamente." }))
        .finally(() => setTemplateGenerating(null));
      return;
    }
    setDrawerContext(ctx);
  }

  async function downloadPredefinedCsv(report: PredefinedCsvReport) {
    if (predefinedLoading) return;
    setPredefinedLoading(report.id);
    setPredefinedError(null);
    try {
      await downloadCsvFromServer(
        { kind: report.csvKind, filters: currentFiltersForExport(), recipientClientId: recipientClientId || null },
        `${report.id === "creative" ? "criativos-e-qualidade" : "exportacao-completa"}-${today}.csv`
      );
      setSuccessMessage("Arquivo gerado!");
    } catch (err) {
      setPredefinedError({ id: report.id, message: err instanceof ExportError ? err.message : "Não foi possível gerar. Tente novamente." });
    } finally {
      setPredefinedLoading(null);
    }
  }

  async function handleDrawerDownload(opts: { reportType: ReportType; indicators: ReportIndicatorId[]; rememberSelection: boolean }) {
    if (!drawerContext || downloading) return;
    setDownloading(true);
    setDownloadError(null);
    try {
      await downloadPdfFromServer(
        {
          title: drawerContext.title,
          filters: drawerContext.filters,
          reportVersion: opts.reportType,
          indicators: opts.indicators,
          rememberSelection: opts.rememberSelection,
          recipientClientId: recipientClientId || null,
        },
        previewFileNameFor(clientLabel, isMultiClient, resolvedRange, opts.reportType)
      );
      setSuccessMessage("Relatório gerado!");
      setDrawerContext(null);
    } catch (err) {
      setDownloadError(err instanceof ExportError ? err.message : "Não foi possível gerar o PDF. Tente novamente.");
    } finally {
      setDownloading(false);
    }
  }

  async function handleSaveAsTemplate(opts: { reportType: ReportType; indicators: ReportIndicatorId[]; name: string }) {
    if (!drawerContext) return;
    const res = await fetch("/api/analise/report-templates/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: opts.name, filters: drawerContext.filters, reportType: opts.reportType, indicators: opts.indicators }),
    });
    const body = await res.json();
    if (!res.ok) throw new Error(body?.error ?? "Não foi possível criar o modelo.");
    setTemplates((prev) => [
      { id: body.id, name: body.name, filters: body.filters, reportType: body.reportType, indicators: body.indicators, createdAt: new Date().toISOString() },
      ...(prev ?? []),
    ]);
  }

  async function exportCampaigns() {
    if (exportingCsv) return;
    setExportingCsv("campaigns");
    setExportError(null);
    try {
      await downloadCsvFromServer(
        { kind: "campaigns", filters: currentFiltersForExport(), recipientClientId: recipientClientId || null },
        `campanhas-${today}.csv`
      );
      setSuccessMessage("Arquivo gerado!");
    } catch (err) {
      setExportError(err instanceof ExportError ? err.message : "Não foi possível exportar. Tente novamente.");
    } finally {
      setExportingCsv(null);
    }
  }

  async function exportAccountSummary() {
    if (exportingCsv) return;
    setExportingCsv("account-summary");
    setExportError(null);
    try {
      await downloadCsvFromServer(
        { kind: "account-summary", filters: currentFiltersForExport(), recipientClientId: recipientClientId || null },
        `resumo-por-conta-${today}.csv`
      );
      setSuccessMessage("Arquivo gerado!");
    } catch (err) {
      setExportError(err instanceof ExportError ? err.message : "Não foi possível exportar. Tente novamente.");
    } finally {
      setExportingCsv(null);
    }
  }

  async function handleDeleteTemplate(id: string) {
    if (confirmingDelete !== id) {
      setConfirmingDelete(id);
      return;
    }
    setConfirmingDelete(null);
    setTemplates((prev) => (prev ?? []).filter((t) => t.id !== id));
    await fetch(`/api/analise/report-templates/${id}/`, { method: "DELETE" }).catch(() => {});
  }

  const optionSets = { accountOptions, campaignOptions, adSetOptions, objectiveOptions, statusOptions };
  const selectedRecipient = recipientClients?.find((c) => c.id === recipientClientId) ?? null;
  const previewClientLabel = recipientClientId ? (selectedRecipient?.label ?? null) : clientLabel;

  return (
    <div className="space-y-4">
      {successMessage && (
        <div className="rounded-2xl border border-intel-green/20 bg-intel-green/[0.06]">
          <MascotState
            pose="legacy-conquista"
            secondaryPose="titan-conquista"
            alt="Legacy, mascote da Legado, comemorando o relatório gerado"
            secondaryAlt="Titan, mascote da Legado, comemorando o relatório gerado"
            message={successMessage}
            tone="success"
            className="py-4"
          />
        </div>
      )}
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Baixar relatório em PDF</h3>
        <p className="text-[12px] text-intel-text-dim mb-1">
          Escolha os indicadores e a versão (Simplificado/Técnico) no painel &quot;Montar relatório&quot; antes de baixar — {periodLabel}.
        </p>
        {isAdmin && dbConfigured && (
          <div className="mb-4 mt-3">
            <label htmlFor="report-recipient" className={INTEL_LABEL}>
              Gerar como
            </label>
            <select
              id="report-recipient"
              value={recipientClientId}
              onChange={(e) => setRecipientClientId(e.target.value)}
              className={`${INTEL_INPUT} mt-2`}
            >
              <option value="">Visão administrativa completa</option>
              {(recipientClients ?? []).map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
            {recipientClientId && (
              <p className="mt-1.5 text-[11px] text-intel-text-dim/70">
                O PDF será gerado com as permissões de indicadores atuais deste cliente — nunca com os privilégios de administrador.
              </p>
            )}
          </div>
        )}
        <p className="text-[11px] text-intel-text-dim/70 mb-5">
          Arquivo: {previewFileNameFor(previewClientLabel, isMultiClient, resolvedRange, reportSettings.defaultType)}
        </p>
        <button
          type="button"
          onClick={openDrawerForCurrent}
          disabled={reachPending || downloading}
          aria-busy={downloading}
          className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full bg-intel-cyan text-[#04121a] font-medium hover:brightness-110 transition-[filter] duration-200 disabled:opacity-40 disabled:cursor-wait"
        >
          {reachPending
            ? "Calculando alcance dos filtros..."
            : downloading
              ? "Gerando relatório..."
              : reportSettings.canBuild
                ? "Montar relatório do período atual"
                : "Baixar PDF do período atual"}
        </button>
        {reachPending && (
          <p className="mt-2 text-[12px] text-intel-text-dim">
            Recalculando o alcance deduplicado para os filtros de campanha atuais antes de liberar o download.
          </p>
        )}
        {downloadError && !drawerContext && (
          <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-[12px] text-intel-red">{downloadError}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Relatórios predefinidos</h3>
        <p className="text-[12px] text-intel-text-dim mb-5">
          Formatos prontos para os filtros ativos agora — {periodLabel}. Cada indicador não autorizado ou sem dado real no período fica de fora, nunca aparece vazio.
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          {PREDEFINED_REPORTS.map((report) => (
            <div key={report.id} className="rounded-xl border border-white/[0.07] bg-intel-surface-2 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] text-intel-text font-medium">{report.label}</p>
                <span className="text-[10px] tracking-[0.08em] uppercase text-intel-text-dim/70 shrink-0">{report.format}</span>
              </div>
              <p className="text-[11.5px] text-intel-text-dim leading-relaxed flex-1">{report.description}</p>
              <button
                type="button"
                onClick={() => (report.format === "pdf" ? openDrawerForPredefined(report) : downloadPredefinedCsv(report))}
                disabled={campaigns.length === 0 || predefinedLoading !== null || (report.format === "pdf" && reachPending)}
                aria-busy={predefinedLoading === report.id}
                className="self-start mt-1 text-[12px] tracking-[0.06em] uppercase px-3.5 py-2 rounded-full bg-intel-cyan/[0.14] text-intel-cyan hover:bg-intel-cyan/[0.22] transition-colors duration-200 disabled:opacity-50 disabled:cursor-wait"
              >
                {predefinedLoading === report.id
                  ? "Gerando..."
                  : report.format === "pdf"
                    ? reportSettings.canBuild
                      ? "Montar relatório"
                      : "Baixar PDF"
                    : "Baixar CSV"}
              </button>
              {predefinedError?.id === report.id && (
                <p className="text-[11.5px] text-intel-red" role="alert">
                  {predefinedError.message}
                </p>
              )}
            </div>
          ))}
        </div>
        {campaigns.length === 0 && <p className="mt-3 text-[12px] text-intel-text-dim">Sem campanhas no período para gerar relatórios.</p>}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Modelos de relatório</h3>
        <p className="text-[12px] text-intel-text-dim mb-5">
          {reportSettings.canBuild
            ? 'Filtros salvos — abrem o painel "Montar relatório" já com a seleção salva no modelo.'
            : "Filtros salvos — geram o PDF diretamente, com a seleção salva no modelo."}
        </p>

        {!dbConfigured ? (
          <p className="text-[12px] text-intel-text-dim">
            Banco de dados não configurado — modelos de relatório dependem dele. Veja docs/client-access-setup.md.
          </p>
        ) : templatesError ? (
          <p className="text-[12px] text-intel-red">{templatesError}</p>
        ) : templates === null ? (
          <p className="text-[12px] text-intel-text-dim">Carregando modelos...</p>
        ) : templates.length === 0 ? (
          <p className="text-[12px] text-intel-text-dim">
            {isAdmin ? "Nenhum modelo ainda — configure os filtros acima e salve um no painel ao montar um relatório." : "Nenhum modelo disponível ainda."}
          </p>
        ) : (
          <ul className="space-y-2 mb-2">
            {templates.map((template) => (
              <li
                key={template.id}
                className="rounded-xl border border-white/[0.07] bg-intel-surface-2 px-4 py-3 flex flex-wrap items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <p className="text-[13px] text-intel-text font-medium truncate">{template.name}</p>
                  <p className="text-[11.5px] text-intel-text-dim mt-0.5">{templateSummary(template.filters, optionSets)}</p>
                  {rowError?.id === template.id && <p className="mt-1 text-[11.5px] text-intel-red">{rowError.message}</p>}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => openDrawerForTemplate(template)}
                    disabled={templateGenerating === template.id}
                    aria-busy={templateGenerating === template.id}
                    className="text-[12px] tracking-[0.06em] uppercase px-3.5 py-2 rounded-full bg-intel-cyan/[0.14] text-intel-cyan hover:bg-intel-cyan/[0.22] transition-colors duration-200 disabled:opacity-50 disabled:cursor-wait"
                  >
                    {templateGenerating === template.id ? "Gerando..." : reportSettings.canBuild ? "Montar relatório" : "Baixar PDF"}
                  </button>
                  {isAdmin && (
                    <button
                      type="button"
                      onClick={() => handleDeleteTemplate(template.id)}
                      onBlur={() => setConfirmingDelete(null)}
                      className={`text-[12px] tracking-[0.06em] uppercase transition-colors duration-200 ${
                        confirmingDelete === template.id ? "text-intel-red font-medium" : "text-intel-text-dim hover:text-intel-red"
                      }`}
                    >
                      {confirmingDelete === template.id ? "Confirmar?" : "Excluir"}
                    </button>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Exportar dados do período</h3>
        <p className="text-[12px] text-intel-text-dim mb-5">Os arquivos refletem os filtros ativos no painel — {periodLabel}.</p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportCampaigns}
            disabled={campaigns.length === 0 || exportingCsv !== null}
            aria-busy={exportingCsv === "campaigns"}
            className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full border border-white/10 text-intel-text-dim hover:border-white/25 hover:text-intel-text transition-colors duration-200 disabled:opacity-40 disabled:cursor-wait"
          >
            {exportingCsv === "campaigns" ? "Exportando..." : "Exportar campanhas (CSV)"}
          </button>
          <button
            type="button"
            onClick={exportAccountSummary}
            disabled={campaigns.length === 0 || exportingCsv !== null}
            aria-busy={exportingCsv === "account-summary"}
            className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full border border-white/10 text-intel-text-dim hover:border-white/25 hover:text-intel-text transition-colors duration-200 disabled:opacity-40 disabled:cursor-wait"
          >
            {exportingCsv === "account-summary" ? "Exportando..." : "Exportar resumo por conta (CSV)"}
          </button>
        </div>
        {campaigns.length === 0 && <p className="mt-3 text-[12px] text-intel-text-dim">Sem campanhas no período para exportar.</p>}
        {exportError && (
          <div className="mt-3 flex flex-wrap items-center gap-3" role="alert">
            <p className="text-[12px] text-intel-red">{exportError}</p>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <p className="text-[13px] font-medium text-intel-text mb-2">O que ainda depende de integração adicional</p>
        <ul className="text-[12px] text-intel-text-dim leading-relaxed list-disc pl-4 space-y-1">
          <li>Relatórios agendados por e-mail — depende de um serviço de envio (ex.: e-mail transacional) ainda não configurado.</li>
          <li>Histórico de relatórios gerados anteriormente — cada PDF é gerado na hora, não fica um arquivo salvo no servidor.</li>
          <li>&quot;Melhores anúncios&quot; no PDF não inclui a miniatura da imagem nesta versão — veja a exportação CSV de criativos e qualidade para a URL da imagem.</li>
        </ul>
      </div>

      {drawerContext && (
        <ReportBuilderDrawer
          onClose={() => setDrawerContext(null)}
          clientLabel={previewClientLabel}
          isMultiClient={isMultiClient}
          periodLabel={drawerContext.periodLabel}
          comparisonLabel={drawerContext.comparisonLabel}
          reportSettings={reportSettings}
          internalIndicatorIds={internalIndicatorIds}
          hiddenIndicatorIds={hiddenIndicatorIds}
          campaigns={campaigns}
          initialIndicatorSet={drawerContext.initialIndicatorSet}
          recipientClientId={recipientClientId || null}
          canManageTemplates={isAdmin}
          dbConfigured={dbConfigured}
          downloading={downloading}
          downloadError={downloadError}
          lastSavedNote={null}
          onDownload={handleDrawerDownload}
          onSaveAsTemplate={handleSaveAsTemplate}
        />
      )}
    </div>
  );
}
