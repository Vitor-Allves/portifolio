"use client";

import { useMemo, useState } from "react";
import type { CampaignStatus } from "@/lib/meta-ads-types";
import { statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation } from "@/lib/metrics";
import { downloadCsv } from "@/lib/csv";
import { INTEL_INPUT } from "./intel-styles";

export type RankedRow = {
  id: string;
  name: string;
  campaignName: string;
  accountName: string;
  status: CampaignStatus;
  spend: number;
  impressions: number;
  clicks: number;
  linkClicks: number;
  reach: number;
};

type ColumnId =
  | "campaignName"
  | "accountName"
  | "status"
  | "spend"
  | "impressions"
  | "clicks"
  | "linkClicks"
  | "costPerConversation"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach";

type Column = {
  id: ColumnId;
  label: string;
  numeric: boolean;
  value: (r: RankedRow) => number | string | null;
  render: (r: RankedRow) => string;
};

const COLUMNS: Column[] = [
  { id: "campaignName", label: "Campanha", numeric: false, value: (r) => r.campaignName, render: (r) => r.campaignName },
  { id: "accountName", label: "Conta", numeric: false, value: (r) => r.accountName, render: (r) => r.accountName },
  { id: "status", label: "Status", numeric: false, value: (r) => r.status, render: (r) => statusLabel(r.status) },
  { id: "spend", label: "Investimento", numeric: true, value: (r) => r.spend, render: (r) => formatCurrencyBRL(r.spend) },
  { id: "impressions", label: "Impressões", numeric: true, value: (r) => r.impressions, render: (r) => formatInteger(r.impressions) },
  { id: "clicks", label: "Cliques", numeric: true, value: (r) => r.clicks, render: (r) => formatInteger(r.clicks) },
  { id: "linkClicks", label: "Conversa iniciada", numeric: true, value: (r) => r.linkClicks, render: (r) => formatInteger(r.linkClicks) },
  {
    id: "costPerConversation",
    label: "Custo/Conversa",
    numeric: true,
    value: (r) => costPerConversation(r),
    render: (r) => {
      const v = costPerConversation(r);
      return v === null ? "—" : formatCurrencyBRL(v);
    },
  },
  {
    id: "ctr",
    label: "CTR",
    numeric: true,
    value: (r) => ctr(r),
    render: (r) => {
      const v = ctr(r);
      return v === null ? "—" : formatPercent(v);
    },
  },
  {
    id: "cpc",
    label: "CPC",
    numeric: true,
    value: (r) => cpc(r),
    render: (r) => {
      const v = cpc(r);
      return v === null ? "—" : formatCurrencyBRL(v);
    },
  },
  {
    id: "cpm",
    label: "CPM",
    numeric: true,
    value: (r) => cpm(r),
    render: (r) => {
      const v = cpm(r);
      return v === null ? "—" : formatCurrencyBRL(v);
    },
  },
  { id: "reach", label: "Alcance", numeric: true, value: (r) => r.reach, render: (r) => formatInteger(r.reach) },
];

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

type RankedEntityTableProps = {
  title: string;
  nameLabel: string;
  rows: RankedRow[];
  csvFilePrefix: string;
  defaultSort?: ColumnId;
};

// Shared by the "Conjuntos" and "Melhores anúncios" sections on the
// Campanhas page — same sortable/searchable/exportable shape as
// CampaignsTable, minus the column picker and expand rows (this is a flat
// ranking across every filtered campaign, not a per-campaign drill-down).
export default function RankedEntityTable({ title, nameLabel, rows, csvFilePrefix, defaultSort = "spend" }: RankedEntityTableProps) {
  const [search, setSearch] = useState("");
  const [sortColumn, setSortColumn] = useState<ColumnId | "name">(defaultSort);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("desc");

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter((r) => r.name.toLowerCase().includes(q));
  }, [rows, search]);

  const sorted = useMemo(() => {
    const column = sortColumn === "name" ? null : COLUMNS.find((c) => c.id === sortColumn) ?? null;
    const list = [...filtered];
    list.sort((a, b) => {
      const va = column ? column.value(a) : a.name;
      const vb = column ? column.value(b) : b.name;
      let cmp: number;
      if (va === null && vb === null) cmp = 0;
      else if (va === null) cmp = 1;
      else if (vb === null) cmp = -1;
      else if (typeof va === "number" && typeof vb === "number") cmp = va - vb;
      else cmp = String(va).localeCompare(String(vb), "pt-BR");
      return sortDir === "asc" ? cmp : -cmp;
    });
    return list;
  }, [filtered, sortColumn, sortDir]);

  function toggleSort(columnId: ColumnId | "name") {
    if (sortColumn === columnId) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortColumn(columnId);
      setSortDir("desc");
    }
  }

  function exportCsv() {
    const header = [nameLabel, ...COLUMNS.map((c) => c.label)];
    const dataRows = sorted.map((r) => [r.name, ...COLUMNS.map((col) => col.render(r))]);
    downloadCsv(`${csvFilePrefix}-legado-intelligence-${new Date().toISOString().slice(0, 10)}.csv`, [header, ...dataRows]);
  }

  const th = "text-left text-[10.5px] tracking-[0.08em] uppercase text-intel-text-dim font-medium py-2.5 px-3 select-none";
  const thNum = `${th} text-right`;
  const td = "py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]";
  const tdNum = `${td} text-right tabular-nums`;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h3 className="text-[13px] font-medium text-intel-text">
          {title} ({sorted.length})
        </h3>
        <div className="flex flex-wrap items-center gap-2">
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Buscar ${nameLabel.toLowerCase()}...`}
            aria-label={`Buscar ${nameLabel.toLowerCase()} por nome`}
            className={`${INTEL_INPUT} w-40 sm:w-56`}
          />
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
        <p className="text-sm text-intel-text-dim">Nenhum {nameLabel.toLowerCase()} encontrado no período para os filtros atuais.</p>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] border-collapse">
            <thead>
              <tr>
                <th className={th}>
                  <SortButton columnId="name" label={nameLabel} numeric={false} sortColumn={sortColumn} sortDir={sortDir} onToggle={toggleSort} />
                </th>
                {COLUMNS.map((c) => (
                  <th key={c.id} className={c.numeric ? thNum : th}>
                    <SortButton columnId={c.id} label={c.label} numeric={c.numeric} sortColumn={sortColumn} sortDir={sortDir} onToggle={toggleSort} />
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="hover:bg-white/[0.035] transition-colors duration-150">
                  <td className={td}>
                    <span className="block max-w-[240px] truncate" title={r.name}>
                      {r.name}
                    </span>
                  </td>
                  {COLUMNS.map((col) => (
                    <td key={col.id} className={col.numeric ? tdNum : td}>
                      {col.id === "status" ? <StatusBadge status={r.status} /> : col.render(r)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
