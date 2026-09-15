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
} from "@/lib/client-permissions";
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
