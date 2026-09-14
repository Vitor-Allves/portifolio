"use client";

import { useEffect, useMemo, useState } from "react";
import type { AdSetInsight, CampaignInsight, CampaignStatus, Period } from "@/lib/meta-ads-types";
import { objectiveLabel, statusLabel } from "@/lib/campaign-labels";
import { formatCurrencyBRL, formatInteger, formatPercent, formatSignedPercent } from "@/lib/format";
import { ctr, cpc, cpm, pctChange } from "@/lib/metrics";
import { downloadCsv } from "@/lib/csv";
import { INTEL_INPUT, INTEL_POPOVER } from "./intel-styles";

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

type CampaignsTableProps = {
  campaigns: CampaignInsight[];
  comparisonByCampaignId: Map<string, CampaignInsight> | null;
  period: Period;
};

export default function CampaignsTable({ campaigns, comparisonByCampaignId, period }: CampaignsTableProps) {
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
                  {COLUMNS.map((c) => (
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
                    className="cursor-pointer hover:bg-white/[0.035] transition-colors duration-150"
                  >
                    <td className={td}>{c.campaignName}</td>
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
          period={period}
          onClose={() => setDetailCampaign(null)}
        />
      )}
    </div>
  );
}

function periodSearchParams(period: Period): URLSearchParams {
  const params = new URLSearchParams();
  if (period.kind === "preset") {
    params.set("date_preset", period.preset);
  } else {
    params.set("since", period.range.since);
    params.set("until", period.range.until);
  }
  return params;
}

type AdSetsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; adSets: AdSetInsight[] };

function CampaignAdSets({ campaign, period }: { campaign: CampaignInsight; period: Period }) {
  const [state, setState] = useState<AdSetsState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;

    const params = periodSearchParams(period);
    params.set("accountId", campaign.accountId);

    fetch(`/api/meta-ads/campaigns/${campaign.campaignId}/adsets?${params.toString()}`)
      .then(async (res) => {
        if (!res.ok) {
          const body = (await res.json().catch(() => null)) as { error?: string } | null;
          throw new Error(body?.error ?? "Não foi possível carregar os conjuntos de anúncios.");
        }
        return res.json() as Promise<{ adSets: AdSetInsight[] }>;
      })
      .then((body) => {
        if (!cancelled) setState({ status: "ready", adSets: body.adSets });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: "error", message: err.message });
      });

    return () => {
      cancelled = true;
    };
  }, [campaign.campaignId, campaign.accountId, period]);

  return (
    <div className="mt-6">
      <h5 className="text-[11px] tracking-[0.1em] uppercase text-intel-text-dim mb-3">Conjuntos de anúncios</h5>

      {state.status === "loading" && (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-9 rounded-lg bg-intel-shimmer bg-white/[0.04]" />
          ))}
        </div>
      )}

      {state.status === "error" && <p className="text-[12px] text-intel-red">{state.message}</p>}

      {state.status === "ready" && state.adSets.length === 0 && (
        <p className="text-[12px] text-intel-text-dim">Nenhum conjunto de anúncios encontrado neste período.</p>
      )}

      {state.status === "ready" && state.adSets.length > 0 && (
        <ul className="space-y-2">
          {state.adSets.map((a) => (
            <li
              key={a.adSetId}
              className="rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2.5"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="text-[13px] text-intel-text">{a.adSetName}</span>
                <StatusBadge status={a.status} />
              </div>
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-intel-text-dim tabular-nums">
                <span>Investimento: {formatCurrencyBRL(a.spend)}</span>
                <span>Impressões: {formatInteger(a.impressions)}</span>
                <span>Cliques: {formatInteger(a.clicks)}</span>
                <span>Alcance: {formatInteger(a.reach)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function CampaignDetailPanel({
  campaign,
  comparison,
  period,
  onClose,
}: {
  campaign: CampaignInsight;
  comparison: CampaignInsight | null;
  period: Period;
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
        <p className="text-[12px] text-intel-text-dim mb-6">
          {campaign.accountName} · {objectiveLabel(campaign.objective)} · <StatusBadge status={campaign.status} />
        </p>

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
          inline_link_clicks (apenas cliques que levam ao destino do anúncio).
        </p>

        <CampaignAdSets
          key={`${campaign.accountId}-${campaign.campaignId}-${
            period.kind === "preset" ? period.preset : `${period.range.since}_${period.range.until}`
          }`}
          campaign={campaign}
          period={period}
        />
      </div>
    </div>
  );
}
