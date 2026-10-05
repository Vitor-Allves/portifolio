"use client";

import {
  FILTER_OPTIONS,
  CAMPAIGN_COLUMN_OPTIONS,
  HIDEABLE_SECTION_OPTIONS,
  ACTION_OPTIONS,
  type ClientPermissions,
  type FilterKey,
  type CampaignColumnId,
  type HideableSectionId,
  type ActionId,
  type ReportType,
} from "@/lib/client-permissions";
import { INDICATOR_GROUPS, REPORT_TYPE_OPTIONS, type ReportIndicatorId } from "@/lib/report-indicators";
import { INTEL_LABEL } from "./intel-styles";

function toggleInArray<T>(list: T[], id: T): T[] {
  return list.includes(id) ? list.filter((v) => v !== id) : [...list, id];
}

function CheckboxGroup<T extends string>({
  title,
  hint,
  options,
  selectedIds,
  onToggle,
  markLabel,
}: {
  title: string;
  hint: string;
  options: { id: T; label: string }[];
  selectedIds: T[];
  onToggle: (id: T) => void;
  markLabel: string;
}) {
  const selected = new Set(selectedIds);
  return (
    <div className="mt-5">
      <p className={INTEL_LABEL}>{title}</p>
      <p className="text-[11px] text-intel-text-dim/70 mt-0.5 mb-2">{hint}</p>
      <ul className="rounded-lg border border-white/10 divide-y divide-white/[0.06]">
        {options.map((option) => {
          const marked = selected.has(option.id);
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onToggle(option.id)}
                className="w-full flex items-center gap-3 text-left px-3 py-2 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-150"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                    marked ? "border-white/20" : "bg-intel-cyan border-intel-cyan"
                  }`}
                  aria-hidden="true"
                >
                  {!marked && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#070d1a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
                {marked && <span className="ml-auto shrink-0 text-[11px] text-intel-text-dim/60">{markLabel}</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Reusable radio/checkbox row for the Relatórios fieldset below — same visual language as CheckboxGroup's rows, but for a handful of bespoke boolean/enum controls rather than an id-array toggle. */
function SimpleToggleRow({ label, checked, onToggle }: { label: string; checked: boolean; onToggle: () => void }) {
  return (
    <li>
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center gap-3 text-left px-3 py-2 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-150"
      >
        <span
          className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
            checked ? "bg-intel-cyan border-intel-cyan" : "border-white/20"
          }`}
          aria-hidden="true"
        >
          {checked && (
            <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
              <path d="M1 4L3.5 6.5L9 1" stroke="#070d1a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          )}
        </span>
        <span className="min-w-0">{label}</span>
      </button>
    </li>
  );
}

/**
 * "Relatórios" — per-user report permissions (Parte 4 do prompt de
 * relatórios). Visible/editable here regardless of which caller renders
 * this component (AdminUsersPanel/AdminClientsPanel) because BOTH already
 * only ever render inside /intelligence/admin, which is gated to
 * administrador_geral at the page level — there is no separate "only admin
 * geral" check needed here. Every field is optional on ClientPermissions
 * (see client-permissions.ts) — unset shows as the "administrador" role's
 * own default (both types, pode montar, uso interno não, múltiplas sim),
 * never silently saved until the admin actually touches a control.
 */
function ReportSettingsFieldset({ permissions, onChange }: { permissions: ClientPermissions; onChange: (next: ClientPermissions) => void }) {
  const typesAllowed = permissions.reportTypesAllowed?.length ? permissions.reportTypesAllowed : (["simplificado", "tecnico"] as ReportType[]);
  const defaultType = permissions.reportDefaultType ?? "simplificado";
  const canBuild = permissions.canBuildReport ?? true;
  const canIncludeInternal = permissions.canIncludeInternalIndicators ?? false;
  const canMultiClient = permissions.canMultiClientReport ?? true;
  const defaultIndicators = new Set(permissions.reportDefaultIndicators ?? []);
  const hasExplicitDefaultIndicators = permissions.reportDefaultIndicators !== undefined && permissions.reportDefaultIndicators !== null;

  function toggleType(id: ReportType) {
    const next = typesAllowed.includes(id) ? typesAllowed.filter((t) => t !== id) : [...typesAllowed, id];
    if (next.length === 0) return; // at least one type must stay allowed
    onChange({ ...permissions, reportTypesAllowed: next, reportDefaultType: next.includes(defaultType) ? defaultType : next[0] });
  }

  function toggleIndicator(id: ReportIndicatorId) {
    const base = hasExplicitDefaultIndicators ? [...defaultIndicators] : [];
    const next = base.includes(id) ? base.filter((v) => v !== id) : [...base, id];
    onChange({ ...permissions, reportDefaultIndicators: next });
  }

  return (
    <div className="mt-5">
      <p className={INTEL_LABEL}>Relatórios</p>
      <p className="text-[11px] text-intel-text-dim/70 mt-0.5 mb-2">Controla o painel &quot;Montar relatório&quot; (PDF) deste usuário.</p>

      <p className="text-[11px] text-intel-text-dim mt-3 mb-1">Tipos liberados (pelo menos um)</p>
      <ul className="rounded-lg border border-white/10 divide-y divide-white/[0.06]">
        {REPORT_TYPE_OPTIONS.map((t) => (
          <SimpleToggleRow key={t.id} label={t.label} checked={typesAllowed.includes(t.id)} onToggle={() => toggleType(t.id)} />
        ))}
      </ul>

      {typesAllowed.length > 1 && (
        <>
          <p className="text-[11px] text-intel-text-dim mt-3 mb-1">Tipo selecionado por padrão</p>
          <div className="flex gap-2">
            {REPORT_TYPE_OPTIONS.filter((t) => typesAllowed.includes(t.id)).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ ...permissions, reportDefaultType: t.id })}
                className={`rounded-full border px-3 py-1.5 text-[12px] transition-colors duration-150 ${
                  defaultType === t.id ? "border-intel-cyan/50 bg-intel-cyan/[0.1] text-intel-text" : "border-white/10 text-intel-text-dim hover:border-white/20"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </>
      )}

      <ul className="rounded-lg border border-white/10 divide-y divide-white/[0.06] mt-3">
        <SimpleToggleRow
          label="Pode montar o relatório (escolher indicadores)"
          checked={canBuild}
          onToggle={() => onChange({ ...permissions, canBuildReport: !canBuild })}
        />
        <SimpleToggleRow
          label="Pode incluir indicadores de uso interno"
          checked={canIncludeInternal}
          onToggle={() => onChange({ ...permissions, canIncludeInternalIndicators: !canIncludeInternal })}
        />
        <SimpleToggleRow
          label="Pode baixar relatório com mais de um cliente (múltiplas contas)"
          checked={canMultiClient}
          onToggle={() => onChange({ ...permissions, canMultiClientReport: !canMultiClient })}
        />
      </ul>

      <p className="text-[11px] text-intel-text-dim mt-4 mb-1">
        Seleção padrão de indicadores {!hasExplicitDefaultIndicators && <span className="text-intel-text-dim/60">(sem seleção salva — usa todos os indicadores visíveis)</span>}
      </p>
      <div className="rounded-lg border border-white/10 divide-y divide-white/[0.06] max-h-64 overflow-y-auto">
        {INDICATOR_GROUPS.map((group) => (
          <div key={group.id} className="px-3 py-2">
            <p className="text-[10.5px] tracking-[0.06em] uppercase text-intel-text-dim/60 mb-1">{group.label}</p>
            <div className="flex flex-wrap gap-x-4 gap-y-1">
              {group.options.map((opt) => {
                const marked = hasExplicitDefaultIndicators ? defaultIndicators.has(opt.id) : true;
                return (
                  <button
                    key={opt.id}
                    type="button"
                    onClick={() => toggleIndicator(opt.id)}
                    className="flex items-center gap-1.5 text-[12px] text-intel-text-dim hover:text-intel-text transition-colors duration-150"
                  >
                    <span
                      className={`flex h-3.5 w-3.5 shrink-0 items-center justify-center rounded border ${marked ? "bg-intel-cyan border-intel-cyan" : "border-white/20"}`}
                      aria-hidden="true"
                    >
                      {marked && (
                        <svg width="8" height="7" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#070d1a" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    {opt.label}
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
      {hasExplicitDefaultIndicators && (
        <button
          type="button"
          onClick={() => onChange({ ...permissions, reportDefaultIndicators: null })}
          className="mt-1.5 text-[11px] text-intel-cyan hover:text-intel-text transition-colors duration-150"
        >
          Voltar para &quot;todos os indicadores visíveis&quot; (remover seleção salva)
        </button>
      )}
    </div>
  );
}

export function permissionsSummary(p: ClientPermissions): string {
  const restrictions = p.hiddenFilters.length + p.hiddenColumns.length + p.hiddenSections.length + p.disabledActions.length;
  return restrictions === 0 ? "Acesso completo" : `${restrictions} restriç${restrictions === 1 ? "ão" : "ões"}`;
}

/** Granular permission editor shared by staff and client forms — filters/columns/sections default to visible (unmark to hide), actions default to allowed (unmark to disable). Ends with a plain-language preview of what the effective access will be, per the brief's "prévia das permissões efetivas antes de salvar". */
export default function PermissionsEditor({
  permissions,
  onChange,
}: {
  permissions: ClientPermissions;
  onChange: (next: ClientPermissions) => void;
}) {
  return (
    <div>
      <CheckboxGroup
        title="Filtros disponíveis"
        hint="Desmarque para ocultar esse filtro da barra de filtros."
        options={FILTER_OPTIONS}
        selectedIds={permissions.hiddenFilters}
        onToggle={(id: FilterKey) => onChange({ ...permissions, hiddenFilters: toggleInArray(permissions.hiddenFilters, id) })}
        markLabel="oculto"
      />
      <CheckboxGroup
        title="Colunas da tabela de campanhas"
        hint="Desmarque para ocultar essa coluna da tabela e do seletor de colunas."
        options={CAMPAIGN_COLUMN_OPTIONS}
        selectedIds={permissions.hiddenColumns}
        onToggle={(id: CampaignColumnId) => onChange({ ...permissions, hiddenColumns: toggleInArray(permissions.hiddenColumns, id) })}
        markLabel="oculta"
      />
      <CheckboxGroup
        title="Seções do menu"
        hint="Desmarque para ocultar essa seção do menu lateral. 'Visão geral' fica sempre disponível."
        options={HIDEABLE_SECTION_OPTIONS}
        selectedIds={permissions.hiddenSections}
        onToggle={(id: HideableSectionId) => onChange({ ...permissions, hiddenSections: toggleInArray(permissions.hiddenSections, id) })}
        markLabel="oculta"
      />
      <CheckboxGroup
        title="Ações permitidas"
        hint="Desmarque para impedir essa ação, mesmo que a pessoa veja os dados."
        options={ACTION_OPTIONS}
        selectedIds={permissions.disabledActions}
        onToggle={(id: ActionId) => onChange({ ...permissions, disabledActions: toggleInArray(permissions.disabledActions, id) })}
        markLabel="bloqueada"
      />

      <ReportSettingsFieldset permissions={permissions} onChange={onChange} />

      <div className="mt-5 rounded-lg border border-intel-cyan/20 bg-intel-cyan/[0.06] p-3">
        <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-intel-cyan mb-1">Prévia do acesso efetivo</p>
        <p className="text-[12.5px] text-intel-text-dim leading-relaxed">
          {permissionsSummary(permissions) === "Acesso completo"
            ? "Verá todos os filtros, colunas, seções e poderá gerar/exportar relatórios normalmente."
            : [
                permissions.hiddenFilters.length > 0 ? `${permissions.hiddenFilters.length} filtro(s) oculto(s)` : null,
                permissions.hiddenColumns.length > 0 ? `${permissions.hiddenColumns.length} coluna(s) oculta(s)` : null,
                permissions.hiddenSections.length > 0 ? `${permissions.hiddenSections.length} seção(ões) oculta(s)` : null,
                permissions.disabledActions.length > 0 ? `${permissions.disabledActions.length} ação(ões) bloqueada(s)` : null,
              ]
                .filter(Boolean)
                .join(" · ")}
        </p>
      </div>
    </div>
  );
}
