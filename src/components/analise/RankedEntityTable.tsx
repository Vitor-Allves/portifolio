"use client";

import { useMemo, useState } from "react";
import type { CampaignStatus } from "@/lib/meta-ads-types";
import { statusLabel, ctaLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent } from "@/lib/format";
import { ctr, cpc, cpm, costPerConversation } from "@/lib/metrics";
import { downloadCsv } from "@/lib/csv";
import { INTEL_INPUT } from "./intel-styles";

function FormatIcon({ isVideo }: { isVideo?: boolean }) {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-intel-text-dim/60">
      {isVideo ? (
        <path d="M8 6.5v11l9-5.5-9-5.5Z" fill="currentColor" />
      ) : (
        <>
          <rect x="4" y="5" width="16" height="14" rx="2" stroke="currentColor" strokeWidth="1.5" />
          <circle cx="9" cy="10" r="1.5" fill="currentColor" />
          <path d="M5 17l4.5-4.5 3 3L17 11l2 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </>
      )}
    </svg>
  );
}

/** The ad creative thumbnail: lazy-loaded, with a play badge for video ads and a silver placeholder (never a broken-image icon) the moment Meta's time-limited thumbnail URL fails to load. */
function AdThumbnail({ url, isVideo, size = 40 }: { url: string | null | undefined; isVideo?: boolean; size?: number }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return (
      <span
        className="flex shrink-0 items-center justify-center rounded-[10px] bg-white/[0.06] border border-white/10"
        style={{ width: size, height: size }}
      >
        <FormatIcon isVideo={isVideo} />
      </span>
    );
  }
  return (
    <span className="relative shrink-0 rounded-[10px] overflow-hidden" style={{ width: size, height: size }}>
      <img
        src={url}
        alt=""
        loading="lazy"
        onError={() => setFailed(true)}
        className="h-full w-full object-cover"
      />
      {isVideo && (
        <span className="absolute inset-0 flex items-center justify-center bg-black/25" aria-hidden="true">
          <svg width={Math.round(size * 0.4)} height={Math.round(size * 0.4)} viewBox="0 0 24 24" fill="#fff">
            <path d="M8 6.5v11l9-5.5-9-5.5Z" />
          </svg>
        </span>
      )}
    </span>
  );
}

function AdDetailModal({ row, onClose }: { row: RankedRow; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true" aria-label={`Detalhe do anúncio ${row.name}`}>
      <button type="button" aria-label="Fechar" onClick={onClose} className="absolute inset-0 bg-black/70" />
      <div className="relative z-10 w-full max-w-md rounded-2xl border border-white/10 bg-intel-surface-1 p-5 max-h-[85vh] overflow-y-auto">
        <button
          type="button"
          onClick={onClose}
          aria-label="Fechar"
          className="absolute right-4 top-4 text-intel-text-dim hover:text-intel-text transition-colors duration-200"
        >
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <div className="flex justify-center mb-4">
          <AdThumbnail url={row.thumbnailUrl} isVideo={row.isVideo} size={160} />
        </div>
        <p className="text-[13px] font-medium text-intel-text mb-1">{row.name}</p>
        <p className="text-[11.5px] text-intel-text-dim mb-4">
          {row.campaignName} · {row.accountName}
        </p>
        {row.creativeTitle && <p className="text-[13px] text-intel-text mb-1">{row.creativeTitle}</p>}
        {row.creativeBody && <p className="text-[12.5px] text-intel-text-dim leading-relaxed mb-2">{row.creativeBody}</p>}
        {row.callToAction && (
          <span className="inline-block text-[11px] px-2.5 py-1 rounded-full bg-white/[0.06] text-intel-text-dim mb-3">
            {ctaLabel(row.callToAction)}
          </span>
        )}
        <dl className="grid grid-cols-2 gap-x-4 gap-y-2 mt-3 pt-3 border-t border-white/[0.06]">
          <div>
            <dt className="text-[10px] uppercase tracking-[0.06em] text-intel-text-dim/70">Investimento</dt>
            <dd className="text-[13px] text-intel-text tabular-nums">{formatCurrencyBRL(row.spend)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.06em] text-intel-text-dim/70">Alcance</dt>
            <dd className="text-[13px] text-intel-text tabular-nums">{formatInteger(row.reach)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.06em] text-intel-text-dim/70">Cliques no link</dt>
            <dd className="text-[13px] text-intel-text tabular-nums">{formatInteger(row.linkClicks)}</dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-[0.06em] text-intel-text-dim/70">Conversa iniciada</dt>
            <dd className="text-[13px] text-intel-text tabular-nums">
              {row.conversations === null ? "Não disponível" : formatInteger(row.conversations)}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}

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
  conversations: number | null;
  reach: number;
  /** Creative fields — only ever set for the "Melhores anúncios" table (ad sets have no creative of their own). undefined everywhere else, which is what hides the thumbnail column for them. */
  thumbnailUrl?: string | null;
  isVideo?: boolean;
  creativeTitle?: string | null;
  creativeBody?: string | null;
  callToAction?: string | null;
};

type ColumnId =
  | "campaignName"
  | "accountName"
  | "status"
  | "spend"
  | "impressions"
  | "clicks"
  | "linkClicks"
  | "conversations"
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
  { id: "linkClicks", label: "Cliques no link", numeric: true, value: (r) => r.linkClicks, render: (r) => formatInteger(r.linkClicks) },
  {
    id: "conversations",
    label: "Conversa iniciada",
    numeric: true,
    value: (r) => r.conversations,
    render: (r) => (r.conversations === null ? "Não disponível" : formatInteger(r.conversations)),
  },
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
  const [detailRow, setDetailRow] = useState<RankedRow | null>(null);
  const hasCreatives = rows.some((r) => r.thumbnailUrl !== undefined);

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
                {hasCreatives && <th className={`${th} w-12`} aria-hidden="true" />}
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
                  {hasCreatives && (
                    <td className={td}>
                      <button type="button" onClick={() => setDetailRow(r)} aria-label={`Ver detalhe de ${r.name}`}>
                        <AdThumbnail url={r.thumbnailUrl} isVideo={r.isVideo} />
                      </button>
                    </td>
                  )}
                  <td className={td}>
                    {hasCreatives ? (
                      <button
                        type="button"
                        onClick={() => setDetailRow(r)}
                        className="block max-w-[240px] truncate text-left hover:text-intel-text hover:underline underline-offset-2 transition-colors duration-150"
                        title={r.name}
                      >
                        {r.name}
                      </button>
                    ) : (
                      <span className="block max-w-[240px] truncate" title={r.name}>
                        {r.name}
                      </span>
                    )}
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
      {detailRow && <AdDetailModal row={detailRow} onClose={() => setDetailRow(null)} />}
    </div>
  );
}
