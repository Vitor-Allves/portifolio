"use client";

// "Montar relatório" — the right-side drawer the Reports tab opens before
// generating a PDF, so an admin/client can choose which indicators go in
// before downloading (Parte 1 do "PROMPT — RELATÓRIOS"). This panel only
// ever picks WHAT to ask the server for; every rule about what's actually
// allowed (hidden columns, uso interno, tipo liberado, múltiplos clientes)
// is re-checked server-side regardless of what's sent here — see
// report-data.ts's resolveSelectedIndicators and the /reports/pdf route.

import { useEffect, useMemo, useState } from "react";
import type { CampaignInsight } from "@/lib/meta-ads-types";
import {
  INDICATOR_GROUPS,
  REPORT_TYPE_OPTIONS,
  hasDataForIndicator,
  isReportIndicatorId,
  type ReportIndicatorId,
} from "@/lib/report-indicators";
import type { ResolvedReportSettings, ReportType } from "@/lib/client-permissions";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";

export type ReportBuilderDrawerProps = {
  onClose: () => void;
  clientLabel: string | null;
  isMultiClient: boolean;
  periodLabel: string;
  comparisonLabel: string | null;
  reportSettings: ResolvedReportSettings;
  internalIndicatorIds: ReportIndicatorId[];
  hiddenIndicatorIds: Set<ReportIndicatorId>;
  campaigns: CampaignInsight[];
  /** From a predefined report card ("Executivo"/"Performance por campanha"/"Público e distribuição") — pre-seeds the checklist (regra b). null for the ad-hoc "Baixar PDF do período atual" button, which falls through to regra (a)/(c). */
  initialIndicatorSet: ReportIndicatorId[] | null;
  /** The single client this report currently resolves to, if any — drives "lembrar seleção" and the last-saved-selection fetch. null when viewing multiple clients at once (no single id to key on). */
  recipientClientId: string | null;
  canManageTemplates: boolean;
  dbConfigured: boolean;
  downloading: boolean;
  downloadError: string | null;
  lastSavedNote: string | null;
  onDownload: (opts: { reportType: ReportType; indicators: ReportIndicatorId[]; rememberSelection: boolean }) => void;
  onSaveAsTemplate: (opts: { reportType: ReportType; indicators: ReportIndicatorId[]; name: string }) => Promise<void>;
};

function defaultIndicatorSet(
  reportSettings: ResolvedReportSettings,
  hiddenIndicatorIds: Set<ReportIndicatorId>
): Set<ReportIndicatorId> {
  if (reportSettings.defaultIndicators) {
    return new Set(reportSettings.defaultIndicators.filter(isReportIndicatorId).filter((id) => !hiddenIndicatorIds.has(id)));
  }
  const all = INDICATOR_GROUPS.flatMap((g) => g.options.map((o) => o.id));
  return new Set(all.filter((id) => !hiddenIndicatorIds.has(id)));
}

export default function ReportBuilderDrawer({
  onClose,
  clientLabel,
  isMultiClient,
  periodLabel,
  comparisonLabel,
  reportSettings,
  internalIndicatorIds,
  hiddenIndicatorIds,
  campaigns,
  initialIndicatorSet,
  recipientClientId,
  canManageTemplates,
  dbConfigured,
  downloading,
  downloadError,
  lastSavedNote,
  onDownload,
  onSaveAsTemplate,
}: ReportBuilderDrawerProps) {
  const internalSet = useMemo(() => new Set(internalIndicatorIds), [internalIndicatorIds]);
  const withoutInternal = (ids: Iterable<ReportIndicatorId>) => new Set([...ids].filter((id) => !internalSet.has(id)));

  // This component is only ever mounted while the drawer is open (the
  // caller conditionally renders it) — a fresh mount per open, so these
  // lazy initializers already give (b)/(c) the moment it appears. Only
  // regra (a) — the last saved selection for this exact client — needs a
  // network round trip, handled by the effect below.
  const [reportType, setReportType] = useState<ReportType>(reportSettings.defaultType);
  const [selected, setSelected] = useState<Set<ReportIndicatorId>>(() =>
    initialIndicatorSet
      ? withoutInternal(initialIndicatorSet.filter((id) => !hiddenIndicatorIds.has(id)))
      : withoutInternal(defaultIndicatorSet(reportSettings, hiddenIndicatorIds))
  );
  const [rememberSelection, setRememberSelection] = useState(true);
  const [lastSelectionMeta, setLastSelectionMeta] = useState<string | null>(null);
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [templateName, setTemplateName] = useState("");
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [saveTemplateError, setSaveTemplateError] = useState<string | null>(null);

  // Regra (a): overrides the lazily-initialized (b)/(c) selection above once
  // the fetch resolves — skipped entirely for a predefined report (which
  // already won via initialIndicatorSet) or when there's no single client
  // to key the remembered selection on.
  useEffect(() => {
    if (initialIndicatorSet || !recipientClientId || isMultiClient) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/analise/report-client-selection/?clientId=${encodeURIComponent(recipientClientId)}`);
        if (!res.ok) throw new Error("failed");
        const body = (await res.json()) as { selection: { reportType: ReportType; indicators: ReportIndicatorId[]; updatedAt: string; updatedByLabel: string } | null };
        if (cancelled || !body.selection) return;
        setReportType(body.selection.reportType);
        setSelected(withoutInternal(body.selection.indicators.filter((id) => !hiddenIndicatorIds.has(id))));
        const d = new Date(body.selection.updatedAt);
        setLastSelectionMeta(`Última montagem em ${d.toLocaleDateString("pt-BR")} por ${body.selection.updatedByLabel}`);
      } catch {
        // Keeps the already-initialized (c) default selection.
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialIndicatorSet, recipientClientId, isMultiClient]);

  const visibleGroups = INDICATOR_GROUPS.map((g) => ({
    ...g,
    options: g.options.filter((o) => !hiddenIndicatorIds.has(o.id)),
  })).filter((g) => g.options.length > 0);

  const allVisibleIds = visibleGroups.flatMap((g) => g.options.map((o) => o.id));
  const noDataIds = new Set(allVisibleIds.filter((id) => !hasDataForIndicator(id, campaigns)));

  function toggle(id: ReportIndicatorId) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function markAll() {
    setSelected(new Set(allVisibleIds.filter((id) => (internalSet.has(id) ? reportSettings.canIncludeInternal : true) && !noDataIds.has(id))));
  }
  function unmarkAll() {
    setSelected(new Set());
  }
  function resetToDefault() {
    setSelected(new Set([...defaultIndicatorSet(reportSettings, hiddenIndicatorIds)].filter((id) => !internalSet.has(id))));
  }

  const summaryLabels = INDICATOR_GROUPS.flatMap((g) => g.options).filter((o) => selected.has(o.id));
  const indicatorCount = summaryLabels.filter((o) => !["trendChart", "compare", "strategicInsights", "spendByCampaign", "campaignRanking", "campaignHierarchy", "bestAds", "audienceAge", "audienceGender", "audienceRegion", "platformDistribution", "deviceDistribution", "topHours", "resultsByObjective", "budgetPacing"].includes(o.id)).length;
  const blockCount = summaryLabels.length - indicatorCount;

  const canChooseType = reportSettings.typesAllowed.length > 1;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div
        className="relative w-full sm:w-[480px] max-w-full h-full overflow-y-auto bg-intel-surface-1 border-l border-white/10 shadow-2xl flex flex-col"
        style={{ background: "linear-gradient(180deg, #101b2d 0%, #0b1526 100%)" }}
      >
        <div className="p-6 border-b border-white/[0.07]">
          <h2 className="text-[16px] font-semibold text-intel-text">
            Relatório de {isMultiClient ? "Múltiplas contas" : clientLabel ?? "sua empresa"}
          </h2>
          <p className="mt-1 text-[12.5px] text-intel-text-dim">{periodLabel}</p>
          {comparisonLabel && <p className="text-[12px] text-intel-text-dim/70">{comparisonLabel}</p>}
        </div>

        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          <div>
            <p className={INTEL_LABEL}>Tipo de relatório</p>
            {canChooseType ? (
              <div className="mt-2 grid grid-cols-2 gap-2">
                {REPORT_TYPE_OPTIONS.filter((t) => reportSettings.typesAllowed.includes(t.id)).map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setReportType(t.id)}
                    className={`rounded-xl border px-3 py-2.5 text-left transition-colors duration-200 ${
                      reportType === t.id ? "border-intel-cyan/50 bg-intel-cyan/[0.1] text-intel-text" : "border-white/10 text-intel-text-dim hover:border-white/20"
                    }`}
                  >
                    <span className="block text-[13px] font-medium">{t.label}</span>
                    <span className="block text-[10.5px] mt-0.5 opacity-80">
                      {t.id === "simplificado" ? "para quem não é da área" : "com todos os termos e fórmulas"}
                    </span>
                  </button>
                ))}
              </div>
            ) : (
              <p className="mt-1.5 text-[13px] text-intel-text">
                Versão: {reportSettings.typesAllowed[0] === "simplificado" ? "Simplificada" : "Técnica"}
              </p>
            )}
          </div>

          {reportSettings.canBuild ? (
            <div>
              <div className="flex items-center justify-between gap-2 mb-2">
                <p className={INTEL_LABEL}>Indicadores</p>
                <div className="flex items-center gap-3 text-[11px]">
                  <button type="button" onClick={markAll} className="text-intel-cyan hover:text-intel-text transition-colors duration-150">
                    Marcar todos
                  </button>
                  <button type="button" onClick={unmarkAll} className="text-intel-cyan hover:text-intel-text transition-colors duration-150">
                    Desmarcar todos
                  </button>
                  <button type="button" onClick={resetToDefault} className="text-intel-cyan hover:text-intel-text transition-colors duration-150">
                    Voltar ao padrão
                  </button>
                </div>
              </div>

              <div className="space-y-4">
                {visibleGroups.map((group) => (
                  <div key={group.id}>
                    <p className="text-[11px] tracking-[0.06em] uppercase text-intel-text-dim/70 mb-1.5">{group.label}</p>
                    <ul className="rounded-lg border border-white/10 divide-y divide-white/[0.06]">
                      {group.options.map((opt) => {
                        const isInternalIndicator = internalSet.has(opt.id);
                        const noData = noDataIds.has(opt.id);
                        const disabled = (isInternalIndicator && !reportSettings.canIncludeInternal) || noData;
                        const marked = selected.has(opt.id);
                        return (
                          <li key={opt.id} className="px-3 py-2">
                            <button
                              type="button"
                              disabled={disabled}
                              onClick={() => toggle(opt.id)}
                              className="w-full flex items-center gap-3 text-left disabled:cursor-not-allowed"
                            >
                              <span
                                className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                                  marked ? "bg-intel-cyan border-intel-cyan" : "border-white/20"
                                } ${disabled ? "opacity-40" : ""}`}
                                aria-hidden="true"
                              >
                                {marked && (
                                  <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                                    <path d="M1 4L3.5 6.5L9 1" stroke="#070d1a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                  </svg>
                                )}
                              </span>
                              <span className={`min-w-0 text-[13px] ${disabled ? "text-intel-text-dim/50" : "text-intel-text-dim"}`}>{opt.label}</span>
                              {isInternalIndicator && (
                                <span className="ml-auto shrink-0 inline-flex items-center gap-1 text-[10px] tracking-[0.04em] uppercase text-amber-300/80">
                                  <svg width="10" height="10" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5Zm0 2a3 3 0 0 1 3 3v3H9V7a3 3 0 0 1 3-3Z" />
                                  </svg>
                                  Uso interno
                                </span>
                              )}
                            </button>
                            {isInternalIndicator && marked && reportSettings.canIncludeInternal && (
                              <p className="mt-1 ml-7 text-[11px] text-amber-300/90">
                                Este indicador é de uso interno e vai aparecer no relatório enviado ao cliente.
                              </p>
                            )}
                            {noData && (
                              <p className="mt-1 ml-7 text-[11px] text-intel-text-dim/60">sem dados no período</p>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <p className="text-[12.5px] text-intel-text-dim">
              Este relatório será gerado com a seleção padrão de indicadores definida para o seu usuário.
            </p>
          )}

          <div className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
            <p className="text-[12.5px] text-intel-text">
              {indicatorCount} indicador{indicatorCount === 1 ? "" : "es"} e {blockCount} bloco{blockCount === 1 ? "" : "s"} selecionado{summaryLabels.length === 1 ? "" : "s"}
            </p>
            {summaryLabels.length > 0 && (
              <p className="mt-1 text-[11.5px] text-intel-text-dim leading-relaxed">{summaryLabels.map((o) => o.label).join(" · ")}</p>
            )}
          </div>

          {reportSettings.canBuild && recipientClientId && !isMultiClient && (
            <label className="flex items-center gap-2.5 text-[13px] text-intel-text-dim">
              <input
                type="checkbox"
                checked={rememberSelection}
                onChange={(e) => setRememberSelection(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-transparent accent-[var(--color-intel-cyan)]"
              />
              Lembrar esta seleção para este cliente
            </label>
          )}
          {lastSelectionMeta && <p className="text-[11px] text-intel-text-dim/60">{lastSelectionMeta}</p>}
          {recipientClientId && isMultiClient && (
            <p className="text-[11px] text-intel-text-dim/60">Com mais de um cliente, a seleção não é gravada por cliente — use &quot;Salvar como modelo&quot;.</p>
          )}

          {canManageTemplates && dbConfigured && (
            <div className="border-t border-white/[0.07] pt-4">
              {!showSaveTemplate ? (
                <button type="button" onClick={() => setShowSaveTemplate(true)} className="text-[12px] tracking-[0.06em] uppercase text-intel-cyan hover:text-intel-text transition-colors duration-150">
                  Salvar como modelo
                </button>
              ) : (
                <div className="space-y-2">
                  <label htmlFor="drawer-template-name" className={INTEL_LABEL}>
                    Nome do modelo
                  </label>
                  <input
                    id="drawer-template-name"
                    value={templateName}
                    onChange={(e) => setTemplateName(e.target.value)}
                    className={INTEL_INPUT}
                    placeholder="Ex: Relatório mensal — todas as contas"
                  />
                  {saveTemplateError && <p className="text-[11.5px] text-intel-red">{saveTemplateError}</p>}
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      disabled={savingTemplate}
                      onClick={async () => {
                        if (!templateName.trim()) {
                          setSaveTemplateError("Informe o nome do modelo.");
                          return;
                        }
                        setSavingTemplate(true);
                        setSaveTemplateError(null);
                        try {
                          await onSaveAsTemplate({ reportType, indicators: [...selected], name: templateName.trim() });
                          setShowSaveTemplate(false);
                          setTemplateName("");
                        } catch {
                          setSaveTemplateError("Não foi possível salvar o modelo.");
                        } finally {
                          setSavingTemplate(false);
                        }
                      }}
                      className="text-[12px] tracking-[0.06em] uppercase px-3.5 py-2 rounded-full bg-intel-cyan/[0.14] text-intel-cyan hover:bg-intel-cyan/[0.22] transition-colors duration-200 disabled:opacity-50"
                    >
                      {savingTemplate ? "Salvando..." : "Salvar"}
                    </button>
                    <button type="button" onClick={() => setShowSaveTemplate(false)} className="text-[12px] text-intel-text-dim hover:text-intel-text transition-colors duration-150">
                      Cancelar
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {lastSavedNote && <p className="text-[12px] text-intel-green">{lastSavedNote}</p>}
          {downloadError && <p className="text-[12px] text-intel-red" role="alert">{downloadError}</p>}
        </div>

        <div className="p-6 border-t border-white/[0.07] flex items-center gap-3">
          <button
            type="button"
            disabled={downloading || selected.size === 0}
            onClick={() => onDownload({ reportType, indicators: [...selected], rememberSelection })}
            aria-busy={downloading}
            className="flex-1 inline-flex items-center justify-center gap-2 text-[13px] px-4 py-2.5 rounded-full bg-intel-cyan text-[#04121a] font-medium hover:brightness-110 transition-[filter] duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            {downloading ? "Gerando relatório..." : selected.size === 0 ? "Escolha pelo menos um indicador" : "Baixar PDF"}
          </button>
          <button type="button" onClick={onClose} className="text-[13px] text-intel-text-dim hover:text-intel-text transition-colors duration-150 px-3">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}
