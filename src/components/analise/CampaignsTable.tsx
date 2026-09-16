"use client";

import { Fragment, useMemo, useState } from "react";
import type { AdInsight, AdSetInsight, CampaignInsight, CampaignStatus } from "@/lib/meta-ads-types";
import type { CampaignColumnId } from "@/lib/client-permissions";
import { objectiveLabel, statusLabel, ctaLabel, qualityRankingLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent, formatSignedPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation, roas, pctChange } from "@/lib/metrics";
import { downloadCsv } from "@/lib/csv";
import { INTEL_INPUT, INTEL_POPOVER } from "./intel-styles";

// Kept in sync with client-permissions.ts's CAMPAIGN_COLUMN_OPTIONS by
// reusing its id type directly — a hidden-column id from the admin form
// can never fail to match a real column here.
type ColumnId = CampaignColumnId;

type Column = {
  id: ColumnId;
  label: string;
  numeric: boolean;
  defaultVisible: boolean;
  value: (c: CampaignInsight) => number | string | null;
  render: (c: CampaignInsight) => string;
};

const COLUMNS: Column[] = [
  { id: "account", label: "Conta", numeric: false, defaultVisible: true, value: (c) => c.accountName, render: (c) => c.accountName },
  {
    id: "status",
    label: "Status",
    numeric: false,
    defaultVisible: true,
    value: (c) => c.status,
    render: (c) => statusLabel(c.status),
  },
  {
    id: "objective",
    label: "Objetivo",
    numeric: false,
    defaultVisible: true,
    value: (c) => objectiveLabel(c.objective),
    render: (c) => objectiveLabel(c.objective),
  },
  { id: "spend", label: "Investimento", numeric: true, defaultVisible: true, value: (c) => c.spend, render: (c) => formatCurrencyBRL(c.spend) },
  {
    id: "impressions",
    label: "Impressões",
    numeric: true,
    defaultVisible: true,
    value: (c) => c.impressions,
    render: (c) => formatInteger(c.impressions),
  },
  { id: "clicks", label: "Cliques (todos)", numeric: true, defaultVisible: true, value: (c) => c.clicks, render: (c) => formatInteger(c.clicks) },
  {
    id: "linkClicks",
    label: "Cliques no link",
    numeric: true,
    defaultVisible: true,
    value: (c) => c.linkClicks,
    render: (c) => formatInteger(c.linkClicks),
  },
  {
    id: "conversations",
    label: "Conversa iniciada",
    numeric: true,
    defaultVisible: true,
    value: (c) => c.conversations,
    render: (c) => (c.conversations === null ? "Não disponível" : formatInteger(c.conversations)),
  },
  {
    id: "costPerConversation",
    label: "Custo por conversa iniciada",
    numeric: true,
    defaultVisible: true,
    value: (c) => costPerConversation(c),
    render: (c) => {
      const v = costPerConversation(c);
      return v === null ? "—" : formatCurrencyBRL(v);
    },
  },
  {
    id: "ctr",
    label: "CTR",
    numeric: true,
    defaultVisible: true,
    value: (c) => ctr(c),
    render: (c) => {
      const v = ctr(c);
      return v === null ? "—" : formatPercent(v);
    },
  },
  {
    id: "cpc",
    label: "CPC",
    numeric: true,
    defaultVisible: false,
    value: (c) => cpc(c),
    render: (c) => {
      const v = cpc(c);
      return v === null ? "—" : formatCurrencyBRL(v);
    },
  },
  {
    id: "cpm",
    label: "CPM",
    numeric: true,
    defaultVisible: false,
    value: (c) => cpm(c),
    render: (c) => {
      const v = cpm(c);
      return v === null ? "—" : formatCurrencyBRL(v);
    },
  },
  { id: "reach", label: "Alcance", numeric: true, defaultVisible: false, value: (c) => c.reach, render: (c) => formatInteger(c.reach) },
  {
    id: "purchases",
    label: "Compras (Pixel/CAPI)",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.purchases,
    render: (c) => (c.purchases === null ? "Não disponível" : formatInteger(c.purchases)),
  },
  {
    id: "purchaseValue",
    label: "Valor de compra (Pixel/CAPI)",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.purchaseValue,
    render: (c) => (c.purchaseValue === null ? "Não disponível" : formatCurrencyBRL(c.purchaseValue)),
  },
  {
    id: "roas",
    label: "ROAS (Pixel/CAPI)",
    numeric: true,
    defaultVisible: false,
    value: (c) => roas(c),
    render: (c) => {
      const v = roas(c);
      return v === null ? "—" : `${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}x`;
    },
  },
  {
    id: "leads",
    label: "Leads (Pixel/CAPI)",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.leads,
    render: (c) => (c.leads === null ? "Não disponível" : formatInteger(c.leads)),
  },
  {
    id: "addToCart",
    label: "Adicionar ao carrinho (Pixel/CAPI)",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.addToCart,
    render: (c) => (c.addToCart === null ? "Não disponível" : formatInteger(c.addToCart)),
  },
  {
    id: "completeRegistrations",
    label: "Cadastro completo (Pixel/CAPI)",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.completeRegistrations,
    render: (c) => (c.completeRegistrations === null ? "Não disponível" : formatInteger(c.completeRegistrations)),
  },
  {
    id: "postEngagement",
    label: "Engajamento com a publicação",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.postEngagement,
    render: (c) => (c.postEngagement === null ? "Não disponível" : formatInteger(c.postEngagement)),
  },
  {
    id: "videoViews",
    label: "Visualizações de vídeo",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.videoViews,
    render: (c) => (c.videoViews === null ? "Não disponível" : formatInteger(c.videoViews)),
  },
  {
    id: "videoCompletions",
    label: "Vídeo assistido até o fim",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.videoCompletions,
    render: (c) => (c.videoCompletions === null ? "Não disponível" : formatInteger(c.videoCompletions)),
  },
  {
    id: "videoAvgWatchTimeSeconds",
    label: "Tempo médio assistido (vídeo)",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.videoAvgWatchTimeSeconds,
    render: (c) => (c.videoAvgWatchTimeSeconds === null ? "Não disponível" : formatSeconds(c.videoAvgWatchTimeSeconds)),
  },
  {
    id: "outboundClicks",
    label: "Cliques para fora da plataforma",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.outboundClicks,
    render: (c) => (c.outboundClicks === null ? "Não disponível" : formatInteger(c.outboundClicks)),
  },
  {
    id: "uniqueClicks",
    label: "Cliques únicos",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.uniqueClicks,
    render: (c) => (c.uniqueClicks === null ? "Não disponível" : formatInteger(c.uniqueClicks)),
  },
  {
    id: "estimatedAdRecallRate",
    label: "Taxa de lembrança do anúncio",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.estimatedAdRecallRate,
    render: (c) => (c.estimatedAdRecallRate === null ? "Não disponível" : formatPercent(c.estimatedAdRecallRate)),
  },
  {
    id: "estimatedAdRecallers",
    label: "Pessoas que lembrarão do anúncio",
    numeric: true,
    defaultVisible: false,
    value: (c) => c.estimatedAdRecallers,
    render: (c) => (c.estimatedAdRecallers === null ? "Não disponível" : formatInteger(c.estimatedAdRecallers)),
  },
];

function formatSeconds(seconds: number): string {
  return `${seconds.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} s`;
}

const STATUS_TONE: Record<CampaignStatus, string> = {
  ACTIVE: "bg-intel-green/10 text-intel-green border-intel-green/20",
  PAUSED: "bg-amber-400/10 text-amber-300 border-amber-400/20",
  DELETED: "bg-white/[0.05] text-intel-text-dim border-white/10",
  ARCHIVED: "bg-white/[0.05] text-intel-text-dim border-white/10",
  OTHER: "bg-white/[0.05] text-intel-text-dim border-white/10",
};

function StatusBadge({ status }: { status: CampaignStatus }) {
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${STATUS_TONE[status]}`}>
      {statusLabel(status)}
    </span>
  );
}

const QUALITY_RANKING_TONE: Record<string, string> = {
  ABOVE_AVERAGE: "bg-intel-green/10 text-intel-green border-intel-green/20",
  AVERAGE: "bg-white/[0.05] text-intel-text-dim border-white/10",
};

// Meta's ad relevance diagnostics — null (never delivered enough to rank,
// or Meta's own "UNKNOWN") renders nothing at all, never a fabricated
// "average" default.
function QualityBadge({ ranking }: { ranking: string | null }) {
  if (!ranking) return null;
  const tone = QUALITY_RANKING_TONE[ranking] ?? "bg-amber-400/10 text-amber-300 border-amber-400/20";
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] ${tone}`} title="Classificação de qualidade do anúncio, atribuída pela Meta em relação a outros anunciantes disputando o mesmo público.">
      {qualityRankingLabel(ranking)}
    </span>
  );
}

function SortButton({
  columnId,
  label,
  numeric,
  sortColumn,
  sortDir,
  onToggle,
}: {
  columnId: ColumnId | "name";
  label: string;
  numeric: boolean;
  sortColumn: ColumnId | "name";
  sortDir: "asc" | "desc";
  onToggle: (columnId: ColumnId | "name") => void;
}) {
  const active = sortColumn === columnId;
  return (
    <button
      type="button"
      onClick={() => onToggle(columnId)}
      className={`inline-flex items-center gap-1 hover:text-intel-text transition-colors duration-200 ${numeric ? "flex-row-reverse" : ""}`}
    >
      <span>{label}</span>
      <svg
        width="9"
        height="9"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden="true"
        className={`transition-transform duration-200 ${active && sortDir === "asc" ? "rotate-180" : ""} ${active ? "opacity-100" : "opacity-30"}`}
      >
        <path d="M2 3.5L5 7l3-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

type NumericRange = { min: number | null; max: number | null };
const EMPTY_SELECTION: Set<string> = new Set();
const EMPTY_RANGE: NumericRange = { min: null, max: null };

function FilterIcon({ active }: { active: boolean }) {
  return (
    <svg
      width="11"
      height="11"
      viewBox="0 0 16 16"
      aria-hidden="true"
      className={active ? "text-intel-cyan" : "text-intel-text-dim/50"}
    >
      <path
        d="M2 3h12l-4.5 5.5V13l-3 1.5V8.5L2 3Z"
        stroke="currentColor"
        strokeWidth="1.3"
        strokeLinejoin="round"
        fill={active ? "currentColor" : "none"}
        fillOpacity={active ? 0.25 : 0}
      />
    </svg>
  );
}

/** Per-column, spreadsheet-style filter — a checklist of distinct values for a text/categorical column, or a min/max range for a numeric one. Layered on top of (never replacing) the free-text campaign search above the table. */
function ColumnFilterButton({
  column,
  isOpen,
  onToggleOpen,
  categoricalOptions,
  selectedValues,
  onToggleValue,
  numericRange,
  onChangeNumericRange,
  onClear,
}: {
  column: Column;
  isOpen: boolean;
  onToggleOpen: () => void;
  categoricalOptions: string[];
  selectedValues: Set<string>;
  onToggleValue: (value: string) => void;
  numericRange: NumericRange;
  onChangeNumericRange: (range: NumericRange) => void;
  onClear: () => void;
}) {
  const active = column.numeric ? numericRange.min !== null || numericRange.max !== null : selectedValues.size > 0;
  return (
    <div className="relative inline-flex">
      <button
        type="button"
        onClick={onToggleOpen}
        aria-expanded={isOpen}
        aria-haspopup="true"
        aria-label={`Filtrar ${column.label}`}
        className="p-0.5 rounded hover:bg-white/[0.08] transition-colors duration-150"
      >
        <FilterIcon active={active} />
      </button>
      {isOpen && (
        <div className={`absolute z-30 top-full mt-2 w-56 py-2.5 normal-case ${column.numeric ? "left-0" : "right-0"} ${INTEL_POPOVER}`}>
          {column.numeric ? (
            <div className="px-3.5 space-y-2.5">
              <div>
                <label className="block mb-1 text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim">Mínimo</label>
                <input
                  type="number"
                  value={numericRange.min ?? ""}
                  onChange={(e) =>
                    onChangeNumericRange({ min: e.target.value === "" ? null : Number(e.target.value), max: numericRange.max })
                  }
                  className={INTEL_INPUT}
                />
              </div>
              <div>
                <label className="block mb-1 text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim">Máximo</label>
                <input
                  type="number"
                  value={numericRange.max ?? ""}
                  onChange={(e) =>
                    onChangeNumericRange({ min: numericRange.min, max: e.target.value === "" ? null : Number(e.target.value) })
                  }
                  className={INTEL_INPUT}
                />
              </div>
            </div>
          ) : (
            <ul className="max-h-56 overflow-y-auto">
              {categoricalOptions.length === 0 ? (
                <li className="px-4 py-1.5 text-[12.5px] text-intel-text-dim/70">Sem valores no período</li>
              ) : (
                categoricalOptions.map((value) => (
                  <li key={value}>
                    <label className="flex items-center gap-2.5 px-4 py-1.5 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text cursor-pointer transition-colors duration-150">
                      <input
                        type="checkbox"
                        checked={selectedValues.has(value)}
                        onChange={() => onToggleValue(value)}
                        className="h-3.5 w-3.5 accent-intel-cyan"
                      />
                      {value}
                    </label>
                  </li>
                ))
              )}
            </ul>
          )}
          {active && (
            <div className="px-3.5 pt-2.5 mt-2 border-t border-white/[0.06]">
              <button
                type="button"
                onClick={onClear}
                className="text-[11px] tracking-[0.06em] uppercase text-intel-cyan hover:text-intel-text transition-colors duration-200"
              >
                Limpar filtro
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

type CampaignsTableProps = {
  campaigns: CampaignInsight[];
  adSets: AdSetInsight[];
  ads: AdInsight[];
  comparisonByCampaignId: Map<string, CampaignInsight> | null;
  /** Column ids hidden by the client's configured permissions — never offered in the column picker, regardless of defaultVisible. The admin always sees an empty set. */
  hiddenColumnIds: Set<string>;
};

export default function CampaignsTable({ campaigns, adSets, ads, comparisonByCampaignId, hiddenColumnIds }: CampaignsTableProps) {
  const availableColumns = useMemo(() => COLUMNS.filter((c) => !hiddenColumnIds.has(c.id)), [hiddenColumnIds]);

  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<ColumnId | "name">("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(
    () => new Set(availableColumns.filter((c) => c.defaultVisible).map((c) => c.id))
  );
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<CampaignInsight | null>(null);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());

  // Per-column spreadsheet-style filters — layered on top of the free-text
  // search above, never replacing it. Keyed by ColumnId; a column absent
  // from the map means "no restriction" for it.
  const [categoricalFilters, setCategoricalFilters] = useState<Map<ColumnId, Set<string>>>(new Map());
  const [numericFilters, setNumericFilters] = useState<Map<ColumnId, NumericRange>>(new Map());
  const [openFilterColumn, setOpenFilterColumn] = useState<ColumnId | null>(null);

  // Distinct values per text/categorical column, computed from the FULL
  // unfiltered campaign set — so a facet's own options never shrink away
  // just because another column's filter is currently narrowing the rows.
  const categoricalOptionsByColumn = useMemo(() => {
    const map = new Map<ColumnId, string[]>();
    for (const col of availableColumns) {
      if (col.numeric) continue;
      const values = new Set<string>();
      for (const c of campaigns) values.add(col.render(c));
      map.set(col.id, [...values].sort((a, b) => a.localeCompare(b, "pt-BR")));
    }
    return map;
  }, [availableColumns, campaigns]);

  function toggleCategoricalValue(columnId: ColumnId, value: string) {
    setCategoricalFilters((prev) => {
      const next = new Map(prev);
      const current = new Set(next.get(columnId) ?? []);
      if (current.has(value)) current.delete(value);
      else current.add(value);
      if (current.size === 0) next.delete(columnId);
      else next.set(columnId, current);
      return next;
    });
  }

  function setNumericRange(columnId: ColumnId, range: NumericRange) {
    setNumericFilters((prev) => {
      const next = new Map(prev);
      if (range.min === null && range.max === null) next.delete(columnId);
      else next.set(columnId, range);
      return next;
    });
  }

  function clearColumnFilter(columnId: ColumnId) {
    setCategoricalFilters((prev) => {
      if (!prev.has(columnId)) return prev;
      const next = new Map(prev);
      next.delete(columnId);
      return next;
    });
    setNumericFilters((prev) => {
      if (!prev.has(columnId)) return prev;
      const next = new Map(prev);
      next.delete(columnId);
      return next;
    });
  }

  function clearAllColumnFilters() {
    setCategoricalFilters(new Map());
    setNumericFilters(new Map());
  }

  const activeColumnFilterCount = categoricalFilters.size + numericFilters.size;

  const adSetsByCampaignId = useMemo(() => {
    const map = new Map<string, AdSetInsight[]>();
    for (const a of adSets) {
      const arr = map.get(a.campaignId);
      if (arr) arr.push(a);
      else map.set(a.campaignId, [a]);
    }
    return map;
  }, [adSets]);

  const adSetNameById = useMemo(() => new Map(adSets.map((a) => [a.adSetId, a.adSetName])), [adSets]);

  const adsByCampaignId = useMemo(() => {
    const map = new Map<string, AdInsight[]>();
    for (const ad of ads) {
      const arr = map.get(ad.campaignId);
      if (arr) arr.push(ad);
      else map.set(ad.campaignId, [ad]);
    }
    for (const arr of map.values()) arr.sort((a, b) => b.spend - a.spend);
    return map;
  }, [ads]);

  function toggleExpanded(key: string) {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return campaigns.filter((c) => {
      if (q && !c.campaignName.toLowerCase().includes(q)) return false;
      for (const [columnId, values] of categoricalFilters) {
        const col = COLUMNS.find((cc) => cc.id === columnId);
        if (col && !values.has(col.render(c))) return false;
      }
      for (const [columnId, range] of numericFilters) {
        const col = COLUMNS.find((cc) => cc.id === columnId);
        if (!col) continue;
        const raw = col.value(c);
        const v = typeof raw === "number" ? raw : null;
        if (v === null) return false;
        if (range.min !== null && v < range.min) return false;
        if (range.max !== null && v > range.max) return false;
      }
      return true;
    });
  }, [campaigns, search, categoricalFilters, numericFilters]);

  const sorted = useMemo(() => {
    const column = sortColumn === "name" ? null : COLUMNS.find((c) => c.id === sortColumn) ?? null;
    const rows = [...filtered];
    rows.sort((a, b) => {
      const va = column ? column.value(a) : a.campaignName;
      const vb = column ? column.value(b) : b.campaignName;
      let cmp: number;
      if (va === null && vb === null) cmp = 0;
      else if (va === null) cmp = 1;
      else if (vb === null) cmp = -1;
      else if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return rows;
  }, [filtered, sortColumn, sortDir]);

  function toggleSort(columnId: ColumnId | "name") {
    if (sortColumn === columnId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnId);
      setSortDir("desc");
    }
  }

  function toggleColumn(id: ColumnId) {
    setVisibleColumns((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function exportCsv() {
    const activeColumns = availableColumns.filter((c) => visibleColumns.has(c.id));
    const header = ["Campanha", ...activeColumns.map((c) => c.label)];
    const rows = sorted.map((c) => [c.campaignName, ...activeColumns.map((col) => col.render(c))]);
    downloadCsv(`campanhas-legado-intelligence-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  }

  const activeColumns = availableColumns.filter((c) => visibleColumns.has(c.id));
  const th = "text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2.5 px-3 select-none";
  const thNum = `${th} text-right`;
  const td = "py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]";
  const tdNum = `${td} text-right tabular-nums`;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-medium text-intel-text">Campanhas ({sorted.length})</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campanha..."
            aria-label="Buscar campanha por nome"
            className={`${INTEL_INPUT} w-40 sm:w-56`}
          />

          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnPickerOpen((v) => !v)}
              aria-expanded={columnPickerOpen}
              aria-haspopup="listbox"
              className="text-[12px] tracking-[0.04em] px-3 py-1.5 rounded-lg border border-white/10 text-intel-text-dim hover:border-white/25 hover:text-intel-text transition-colors duration-200"
            >
              Colunas
            </button>
            {columnPickerOpen && (
              <div className={`absolute right-0 z-20 mt-2 w-56 py-2 ${INTEL_POPOVER}`}>
                <ul className="max-h-72 overflow-y-auto">
                  {availableColumns.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2.5 px-4 py-1.5 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text cursor-pointer transition-colors duration-150">
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(c.id)}
                          onChange={() => toggleColumn(c.id)}
                          className="h-3.5 w-3.5 accent-intel-cyan"
                        />
                        {c.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {activeColumnFilterCount > 0 && (
            <button
              type="button"
              onClick={clearAllColumnFilters}
              className="text-[12px] tracking-[0.04em] px-3 py-1.5 rounded-lg border border-intel-cyan/40 text-intel-cyan hover:bg-intel-cyan/[0.1] transition-colors duration-200"
            >
              Limpar filtros ({activeColumnFilterCount})
            </button>
          )}

          <button
            type="button"
            onClick={exportCsv}
            disabled={sorted.length === 0}
            className="text-[12px] tracking-[0.04em] px-3 py-1.5 rounded-lg bg-intel-cyan text-[#04121a] font-medium hover:brightness-110 transition-[filter] duration-200 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-intel-text-dim">Nenhuma campanha encontrada.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={th}>
                  <SortButton
                    columnId="name"
                    label="Campanha"
                    numeric={false}
                    sortColumn={sortColumn}
                    sortDir={sortDir}
                    onToggle={toggleSort}
                  />
                </th>
                {activeColumns.map((c) => (
                  <th key={c.id} className={c.numeric ? thNum : th}>
                    <div className={`inline-flex items-center gap-1 ${c.numeric ? "flex-row-reverse" : ""}`}>
                      <SortButton
                        columnId={c.id}
                        label={c.label}
                        numeric={c.numeric}
                        sortColumn={sortColumn}
                        sortDir={sortDir}
                        onToggle={toggleSort}
                      />
                      <ColumnFilterButton
                        column={c}
                        isOpen={openFilterColumn === c.id}
                        onToggleOpen={() => setOpenFilterColumn((prev) => (prev === c.id ? null : c.id))}
                        categoricalOptions={categoricalOptionsByColumn.get(c.id) ?? []}
                        selectedValues={categoricalFilters.get(c.id) ?? EMPTY_SELECTION}
                        onToggleValue={(value) => toggleCategoricalValue(c.id, value)}
                        numericRange={numericFilters.get(c.id) ?? EMPTY_RANGE}
                        onChangeNumericRange={(range) => setNumericRange(c.id, range)}
                        onClear={() => clearColumnFilter(c.id)}
                      />
                    </div>
                  </th>
                ))}
                {comparisonByCampaignId && <th className={thNum}>Δ Investimento</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const key = `${c.accountId}-${c.campaignId}`;
                const prev = comparisonByCampaignId?.get(c.campaignId) ?? null;
                const delta = prev ? pctChange(c.spend, prev.spend) : null;
                const campaignAdSets = adSetsByCampaignId.get(c.campaignId) ?? [];
                const isExpanded = expandedIds.has(key);
                return (
                  <Fragment key={key}>
                    <tr
                      onClick={() => setDetailCampaign(c)}
                      className="cursor-pointer hover:bg-white/[0.035] transition-colors duration-150"
                    >
                      <td className={td}>
                        <div className="flex items-center gap-2 min-w-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleExpanded(key);
                            }}
                            aria-expanded={isExpanded}
                            aria-label={isExpanded ? "Recolher conjuntos de anúncios" : "Expandir conjuntos de anúncios"}
                            disabled={campaignAdSets.length === 0}
                            className="shrink-0 flex h-5 w-5 items-center justify-center rounded text-intel-text-dim hover:text-intel-text disabled:opacity-25 disabled:cursor-not-allowed transition-colors duration-150"
                          >
                            <svg
                              width="9"
                              height="9"
                              viewBox="0 0 10 10"
                              fill="none"
                              aria-hidden="true"
                              className={`transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}
                            >
                              <path d="M3 1.5L7 5L3 8.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
                            </svg>
                          </button>
                          {/* Capped so one very long technical name can't force this column (and, with it, every column to its right) wider than a reasonable width — the full name is always available via this title tooltip and, untruncated, in the detail panel and CSV export. */}
                          <span className="block max-w-[260px] truncate text-intel-text" title={c.campaignName}>
                            {c.campaignName}
                          </span>
                          {campaignAdSets.length > 0 && (
                            <span className="shrink-0 text-[11px] text-intel-text-dim/70">
                              ({campaignAdSets.length} {campaignAdSets.length === 1 ? "conjunto" : "conjuntos"})
                            </span>
                          )}
                        </div>
                      </td>
                      {activeColumns.map((col) => (
                        <td key={col.id} className={col.numeric ? tdNum : td}>
                          {col.id === "status" ? <StatusBadge status={c.status} /> : col.render(c)}
                        </td>
                      ))}
                      {comparisonByCampaignId && (
                        <td className={tdNum}>
                          {delta === null ? (
                            <span className="text-intel-text-dim/60">—</span>
                          ) : (
                            <span className={delta > 0 ? "text-intel-green" : delta < 0 ? "text-intel-red" : "text-intel-text-dim"}>
                              {formatSignedPercent(delta)}
                            </span>
                          )}
                        </td>
                      )}
                    </tr>
                    {isExpanded && (
                      <tr className="bg-white/[0.015]">
                        <td
                          colSpan={1 + activeColumns.length + (comparisonByCampaignId ? 1 : 0)}
                          className="px-3 pb-4 pt-2 border-t border-white/[0.05]"
                        >
                          <AdSetList adSets={campaignAdSets} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {detailCampaign && (
        <CampaignDetailPanel
          campaign={detailCampaign}
          comparison={comparisonByCampaignId?.get(detailCampaign.campaignId) ?? null}
          adSets={adSetsByCampaignId.get(detailCampaign.campaignId) ?? []}
          ads={adsByCampaignId.get(detailCampaign.campaignId) ?? []}
          adSetNameById={adSetNameById}
          onClose={() => setDetailCampaign(null)}
        />
      )}
    </div>
  );
}

// Pure render, no fetch — ad sets arrive already loaded as part of the main
// dashboard payload (see AdSetInsight), so both the inline table row and the
// detail panel just filter/group the same array by campaignId.
function AdSetList({ adSets }: { adSets: AdSetInsight[] }) {
  if (adSets.length === 0) {
    return <p className="text-[12px] text-intel-text-dim">Nenhum conjunto de anúncios neste período.</p>;
  }

  return (
    <ul className="space-y-2">
      {adSets.map((a) => (
        <li key={a.adSetId} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <span className="text-[13px] text-intel-text">{a.adSetName}</span>
            <StatusBadge status={a.status} />
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-intel-text-dim tabular-nums">
            <span>Investimento: {formatCurrencyBRL(a.spend)}</span>
            <span>Impressões: {formatInteger(a.impressions)}</span>
            <span>Cliques: {formatInteger(a.clicks)}</span>
            <span>Cliques no link: {formatInteger(a.linkClicks)}</span>
            <span>Conversa iniciada: {a.conversations === null ? "Não disponível" : formatInteger(a.conversations)}</span>
            <span>
              Custo/conversa:{" "}
              {(() => {
                const v = costPerConversation(a);
                return v === null ? "—" : formatCurrencyBRL(v);
              })()}
            </span>
            <span>Alcance: {formatInteger(a.reach)}</span>
          </div>
        </li>
      ))}
    </ul>
  );
}

const MAX_TOP_ADS = 5;

function CampaignDetailPanel({
  campaign,
  comparison,
  adSets,
  ads,
  adSetNameById,
  onClose,
}: {
  campaign: CampaignInsight;
  comparison: CampaignInsight | null;
  adSets: AdSetInsight[];
  ads: AdInsight[];
  adSetNameById: Map<string, string>;
  onClose: () => void;
}) {
  const rows: { label: string; current: string; previous?: string }[] = [
    { label: "Investimento", current: formatCurrencyBRL(campaign.spend), previous: comparison ? formatCurrencyBRL(comparison.spend) : undefined },
    {
      label: "Impressões",
      current: formatInteger(campaign.impressions),
      previous: comparison ? formatInteger(comparison.impressions) : undefined,
    },
    { label: "Cliques (todos)", current: formatInteger(campaign.clicks), previous: comparison ? formatInteger(comparison.clicks) : undefined },
    {
      label: "Cliques no link",
      current: formatInteger(campaign.linkClicks),
      previous: comparison ? formatInteger(comparison.linkClicks) : undefined,
    },
    {
      label: "Conversa iniciada",
      current: campaign.conversations === null ? "Não disponível" : formatInteger(campaign.conversations),
      previous: comparison ? (comparison.conversations === null ? "Não disponível" : formatInteger(comparison.conversations)) : undefined,
    },
    {
      label: "Custo por conversa iniciada",
      current: costPerConversation(campaign) === null ? "—" : formatCurrencyBRL(costPerConversation(campaign)!),
      previous:
        comparison !== null
          ? costPerConversation(comparison) === null
            ? "—"
            : formatCurrencyBRL(costPerConversation(comparison)!)
          : undefined,
    },
    {
      label: "CTR",
      current: ctr(campaign) === null ? "—" : formatPercent(ctr(campaign)!),
      previous: comparison ? (ctr(comparison) === null ? "—" : formatPercent(ctr(comparison)!)) : undefined,
    },
    {
      label: "CPC",
      current: cpc(campaign) === null ? "—" : formatCurrencyBRL(cpc(campaign)!),
      previous: comparison ? (cpc(comparison) === null ? "—" : formatCurrencyBRL(cpc(comparison)!)) : undefined,
    },
    { label: "Alcance", current: formatInteger(campaign.reach), previous: comparison ? formatInteger(comparison.reach) : undefined },
  ];

  return (
    <div className="fixed inset-0 z-40">
      <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="absolute inset-0 bg-black/60" />
      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-intel-surface-1 border-l border-white/10 shadow-[0_0_60px_-12px_rgba(0,0,0,0.8)] p-6 overflow-y-auto animate-intel-in">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h4 className="font-sans text-lg font-semibold text-intel-text">{campaign.campaignName}</h4>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0 text-intel-text-dim hover:text-intel-text transition-colors duration-200">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 5L19 19M19 5L5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className={`text-[12px] text-intel-text-dim ${campaign.dailyBudget !== null || campaign.lifetimeBudget !== null ? "mb-1" : "mb-6"}`}>
          {campaign.accountName} · {objectiveLabel(campaign.objective)} · <StatusBadge status={campaign.status} />
        </p>
        {(campaign.dailyBudget !== null || campaign.lifetimeBudget !== null) && (
          <p className="text-[12px] text-intel-text-dim mb-6">
            {campaign.dailyBudget !== null && <>Orçamento diário: {formatCurrencyBRL(campaign.dailyBudget)}</>}
            {campaign.lifetimeBudget !== null && <>Orçamento total: {formatCurrencyBRL(campaign.lifetimeBudget)}</>}
            {campaign.budgetRemaining !== null && <> · Restante: {formatCurrencyBRL(campaign.budgetRemaining)}</>}
          </p>
        )}

        <dl className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
              <dt className="text-[12px] text-intel-text-dim">{row.label}</dt>
              <dd className="text-right">
                <span className="text-sm tabular-nums text-intel-text">{row.current}</span>
                {row.previous !== undefined && (
                  <span className="block text-[11px] tabular-nums text-intel-text-dim/70">anterior: {row.previous}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-[11px] leading-relaxed text-intel-text-dim/70">
          “Cliques (todos)” é o campo clicks da Meta (todo tipo de clique no anúncio); “Cliques no link” é
          inline_link_clicks — cliques que levam ao destino do anúncio, mas não é uma conversa iniciada;
          “Conversa iniciada” conta conversas por mensagem efetivamente iniciadas (atribuição de 7 dias após
          clique) e aparece como “Não disponível” quando o objetivo da campanha não suporta essa métrica;
          “Custo por conversa iniciada” é o investimento dividido apenas por conversas iniciadas válidas.
        </p>

        <div className="mt-6">
          <h5 className="text-[11px] tracking-[0.1em] uppercase text-intel-text-dim mb-3">Conjuntos de anúncios</h5>
          <AdSetList adSets={adSets} />
        </div>

        <div className="mt-6">
          <h5 className="text-[11px] tracking-[0.1em] uppercase text-intel-text-dim mb-3">
            Melhores anúncios {ads.length > MAX_TOP_ADS ? `(top ${MAX_TOP_ADS} de ${ads.length})` : ""}
          </h5>
          {ads.length === 0 ? (
            <p className="text-[12px] text-intel-text-dim">Nenhum anúncio com dados neste período.</p>
          ) : (
            <ol className="space-y-2">
              {ads.slice(0, MAX_TOP_ADS).map((ad, i) => (
                <li key={ad.adId} className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5">
                  <div className="flex items-start justify-between gap-2">
                    <span className="flex items-start gap-2 min-w-0">
                      {ad.thumbnailUrl && (
                        // eslint-disable-next-line @next/next/no-img-element -- external Meta CDN thumbnail, not a local/optimizable asset
                        <img src={ad.thumbnailUrl} alt="" className="shrink-0 w-8 h-8 rounded object-cover border border-white/10" />
                      )}
                      <span className="shrink-0 text-[11px] tabular-nums text-intel-text-dim">{i + 1}</span>
                      <span className="min-w-0 text-[13px] text-intel-text truncate">{ad.adName}</span>
                    </span>
                    <span className="flex items-center gap-1.5 shrink-0">
                      <QualityBadge ranking={ad.qualityRanking} />
                      <StatusBadge status={ad.status} />
                    </span>
                  </div>
                  <p className="mt-0.5 pl-[22px] text-[11px] text-intel-text-dim/70 truncate">
                    {adSetNameById.get(ad.adSetId) ?? "Conjunto sem nome"}
                    {ad.creativeTitle && <> · {ad.creativeTitle}</>}
                    {ad.callToAction && <> · {ctaLabel(ad.callToAction)}</>}
                  </p>
                  <div className="mt-2 pl-[22px] flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-intel-text-dim tabular-nums">
                    <span>Investimento: {formatCurrencyBRL(ad.spend)}</span>
                    <span>Cliques no link: {formatInteger(ad.linkClicks)}</span>
                    <span>Conversa iniciada: {ad.conversations === null ? "Não disponível" : formatInteger(ad.conversations)}</span>
                    <span>
                      Custo/conversa:{" "}
                      {(() => {
                        const v = costPerConversation(ad);
                        return v === null ? "—" : formatCurrencyBRL(v);
                      })()}
                    </span>
                    <span>Alcance: {formatInteger(ad.reach)}</span>
                  </div>
                </li>
              ))}
            </ol>
          )}
        </div>
      </div>
    </div>
  );
}
