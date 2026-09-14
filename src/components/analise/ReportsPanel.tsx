"use client";

import { useEffect, useState } from "react";
import type { CampaignInsight, Period } from "@/lib/meta-ads-types";
import { DATE_PRESETS } from "@/lib/meta-ads-types";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent, formatShortDate } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation, sumTotals } from "@/lib/metrics";
import { downloadCsv } from "@/lib/csv";
import { fetchDashboardData, DashboardFetchError } from "@/lib/dashboard-fetch";
import { OBJECTIVE_NONE_KEY, resolveIdFilter, toSavedIdFilter, filterCampaignsByIds } from "@/lib/campaign-filters";
import { downloadCampaignReportPdf } from "@/lib/pdf-report";
import type { ReportFilters, ReportTemplateSummary } from "@/lib/report-templates-types";
import type { FilterOption } from "./MultiSelectFilter";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";

type ReportsPanelProps = {
  campaigns: CampaignInsight[];
  periodLabel: string;
  totalReach: number;
  clientLabel: string | null;
  isAdmin: boolean;
  dbConfigured: boolean;

  period: Period;
  compare: boolean;
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

export default function ReportsPanel({
  campaigns,
  periodLabel,
  totalReach,
  clientLabel,
  isAdmin,
  dbConfigured,
  period,
  compare,
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
  const totals = sumTotals(campaigns);

  const [templates, setTemplates] = useState<ReportTemplateSummary[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [generatingId, setGeneratingId] = useState<string | null>(null);
  const [generatingCurrent, setGeneratingCurrent] = useState(false);
  const [rowError, setRowError] = useState<{ id: string; message: string } | null>(null);
  const [confirmingDelete, setConfirmingDelete] = useState<string | null>(null);

  const [newTemplateName, setNewTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

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

  function exportCampaigns() {
    const header = [
      "Campanha",
      "Conta",
      "Objetivo",
      "Status",
      "Investimento",
      "Impressões",
      "Cliques (todos)",
      "Conversa iniciada",
      "Custo por conversa iniciada",
      "CTR",
      "CPC",
      "CPM",
      "Alcance",
    ];
    const rows = campaigns.map((c) => {
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
    });
    downloadCsv(`campanhas-${today}.csv`, [header, ...rows]);
  }

  function exportAccountSummary() {
    const byAccount = new Map<string, { name: string; campaigns: CampaignInsight[] }>();
    for (const c of campaigns) {
      const entry = byAccount.get(c.accountId) ?? { name: c.accountName, campaigns: [] };
      entry.campaigns.push(c);
      byAccount.set(c.accountId, entry);
    }

    const header = [
      "Conta",
      "Campanhas",
      "Investimento",
      "Impressões",
      "Cliques (todos)",
      "Conversa iniciada",
      "Custo por conversa iniciada",
      "CTR",
      "CPC",
      "CPM",
    ];
    const rows = [...byAccount.values()].map((entry) => {
      const entryTotals = sumTotals(entry.campaigns);
      const cCtr = ctr(entryTotals);
      const cCpc = cpc(entryTotals);
      const cCpm = cpm(entryTotals);
      const cCostPerConversation = costPerConversation(entryTotals);
      return [
        entry.name,
        String(entry.campaigns.length),
        formatCurrencyBRL(entryTotals.spend),
        formatInteger(entryTotals.impressions),
        formatInteger(entryTotals.clicks),
        formatInteger(entryTotals.linkClicks),
        cCostPerConversation === null ? "—" : formatCurrencyBRL(cCostPerConversation),
        cCtr === null ? "—" : formatPercent(cCtr),
        cCpc === null ? "—" : formatCurrencyBRL(cCpc),
        cCpm === null ? "—" : formatCurrencyBRL(cCpm),
      ];
    });
    downloadCsv(`resumo-por-conta-${today}.csv`, [header, ...rows]);
  }

  async function downloadCurrentPdf() {
    setGeneratingCurrent(true);
    try {
      await downloadCampaignReportPdf({
        title: "Relatório de campanhas",
        clientLabel,
        periodLabel,
        generatedAt: new Date(),
        campaigns,
        totals,
        totalReach,
      });
    } finally {
      setGeneratingCurrent(false);
    }
  }

  async function saveCurrentAsTemplate(e: React.FormEvent) {
    e.preventDefault();
    setSaveError(null);
    if (!newTemplateName.trim()) {
      setSaveError("Informe o nome do modelo.");
      return;
    }

    const filters: ReportFilters = {
      period,
      compare,
      accountIds: toSavedIdFilter(accountIds, accountOptions),
      campaignIds: toSavedIdFilter(campaignIds, campaignOptions),
      adSetIds: toSavedIdFilter(adSetIds, adSetOptions),
      objectiveIds: toSavedIdFilter(objectiveIds, objectiveOptions),
      statusIds: toSavedIdFilter(statusIds, statusOptions),
    };

    setSavingTemplate(true);
    try {
      const res = await fetch("/api/analise/report-templates/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newTemplateName.trim(), filters }),
      });
      const body = await res.json();
      if (!res.ok) {
        setSaveError(body?.error ?? "Não foi possível criar o modelo.");
        return;
      }
      setTemplates((prev) => [{ id: body.id, name: body.name, filters: body.filters, createdAt: new Date().toISOString() }, ...(prev ?? [])]);
      setNewTemplateName("");
    } catch {
      setSaveError("Falha de conexão. Tente novamente.");
    } finally {
      setSavingTemplate(false);
    }
  }

  async function applyTemplateAndDownload(template: ReportTemplateSummary) {
    setRowError(null);
    setGeneratingId(template.id);
    try {
      const freshData = await fetchDashboardData(template.filters.period, template.filters.compare);

      const resolvedAccountIds = resolveIdFilter(template.filters.accountIds, freshData.accounts.map((a) => a.id));
      const resolvedCampaignIds = resolveIdFilter(template.filters.campaignIds, freshData.campaigns.map((c) => c.campaignId));
      const resolvedAdSetIds = resolveIdFilter(template.filters.adSetIds, freshData.adSets.map((a) => a.adSetId));
      const resolvedObjectiveIds = resolveIdFilter(
        template.filters.objectiveIds,
        freshData.campaigns.map((c) => c.objective ?? OBJECTIVE_NONE_KEY)
      );
      const resolvedStatusIds = resolveIdFilter(template.filters.statusIds, freshData.campaigns.map((c) => c.status));

      const filteredCampaigns = filterCampaignsByIds(freshData.campaigns, freshData.adSets, {
        accountIds: resolvedAccountIds,
        campaignIds: resolvedCampaignIds,
        adSetIds: resolvedAdSetIds,
        objectiveIds: resolvedObjectiveIds,
        statusIds: resolvedStatusIds,
      });

      const templateTotals = sumTotals(filteredCampaigns);
      const templateTotalReach = freshData.accountReach
        .filter((r) => resolvedAccountIds.has(r.accountId))
        .reduce((sum, r) => sum + r.reach, 0);

      const resolvedPeriodLabel =
        template.filters.period.kind === "preset"
          ? `${periodSummary(template.filters.period)} (${formatShortDate(freshData.resolvedRange.since)} – ${formatShortDate(freshData.resolvedRange.until)})`
          : `${formatShortDate(freshData.resolvedRange.since)} – ${formatShortDate(freshData.resolvedRange.until)}`;

      await downloadCampaignReportPdf({
        title: template.name,
        clientLabel,
        periodLabel: resolvedPeriodLabel,
        generatedAt: new Date(),
        campaigns: filteredCampaigns,
        totals: templateTotals,
        totalReach: templateTotalReach,
      });
    } catch (err) {
      setRowError({
        id: template.id,
        message: err instanceof DashboardFetchError ? err.message : "Não foi possível gerar o PDF. Tente novamente.",
      });
    } finally {
      setGeneratingId(null);
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

  return (
    <div className="space-y-4">
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Baixar relatório em PDF</h3>
        <p className="text-[12px] text-intel-text-dim mb-5">
          Gera um PDF com o resumo e a tabela de campanhas do que está filtrado agora — {periodLabel}.
        </p>
        <button
          type="button"
          onClick={downloadCurrentPdf}
          disabled={generatingCurrent}
          className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full bg-intel-cyan text-[#04121a] font-medium hover:brightness-110 transition-[filter] duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
        >
          {generatingCurrent ? "Gerando PDF..." : "Baixar PDF do período atual"}
        </button>
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Modelos de relatório</h3>
        <p className="text-[12px] text-intel-text-dim mb-5">
          Filtros salvos que geram o PDF direto, sem precisar reconfigurar tudo de novo.
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
            {isAdmin ? "Nenhum modelo ainda — configure os filtros acima e salve um abaixo." : "Nenhum modelo disponível ainda."}
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
                  {rowError?.id === template.id && (
                    <p className="text-[11.5px] text-intel-red mt-1">{rowError.message}</p>
                  )}
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => applyTemplateAndDownload(template)}
                    disabled={generatingId === template.id}
                    className="text-[12px] tracking-[0.06em] uppercase px-3.5 py-2 rounded-full bg-intel-cyan/[0.14] text-intel-cyan hover:bg-intel-cyan/[0.22] transition-colors duration-200 disabled:opacity-50 disabled:cursor-wait"
                  >
                    {generatingId === template.id ? "Gerando..." : "Gerar PDF"}
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

        {isAdmin && dbConfigured && (
          <form onSubmit={saveCurrentAsTemplate} className="mt-4 pt-4 border-t border-white/[0.06] flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[220px]">
              <label htmlFor="new-template-name" className={INTEL_LABEL}>
                Salvar filtros atuais como modelo
              </label>
              <input
                id="new-template-name"
                value={newTemplateName}
                onChange={(e) => setNewTemplateName(e.target.value)}
                placeholder="Ex: Relatório mensal — todas as contas"
                className={`${INTEL_INPUT} mt-2`}
              />
            </div>
            <button
              type="submit"
              disabled={savingTemplate}
              className="text-[12.5px] tracking-[0.06em] uppercase px-4 py-2.5 rounded-full bg-intel-cyan text-[#04121a] font-medium hover:brightness-110 transition-[filter] duration-200 disabled:opacity-50 disabled:cursor-wait"
            >
              {savingTemplate ? "Salvando..." : "Salvar modelo"}
            </button>
          </form>
        )}
        {saveError && (
          <p className="mt-2 text-[12px] text-intel-red" role="alert">
            {saveError}
          </p>
        )}
        {isAdmin && dbConfigured && (
          <p className="text-[11px] text-intel-text-dim/70 mt-2">
            Usa exatamente os filtros ativos agora nesta tela (contas, período, campanha, conjunto, objetivo e status).
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-1">Exportar dados do período</h3>
        <p className="text-[12px] text-intel-text-dim mb-5">
          Os arquivos refletem os filtros ativos no painel — {periodLabel}.
        </p>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            onClick={exportCampaigns}
            disabled={campaigns.length === 0}
            className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full border border-white/10 text-intel-text-dim hover:border-white/25 hover:text-intel-text transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Exportar campanhas (CSV)
          </button>
          <button
            type="button"
            onClick={exportAccountSummary}
            disabled={campaigns.length === 0}
            className="inline-flex items-center gap-2 text-[13px] px-4 py-2.5 rounded-full border border-white/10 text-intel-text-dim hover:border-white/25 hover:text-intel-text transition-colors duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Exportar resumo por conta (CSV)
          </button>
        </div>
        {campaigns.length === 0 && <p className="mt-3 text-[12px] text-intel-text-dim">Sem campanhas no período para exportar.</p>}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <p className="text-[13px] font-medium text-intel-text mb-2">O que ainda depende de integração adicional</p>
        <ul className="text-[12px] text-intel-text-dim leading-relaxed list-disc pl-4 space-y-1">
          <li>Relatórios agendados por e-mail — depende de um serviço de envio (ex.: e-mail transacional) ainda não configurado.</li>
          <li>Histórico de relatórios gerados anteriormente — cada PDF é gerado na hora, não fica um arquivo salvo no servidor.</li>
        </ul>
      </div>
    </div>
  );
}
