"use client";

import { useState } from "react";
import type { Period } from "@/lib/meta-ads-types";
import { formatShortDate, formatSelectionSummary } from "@/lib/format";
import MultiSelectFilter, { type FilterOption } from "./MultiSelectFilter";
import PeriodFilter from "./PeriodFilter";
import ComparisonToggle from "./ComparisonToggle";
import { INTEL_CHIP } from "./intel-styles";

type Chip = { key: string; label: string; onRemove: () => void };

export type FilterBarProps = {
  accountOptions: FilterOption[];
  accountIds: Set<string>;
  onAccountIdsChange: (next: Set<string>) => void;

  period: Period;
  onPeriodChange: (period: Period) => void;
  defaultPeriod: Period;

  compare: boolean;
  onCompareChange: (checked: boolean) => void;

  campaignOptions: FilterOption[];
  campaignIds: Set<string>;
  onCampaignIdsChange: (next: Set<string>) => void;

  adSetOptions: FilterOption[];
  adSetIds: Set<string>;
  onAdSetIdsChange: (next: Set<string>) => void;

  objectiveOptions: FilterOption[];
  objectiveIds: Set<string>;
  onObjectiveIdsChange: (next: Set<string>) => void;

  statusOptions: FilterOption[];
  statusIds: Set<string>;
  onStatusIdsChange: (next: Set<string>) => void;

  /** Filter keys ("campaign" | "adSet" | "objective" | "status" | "compare") hidden by the client's configured permissions — the admin always sees an empty set. */
  hiddenFilterIds: Set<string>;

  disabled?: boolean;
};

export default function FilterBar({
  accountOptions,
  accountIds,
  onAccountIdsChange,
  period,
  onPeriodChange,
  defaultPeriod,
  compare,
  onCompareChange,
  campaignOptions,
  campaignIds,
  onCampaignIdsChange,
  adSetOptions,
  adSetIds,
  onAdSetIdsChange,
  objectiveOptions,
  objectiveIds,
  onObjectiveIdsChange,
  statusOptions,
  statusIds,
  onStatusIdsChange,
  hiddenFilterIds,
  disabled,
}: FilterBarProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const chips: Chip[] = [];

  if (accountOptions.length > 1 && accountIds.size !== accountOptions.length) {
    chips.push({
      key: "accounts",
      label: `Cliente: ${formatSelectionSummary(accountIds, accountOptions)}`,
      onRemove: () => onAccountIdsChange(new Set(accountOptions.map((o) => o.id))),
    });
  }

  if (period.kind === "custom") {
    chips.push({
      key: "period",
      label: `Período: ${formatShortDate(period.range.since)} – ${formatShortDate(period.range.until)}`,
      onRemove: () => onPeriodChange(defaultPeriod),
    });
  }

  if (!hiddenFilterIds.has("compare") && compare) {
    chips.push({ key: "compare", label: "Comparando com período anterior", onRemove: () => onCompareChange(false) });
  }

  if (!hiddenFilterIds.has("campaign") && campaignOptions.length > 0 && campaignIds.size !== campaignOptions.length) {
    chips.push({
      key: "campaigns",
      label: `Campanha: ${formatSelectionSummary(campaignIds, campaignOptions)}`,
      onRemove: () => onCampaignIdsChange(new Set(campaignOptions.map((o) => o.id))),
    });
  }

  if (!hiddenFilterIds.has("adSet") && adSetOptions.length > 0 && adSetIds.size !== adSetOptions.length) {
    chips.push({
      key: "adsets",
      label: `Conjunto: ${formatSelectionSummary(adSetIds, adSetOptions)}`,
      onRemove: () => onAdSetIdsChange(new Set(adSetOptions.map((o) => o.id))),
    });
  }

  if (!hiddenFilterIds.has("objective") && objectiveOptions.length > 0 && objectiveIds.size !== objectiveOptions.length) {
    chips.push({
      key: "objectives",
      label: `Objetivo: ${formatSelectionSummary(objectiveIds, objectiveOptions)}`,
      onRemove: () => onObjectiveIdsChange(new Set(objectiveOptions.map((o) => o.id))),
    });
  }

  if (!hiddenFilterIds.has("status") && statusOptions.length > 0 && statusIds.size !== statusOptions.length) {
    chips.push({
      key: "statuses",
      label: `Status: ${formatSelectionSummary(statusIds, statusOptions)}`,
      onRemove: () => onStatusIdsChange(new Set(statusOptions.map((o) => o.id))),
    });
  }

  const hasActiveFilters = chips.length > 0;

  function clearAll() {
    onAccountIdsChange(new Set(accountOptions.map((o) => o.id)));
    onPeriodChange(defaultPeriod);
    onCompareChange(false);
    onCampaignIdsChange(new Set(campaignOptions.map((o) => o.id)));
    onAdSetIdsChange(new Set(adSetOptions.map((o) => o.id)));
    onObjectiveIdsChange(new Set(objectiveOptions.map((o) => o.id)));
    onStatusIdsChange(new Set(statusOptions.map((o) => o.id)));
  }

  const controls = (
    <div className="flex flex-wrap items-center gap-2">
      {accountOptions.length > 1 && (
        <MultiSelectFilter
          placeholder="Todos os clientes"
          allLabel="Todos os clientes"
          options={accountOptions}
          selectedIds={accountIds}
          onChange={onAccountIdsChange}
          disabled={disabled}
          searchable={accountOptions.length > 8}
        />
      )}

      <PeriodFilter value={period} onChange={onPeriodChange} disabled={disabled} />

      {!hiddenFilterIds.has("compare") && (
        <ComparisonToggle checked={compare} onChange={onCompareChange} disabled={disabled} />
      )}

      {!hiddenFilterIds.has("campaign") && campaignOptions.length > 1 && (
        <MultiSelectFilter
          placeholder="Campanha"
          allLabel="Todas as campanhas"
          options={campaignOptions}
          selectedIds={campaignIds}
          onChange={onCampaignIdsChange}
          disabled={disabled}
          searchable={campaignOptions.length > 8}
        />
      )}

      {!hiddenFilterIds.has("adSet") && adSetOptions.length > 1 && (
        <MultiSelectFilter
          placeholder="Conjunto"
          allLabel="Todos os conjuntos"
          options={adSetOptions}
          selectedIds={adSetIds}
          onChange={onAdSetIdsChange}
          disabled={disabled}
          searchable={adSetOptions.length > 8}
        />
      )}

      {!hiddenFilterIds.has("objective") && objectiveOptions.length > 1 && (
        <MultiSelectFilter
          placeholder="Objetivo"
          allLabel="Todos os objetivos"
          options={objectiveOptions}
          selectedIds={objectiveIds}
          onChange={onObjectiveIdsChange}
          disabled={disabled}
        />
      )}

      {!hiddenFilterIds.has("status") && statusOptions.length > 1 && (
        <MultiSelectFilter
          placeholder="Status"
          allLabel="Todos os status"
          options={statusOptions}
          selectedIds={statusIds}
          onChange={onStatusIdsChange}
          disabled={disabled}
        />
      )}

      {hasActiveFilters && (
        <button
          type="button"
          onClick={clearAll}
          className="text-[11.5px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-cyan transition-colors duration-200 px-2"
        >
          Limpar filtros
        </button>
      )}
    </div>
  );

  return (
    <div className="mb-6">
      <div className="lg:hidden">
        <button
          type="button"
          onClick={() => setMobileOpen((v) => !v)}
          aria-expanded={mobileOpen}
          className="flex items-center gap-2 text-[13px] px-4 py-2 rounded-full border border-white/10 bg-intel-surface-2 text-intel-text-dim"
        >
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M4 6h16M7 12h10M10 18h4" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
          </svg>
          Filtros{hasActiveFilters ? ` (${chips.length})` : ""}
        </button>
        {mobileOpen && <div className="mt-3">{controls}</div>}
      </div>

      <div className="hidden lg:block">{controls}</div>

      {chips.length > 0 && (
        <ul className="flex flex-wrap gap-2 mt-3" aria-label="Filtros ativos">
          {chips.map((chip) => (
            <li key={chip.key}>
              <button type="button" onClick={chip.onRemove} className={INTEL_CHIP}>
                {chip.label}
                <svg width="9" height="9" viewBox="0 0 10 10" fill="none" aria-hidden="true">
                  <path d="M1 1L9 9M9 1L1 9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                </svg>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
