"use client";

import { useMemo, useState } from "react";
import type { CampaignInsight } from "@/lib/meta-ads-types";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent, formatSignedPercent } from "@/lib/format";
import { ctr, cpc, cpm, pctChange } from "@/lib/metrics";
import { downloadCsv } from "@/lib/csv";

type ColumnId =
  | "account"
  | "status"
  | "objective"
  | "spend"
  | "impressions"
  | "clicks"
  | "linkClicks"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach";

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
    defaultVisible: false,
    value: (c) => c.linkClicks,
    render: (c) => formatInteger(c.linkClicks),
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
];

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
      className={`inline-flex items-center gap-1 hover:text-navy-950 transition-colors ${numeric ? "flex-row-reverse" : ""}`}
    >
      <span>{label}</span>
      <svg
        width="9"
        height="9"
        viewBox="0 0 10 10"
        fill="none"
        aria-hidden="true"
        className={`transition-transform ${active && sortDir === "asc" ? "rotate-180" : ""} ${active ? "opacity-100" : "opacity-30"}`}
      >
        <path d="M2 3.5L5 7l3-3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}

type CampaignsTableProps = {
  campaigns: CampaignInsight[];
  comparisonByCampaignId: Map<string, CampaignInsight> | null;
};

export default function CampaignsTable({ campaigns, comparisonByCampaignId }: CampaignsTableProps) {
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<ColumnId | "name">("spend");
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");
  const [visibleColumns, setVisibleColumns] = useState<Set<ColumnId>>(
    new Set(COLUMNS.filter((c) => c.defaultVisible).map((c) => c.id))
  );
  const [columnPickerOpen, setColumnPickerOpen] = useState(false);
  const [detailCampaign, setDetailCampaign] = useState<CampaignInsight | null>(null);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return campaigns;
    return campaigns.filter((c) => c.campaignName.toLowerCase().includes(q));
  }, [campaigns, search]);

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
    const activeColumns = COLUMNS.filter((c) => visibleColumns.has(c.id));
    const header = ["Campanha", ...activeColumns.map((c) => c.label)];
    const rows = sorted.map((c) => [c.campaignName, ...activeColumns.map((col) => col.render(c))]);
    downloadCsv(`campanhas-legado-intelligence-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...rows]);
  }

  const activeColumns = COLUMNS.filter((c) => visibleColumns.has(c.id));
  const th = "text-left text-[11px] tracking-[0.08em] uppercase text-navy-500 font-medium py-2 px-3 select-none";
  const thNum = `${th} text-right`;
  const td = "py-2.5 px-3 text-[13px] text-navy-800 border-t border-navy-700/8";
  const tdNum = `${td} text-right tabular-nums`;

  return (
    <div className="rounded-2xl border border-navy-700/10 bg-white p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-sm font-medium text-navy-950">Campanhas ({sorted.length})</h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar campanha..."
            aria-label="Buscar campanha por nome"
            className="rounded-lg border border-navy-700/20 bg-white px-3 py-1.5 text-[13px] text-navy-800 placeholder:text-navy-400 focus:border-navy-600 focus:outline-none w-40 sm:w-56"
          />

          <div className="relative">
            <button
              type="button"
              onClick={() => setColumnPickerOpen((v) => !v)}
              aria-expanded={columnPickerOpen}
              aria-haspopup="listbox"
              className="text-[12px] tracking-[0.04em] px-3 py-1.5 rounded-lg border border-navy-700/20 text-navy-700 hover:border-navy-600/40 transition-colors"
            >
              Colunas
            </button>
            {columnPickerOpen && (
              <div className="absolute right-0 z-20 mt-2 w-56 rounded-xl border border-navy-700/10 bg-white shadow-lg py-2">
                <ul className="max-h-72 overflow-y-auto">
                  {COLUMNS.map((c) => (
                    <li key={c.id}>
                      <label className="flex items-center gap-2.5 px-4 py-1.5 text-[13px] text-navy-800 hover:bg-silver-100 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={visibleColumns.has(c.id)}
                          onChange={() => toggleColumn(c.id)}
                          className="h-3.5 w-3.5"
                        />
                        {c.label}
                      </label>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={exportCsv}
            disabled={sorted.length === 0}
            className="text-[12px] tracking-[0.04em] px-3 py-1.5 rounded-lg bg-navy-950 text-white hover:bg-navy-800 transition-colors disabled:opacity-50"
          >
            Exportar CSV
          </button>
        </div>
      </div>

      {sorted.length === 0 ? (
        <p className="text-sm text-navy-500">Nenhuma campanha encontrada.</p>
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
                    <SortButton
                      columnId={c.id}
                      label={c.label}
                      numeric={c.numeric}
                      sortColumn={sortColumn}
                      sortDir={sortDir}
                      onToggle={toggleSort}
                    />
                  </th>
                ))}
                {comparisonByCampaignId && <th className={thNum}>Δ Investimento</th>}
              </tr>
            </thead>
            <tbody>
              {sorted.map((c) => {
                const prev = comparisonByCampaignId?.get(c.campaignId) ?? null;
                const delta = prev ? pctChange(c.spend, prev.spend) : null;
                return (
                  <tr
                    key={`${c.accountId}-${c.campaignId}`}
                    onClick={() => setDetailCampaign(c)}
                    className="cursor-pointer hover:bg-silver-100/60 transition-colors"
                  >
                    <td className={td}>{c.campaignName}</td>
                    {activeColumns.map((col) => (
                      <td key={col.id} className={col.numeric ? tdNum : td}>
                        {col.render(c)}
                      </td>
                    ))}
                    {comparisonByCampaignId && (
                      <td className={tdNum}>
                        {delta === null ? (
                          <span className="text-navy-400">—</span>
                        ) : (
                          <span className={delta > 0 ? "text-emerald-700" : delta < 0 ? "text-red-700" : "text-navy-500"}>
                            {formatSignedPercent(delta)}
                          </span>
                        )}
                      </td>
                    )}
                  </tr>
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
          onClose={() => setDetailCampaign(null)}
        />
      )}
    </div>
  );
}

function CampaignDetailPanel({
  campaign,
  comparison,
  onClose,
}: {
  campaign: CampaignInsight;
  comparison: CampaignInsight | null;
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
      <button type="button" aria-label="Fechar detalhes" onClick={onClose} className="absolute inset-0 bg-navy-950/40" />
      <div className="absolute inset-y-0 right-0 w-full max-w-md bg-white shadow-2xl p-6 overflow-y-auto">
        <div className="flex items-start justify-between gap-3 mb-1">
          <h4 className="font-sans text-lg font-semibold text-navy-950">{campaign.campaignName}</h4>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0 text-navy-500 hover:text-navy-950">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M5 5L19 19M19 5L5 19" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </div>
        <p className="text-[12px] text-navy-500 mb-6">
          {campaign.accountName} · {objectiveLabel(campaign.objective)} · {statusLabel(campaign.status)}
        </p>

        <dl className="space-y-3">
          {rows.map((row) => (
            <div key={row.label} className="flex items-center justify-between border-b border-navy-700/8 pb-2.5">
              <dt className="text-[12px] text-navy-500">{row.label}</dt>
              <dd className="text-right">
                <span className="text-sm tabular-nums text-navy-950">{row.current}</span>
                {row.previous !== undefined && (
                  <span className="block text-[11px] tabular-nums text-navy-400">anterior: {row.previous}</span>
                )}
              </dd>
            </div>
          ))}
        </dl>

        <p className="mt-6 text-[11px] leading-relaxed text-navy-400">
          “Cliques (todos)” é o campo clicks da Meta (todo tipo de clique no anúncio); “Cliques no link” é
          inline_link_clicks (apenas cliques que levam ao destino do anúncio).
        </p>
      </div>
    </div>
  );
}
