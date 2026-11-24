"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatBRL,
  stageLabel,
  type CrmDashboard,
  type CrmDashboardMetrics,
  type CrmDashboardRecord,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_FILTER, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { PRESETS, dateTime, presetRange, relativeTime, shortDate, spDate, type Preset } from "./crm-format";
import { Mascot } from "./crm-brand";
import { GoalsSummary } from "./CrmGoalsView";
import CrmAnalysisDialog from "./CrmAnalysisDialog";
import { useCatalog } from "./crm-catalog-context";

const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const brl = (c: number | null) => (c === null ? "—" : formatBRL(c, { compact: true }) || "R$ 0");

/** One headline number with its change against the previous period. */
function Tile({
  label,
  value,
  note,
  now,
  before,
  goodWhenUp = true,
  onOpen,
}: {
  label: string;
  value: string;
  note?: string | null;
  now?: number | null;
  before?: number | null;
  goodWhenUp?: boolean;
  /** Opens the records behind the number. */
  onOpen?: () => void;
}) {
  let delta: React.ReactNode = null;
  if (now !== undefined && before !== undefined && now !== null && before !== null) {
    if (now === before) delta = <span className="text-crm-faint">= igual</span>;
    else {
      const up = now > before;
      const good = up === goodWhenUp;
      delta = (
        <span className={good ? "text-crm-green" : "text-crm-red"}>
          <span aria-hidden="true">{up ? "↑" : "↓"}</span> {up ? "subiu" : "caiu"}
        </span>
      );
    }
  }
  const body = (
    <>
      <span className={`${CRM_LABEL} leading-snug block`}>{label}</span>
      <span className="mt-1 block text-[24px] leading-none font-semibold tabular-nums text-crm-text">{value}</span>
      <span className="mt-1.5 h-4 flex items-center gap-2 text-[11px] font-medium truncate">
        {delta}
        {note && <span className="text-crm-dim truncate">{note}</span>}
      </span>
    </>
  );
  const box = "rounded-xl border border-crm-line bg-crm-card px-3.5 py-3 shadow-[var(--crm-shadow)] min-w-0 text-left";
  return onOpen ? (
    <button type="button" onClick={onOpen} aria-label={`${label}: ${value}. Ver os registros`} className={`${box} hover:border-crm-accent/50 transition-colors`}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

/** Indicators that open a list of records, with the list's title. */
const METRIC_TITLE: Record<string, string> = {
  leads: "Leads cadastrados no período",
  deals: "Oportunidades abertas no período",
  meetings: "Reuniões agendadas no período",
  proposals: "Propostas enviadas no período",
  won: "Negócios ganhos no período",
  lost: "Negócios perdidos no período",
  tasksDone: "Tarefas concluídas no período",
  open: "Oportunidades abertas agora",
  stalled: "Oportunidades paradas",
  overdue: "Tarefas e follow-ups atrasados",
  today: "Tarefas para hoje",
  recurring: "Clientes com contrato mensal vigente",
  campaigns: "Campanhas iniciadas no período",
};

/** The records behind a number, each one opening its contact / client / task; CSV when allowed. */
function RecordsDialog({
  metric,
  query,
  canExport,
  onClose,
  onOpen,
}: {
  metric: string;
  query: URLSearchParams;
  canExport: boolean;
  onClose: () => void;
  onOpen: (r: CrmDashboardRecord) => void;
}) {
  const [data, setData] = useState<{ total: number; rows: CrmDashboardRecord[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const qs = new URLSearchParams(query);
  qs.set("metric", metric);
  const url = qs.toString();
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/dashboard/records/?${url}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { total?: number; rows?: CrmDashboardRecord[]; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !body?.rows) setError(body?.error ?? "Não foi possível carregar a lista.");
        else setData({ total: body.total ?? body.rows.length, rows: body.rows });
      })
      .catch(() => !cancelled && setError("Não foi possível carregar a lista."));
    return () => {
      cancelled = true;
    };
  }, [url]);
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  const exportQs = new URLSearchParams(qs);
  exportQs.set("what", "records");
  const openable = (r: CrmDashboardRecord) => r.kind === "client" || r.kind === "task" || !!r.contactId;

  return (
    <>
      <div className="fixed inset-0 z-40 bg-black/40" onClick={onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={METRIC_TITLE[metric] ?? "Registros"}
        className="fixed z-50 inset-x-3 top-[8vh] bottom-[8vh] sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[680px] rounded-2xl border border-crm-line bg-crm-raised shadow-[var(--crm-shadow-lg)] flex flex-col"
      >
        <header className="px-5 py-3.5 border-b border-crm-line flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="text-[15px] font-semibold">{METRIC_TITLE[metric] ?? "Registros"}</h2>
            <p className="text-[12px] text-crm-dim">
              {data ? `${data.total} ${data.total === 1 ? "registro" : "registros"}${data.total > data.rows.length ? ` (mostrando ${data.rows.length})` : ""}` : "Carregando..."}
            </p>
          </div>
          {canExport && data && data.total > 0 && (
            <a href={`/api/crm/dashboard/export/?${exportQs}`} download className={`${CRM_BTN_OUTLINE} shrink-0`}>
              Exportar CSV
            </a>
          )}
          <button type="button" onClick={onClose} aria-label="Fechar lista" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
            ×
          </button>
        </header>
        <div className="flex-1 overflow-y-auto">
          {error && <p className={`${CRM_ALERT} m-4`}>{error}</p>}
          {data && data.rows.length === 0 && <p className="p-5 text-[12.5px] text-crm-dim">Nenhum registro.</p>}
          <ul className="divide-y divide-crm-line" aria-label="Registros do indicador">
            {data?.rows.map((r) => (
              <li key={`${r.kind}:${r.id}`}>
                <button
                  type="button"
                  disabled={!openable(r)}
                  onClick={() => onOpen(r)}
                  className="w-full text-left px-5 py-2.5 hover:bg-crm-hover disabled:hover:bg-transparent disabled:cursor-default flex items-center gap-3"
                >
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{r.title}</span>
                    <span className="block text-[11.5px] text-crm-dim truncate">
                      {[r.detail, r.stage ? stageLabel(r.stage) : null, r.ownerName ? `com ${r.ownerName}` : null].filter(Boolean).join(" · ") || "—"}
                    </span>
                  </span>
                  <span className="text-right shrink-0">
                    {r.valueCents !== null && <span className="block text-[12.5px] font-semibold tabular-nums">{formatBRL(r.valueCents)}</span>}
                    {r.at && <span className="block text-[11px] text-crm-faint">{dateTime(r.at)}</span>}
                  </span>
                </button>
              </li>
            ))}
          </ul>
          {metric === "campaigns" && data && data.rows.length > 0 && <p className="px-5 py-3 text-[11.5px] text-crm-faint">Os resultados completos ficam em Campanhas.</p>}
          {metric === "recurring" && <p className="px-5 py-3 text-[11.5px] text-crm-faint">Soma mensal dos contratos vigentes. Não é faturamento emitido nem valor recebido.</p>}
        </div>
      </div>
    </>
  );
}

/** Horizontal bars, one series: a label, the bar, the figures. */
function HBars({ rows }: { rows: { key: string; label: string; value: number; figure: string; hint?: string }[] }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2.5">
      {rows.map((r) => (
        <li key={r.key} className="grid grid-cols-[minmax(92px,140px)_1fr_auto] items-center gap-3" title={r.hint ?? `${r.label}: ${r.figure}`}>
          <span className="text-[12.5px] text-crm-text truncate">{r.label}</span>
          <span className="h-3.5 rounded-r-[4px] bg-crm-sunken overflow-hidden">
            <span className="block h-full rounded-r-[4px] bg-crm-chart-1" style={{ width: `${(r.value / max) * 100}%` }} />
          </span>
          <span className="text-[12px] tabular-nums text-crm-dim text-right whitespace-nowrap">{r.figure}</span>
        </li>
      ))}
    </ul>
  );
}

/** New leads vs won per week/month — grouped bars, one axis, hover tooltip, table view. */
function SeriesChart({ data }: { data: CrmDashboard }) {
  const [hover, setHover] = useState<number | null>(null);
  const [asTable, setAsTable] = useState(false);
  // Drawn at the box's real width, so axis text keeps its size on a phone.
  const box = useRef<HTMLDivElement | null>(null);
  const [W, setW] = useState(640);
  useEffect(() => {
    const el = box.current;
    if (!el) return;
    const ro = new ResizeObserver((entries) => setW(Math.max(260, Math.round(entries[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, [asTable]);
  const s = data.series;
  // The hovered week/month — gone when the period changes under the mouse (fewer buckets).
  const point = hover !== null ? s[hover] : undefined;
  const max = Math.max(1, ...s.map((p) => Math.max(p.newLeads, p.won)));
  const ticks = max <= 4 ? Array.from({ length: max + 1 }, (_, i) => i) : [0, Math.round(max / 2), max];
  const H = 200;
  const pad = { l: 28, r: 8, t: 10, b: 24 };
  const iw = W - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const step = iw / Math.max(1, s.length);
  const bw = Math.max(4, Math.min(18, step / 2 - 4));
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const unit = data.bucket === "month" ? "Mês" : "Semana de";

  return (
    <div>
      <div className="flex flex-wrap items-center gap-4 mb-2 text-[12px] text-crm-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-crm-chart-1" aria-hidden="true" /> Novos leads
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm bg-crm-chart-2" aria-hidden="true" /> Ganhos
        </span>
        <button type="button" onClick={() => setAsTable((v) => !v)} className="ml-auto text-[12px] font-semibold text-crm-accent hover:opacity-80">
          {asTable ? "Ver gráfico" : "Ver como tabela"}
        </button>
      </div>
      {asTable ? (
        <table className="w-full text-[12.5px]">
          <thead>
            <tr>
              <th className={CRM_TH}>{unit}</th>
              <th className={`${CRM_TH} text-right`}>Novos leads</th>
              <th className={`${CRM_TH} text-right`}>Ganhos</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-line">
            {s.map((p) => (
              <tr key={p.start}>
                <td className={CRM_TD}>{p.label}</td>
                <td className={`${CRM_TD} text-right tabular-nums`}>{p.newLeads}</td>
                <td className={`${CRM_TD} text-right tabular-nums`}>{p.won}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : (
        <div className="relative" ref={box}>
          <svg viewBox={`0 0 ${W} ${H}`} className="w-full h-auto" role="img" aria-label={`Novos leads e ganhos por ${data.bucket === "month" ? "mês" : "semana"}`}>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={pad.l} x2={W - pad.r} y1={y(t)} y2={y(t)} className="stroke-crm-line" strokeWidth={1} />
                <text x={pad.l - 6} y={y(t) + 4} textAnchor="end" className="fill-crm-faint text-[10px]">
                  {t}
                </text>
              </g>
            ))}
            {s.map((p, i) => {
              const cx = pad.l + step * i + step / 2;
              const bar = (v: number, x: number, cls: string) =>
                v > 0 ? <rect x={x} y={y(v)} width={bw} height={pad.t + ih - y(v)} rx={2} className={cls} /> : null;
              return (
                <g key={p.start} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
                  {hover === i && <rect x={cx - step / 2} y={pad.t} width={step} height={ih} className="fill-crm-sunken" />}
                  {bar(p.newLeads, cx - bw - 1, "fill-crm-chart-1")}
                  {bar(p.won, cx + 1, "fill-crm-chart-2")}
                  {i % Math.max(1, Math.ceil((s.length * 44) / (W - pad.l - pad.r))) === 0 && (
                    <text x={cx} y={H - 6} textAnchor="middle" className="fill-crm-faint text-[10px]">
                      {p.label}
                    </text>
                  )}
                  {/* hit target wider than the bars */}
                  <rect x={cx - step / 2} y={pad.t} width={step} height={ih + pad.b} fill="transparent" />
                </g>
              );
            })}
          </svg>
          {hover !== null && point && (
            <div
              className="pointer-events-none absolute top-1 rounded-lg border border-crm-line bg-crm-raised px-3 py-2 text-[12px] shadow-[var(--crm-shadow-lg)] whitespace-nowrap"
              style={{ left: `${Math.min(80, Math.max(0, ((pad.l + step * hover) / W) * 100))}%` }}
            >
              <p className="font-semibold text-crm-text">
                {unit} {point.label}
              </p>
              <p className="text-crm-dim">Novos leads: <span className="text-crm-text tabular-nums">{point.newLeads}</span></p>
              <p className="text-crm-dim">Ganhos: <span className="text-crm-text tabular-nums">{point.won}</span></p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Card({ title, children, className = "" }: { title: string; children: React.ReactNode; className?: string }) {
  return (
    <section aria-label={title} className={`rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4 sm:p-5 min-w-0 ${className}`}>
      <h2 className="text-[13.5px] font-semibold text-crm-text mb-3">{title}</h2>
      {children}
    </section>
  );
}

/**
 * The Painel (CRM home): the period's numbers against the period before,
 * where the funnel stands now, and each person's results. A Comercial only
 * ever gets their own numbers (the server enforces it).
 */
export default function CrmDashboardView({
  team,
  currentUserId,
  seeAll,
  version,
  now,
  canExport = false,
  onOpenGoals,
  onOpenContact,
  onOpenClient,
  onOpenTask,
}: {
  team: CrmTeamMember[];
  currentUserId: string;
  /** false for Comercial: no owner picker, own numbers only. */
  seeAll: boolean;
  version: number;
  now: number;
  /** "Exportar relatórios". */
  canExport?: boolean;
  /** Opens Metas e produtividade. */
  onOpenGoals?: () => void;
  onOpenContact?: (contactId: string) => void;
  onOpenClient?: (clientId: string) => void;
  onOpenTask?: (taskId: string) => void;
}) {
  const { label, options, stages } = useCatalog();
  const [source, setSource] = useState("all");
  const [segment, setSegment] = useState("all");
  const [stage, setStage] = useState("all");
  const [records, setRecords] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState(false);
  const today = spDate(now);
  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("mes", today));
  const [owner, setOwner] = useState(seeAll ? "all" : currentUserId);
  const [result, setResult] = useState<{ key: string; data: CrmDashboard | null; error: string | null } | null>(null);

  const [from, to] = preset === "custom" ? custom : presetRange(preset, today);
  const query = new URLSearchParams({ from, to, owner, source, segment, stage });
  const key = query.toString();
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/dashboard/?${key}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { dashboard?: CrmDashboard; error?: string } | null;
        if (cancelled) return;
        setResult({ key, data: body?.dashboard ?? null, error: res.ok ? null : body?.error ?? "Não foi possível carregar o painel." });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível carregar o painel." }));
    return () => {
      cancelled = true;
    };
  }, [key, version]);

  const d = result?.data ?? null;
  const loading = !result || result.key !== key;
  const empty = useMemo(() => {
    if (!d) return false;
    const c = d.current;
    return c.newLeads + c.newDeals + c.wonCount + c.lostCount + c.tasksDone + d.openNow.count === 0;
  }, [d]);

  const c: CrmDashboardMetrics | undefined = d?.current;
  const p: CrmDashboardMetrics | undefined = d?.previous;
  const vs = d ? `vs ${shortDate(d.previousFrom)}–${shortDate(d.previousTo)}` : "";

  return (
    <section aria-label="Painel" className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Período" className={CRM_FILTER}>
          {PRESETS.map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        {preset === "custom" && (
          <>
            <input type="date" value={custom[0]} max={custom[1]} onChange={(e) => e.target.value && setCustom([e.target.value, custom[1]])} aria-label="Data inicial" className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`} />
            <span className="text-[12px] text-crm-dim">até</span>
            <input type="date" value={custom[1]} min={custom[0]} onChange={(e) => e.target.value && setCustom([custom[0], e.target.value])} aria-label="Data final" className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`} />
          </>
        )}
        {seeAll ? (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável" className={CRM_FILTER}>
            <option value="all">Toda a equipe</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.id === currentUserId ? `${m.name} (você)` : m.name}
              </option>
            ))}
          </select>
        ) : (
          // Evolução v1.0: the team's general numbers or one's own (never another person's).
          <select value={owner === "all" ? "all" : currentUserId} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável" className={CRM_FILTER}>
            <option value={currentUserId}>Seus números</option>
            <option value="all">Toda a equipe</option>
          </select>
        )}
        <select value={source} onChange={(e) => setSource(e.target.value)} aria-label="Origem" className={CRM_FILTER}>
          <option value="all">Todas as origens</option>
          {options("source").map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={segment} onChange={(e) => setSegment(e.target.value)} aria-label="Segmento" className={CRM_FILTER}>
          <option value="all">Todos os segmentos</option>
          {options("segment").map((o) => (
            <option key={o.id} value={o.label}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={stage} onChange={(e) => setStage(e.target.value)} aria-label="Etapa" className={CRM_FILTER} title="A etapa vale para o funil e as oportunidades abertas e paradas">
          <option value="all">Todas as etapas</option>
          {stages().map((st) => (
            <option key={st.id} value={st.id}>
              {st.label}
            </option>
          ))}
        </select>
        <button
          type="button"
          onClick={() => setAnalysis(true)}
          className="ml-auto text-[12px] font-semibold px-3 py-1.5 rounded-full border border-crm-violet/40 text-crm-violet hover:bg-crm-violet/[0.06]"
          title="Resumo executivo do período: dados, cálculos e leitura da IA"
        >
          Resumo executivo
        </button>
        {canExport && (
          <a href={`/api/crm/dashboard/export/?${new URLSearchParams([...query.entries(), ["what", "summary"]])}`} download className={CRM_LINK_BTN}>
            Exportar CSV
          </a>
        )}
        <span className="basis-full text-[12px] text-crm-faint" aria-live="polite">
          {shortDate(from)} a {shortDate(to)}
          {d ? ` · comparado com ${shortDate(d.previousFrom)} a ${shortDate(d.previousTo)}` : ""}
          {stage !== "all" ? " · a etapa vale para o funil e as oportunidades abertas e paradas" : ""}
        </span>
      </div>

      {result?.error && (
        <p className={CRM_ALERT} role="alert">
          {result.error}
        </p>
      )}

      {!d ? (
        !result?.error && <p className="text-[12.5px] text-crm-dim">Carregando o painel...</p>
      ) : (
        <div className={`space-y-4 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {empty && (
            <div className="flex items-end gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 overflow-hidden">
              <div className="pb-5">
                <p className="crm-display text-[17px] mb-1">Ainda sem movimento neste período</p>
                <p className="text-[12.5px] text-crm-dim">Os números aparecem conforme leads entram, oportunidades avançam e tarefas são concluídas.</p>
              </div>
              <Mascot name="titanWelcome" decorative className="h-24 w-auto shrink-0 ml-auto" />
            </div>
          )}


          {c && p && (
            <section aria-label="Indicadores do período" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
              <Tile label="Novos leads" value={String(c.newLeads)} now={c.newLeads} before={p.newLeads} note={vs} onOpen={() => setRecords("leads")} />
              <Tile label="Novas oportunidades" value={String(c.newDeals)} now={c.newDeals} before={p.newDeals} onOpen={() => setRecords("deals")} />
              <Tile label="Reuniões agendadas" value={String(c.meetings)} now={c.meetings} before={p.meetings} note="tarefas do tipo Reunião" onOpen={() => setRecords("meetings")} />
              <Tile label="Propostas enviadas" value={String(c.proposals)} now={c.proposals} before={p.proposals} onOpen={() => setRecords("proposals")} />
              <Tile
                label="Ganhos"
                value={String(c.wonCount)}
                now={c.wonCount}
                before={p.wonCount}
                note={c.wonValueCents > 0 ? `${brl(c.wonValueCents)} vendidos` : null}
                onOpen={() => setRecords("won")}
              />
              <Tile
                label="Perdidos"
                value={String(c.lostCount)}
                now={c.lostCount}
                before={p.lostCount}
                goodWhenUp={false}
                note={c.lostValueCents > 0 ? brl(c.lostValueCents) : null}
                onOpen={() => setRecords("lost")}
              />
              <Tile label="Conversão" value={pct(c.conversion)} now={c.conversion} before={p.conversion} note="ganhos ÷ fechados" />
              <Tile label="Ticket médio" value={brl(c.avgTicketCents)} now={c.avgTicketCents} before={p.avgTicketCents} />
              <Tile label="Tempo para fechar" value={c.avgCycleDays === null ? "—" : `${c.avgCycleDays} d`} now={c.avgCycleDays} before={p.avgCycleDays} goodWhenUp={false} note="média, até ganhar" />
              <Tile label="Tarefas concluídas" value={String(c.tasksDone)} now={c.tasksDone} before={p.tasksDone} onOpen={() => setRecords("tasksDone")} />
            </section>
          )}

          <section aria-label="Agora" className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-5 gap-2">
            <Tile label="Oportunidades abertas" value={String(d.openNow.count)} note={d.openNow.valueCents > 0 ? brl(d.openNow.valueCents) : "agora"} onOpen={() => setRecords("open")} />
            <Tile
              label="Oportunidades paradas"
              value={String(d.stalledNow.count)}
              note={`${d.stalledNow.days}+ dias sem movimento`}
              onOpen={() => setRecords("stalled")}
            />
            <Tile label="Follow-ups e tarefas atrasados" value={String(d.tasksNow.overdue)} note="agora" onOpen={() => setRecords("overdue")} />
            <Tile label="Tarefas para hoje" value={String(d.tasksNow.today)} note="agora" onOpen={() => setRecords("today")} />
            {d.recurring && (
              <Tile
                label="Receita recorrente contratada"
                value={d.recurring.monthlyCents === null ? `${d.recurring.clients}` : brl(d.recurring.monthlyCents)}
                note={`${d.recurring.clients} ${d.recurring.clients === 1 ? "cliente" : "clientes"} · contratos vigentes/mês`}
                onOpen={() => setRecords("recurring")}
              />
            )}
          </section>
          <p className="text-[11.5px] text-crm-faint -mt-2">
            Valor vendido = valor negociado nas oportunidades ganhas. Receita recorrente = soma mensal dos contratos vigentes. Faturamento emitido e valor recebido não
            são controlados pelo CRM.
          </p>

          <GoalsSummary owner={owner} currentUserId={currentUserId} seeAll={seeAll} version={version} now={now} onOpen={onOpenGoals} />

          {d.campaigns && (
            <Card title="Desempenho das campanhas">
              {d.campaigns.count === 0 ? (
                <p className="text-[12.5px] text-crm-dim">Nenhuma campanha iniciada no período.</p>
              ) : (
                <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-2">
                  <Tile label="Campanhas" value={String(d.campaigns.count)} note="iniciadas no período" onOpen={() => setRecords("campaigns")} />
                  <Tile label="Enviadas" value={String(d.campaigns.sent)} />
                  <Tile label="Entregues" value={String(d.campaigns.delivered)} />
                  <Tile label="Lidas" value={String(d.campaigns.read)} />
                  <Tile label="Responderam" value={String(d.campaigns.replied)} />
                  <Tile label="Interessados" value={String(d.campaigns.interested)} />
                  <Tile label="Oportunidades" value={String(d.campaigns.newDeals)} note="em até 30 dias" />
                </div>
              )}
              <p className="mt-2 text-[11.5px] text-crm-faint">Campanhas não se dividem por pessoa, origem ou segmento.</p>
            </Card>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
            <Card title="Funil agora">
              <HBars
                rows={d.funnel.map((f) => ({
                  key: f.stage,
                  label: f.stage === "ganho" || f.stage === "perdido" ? `${stageLabel(f.stage)} (período)` : stageLabel(f.stage),
                  value: f.count,
                  figure: `${f.count}${f.valueCents > 0 ? ` · ${brl(f.valueCents)}` : ""}`,
                }))}
              />
            </Card>
            <Card title={d.bucket === "month" ? "Mês a mês" : "Semana a semana"}>
              <SeriesChart data={d} />
            </Card>
            <Card title="Por que perdemos">
              {d.lossReasons.length === 0 ? (
                <p className="text-[12.5px] text-crm-dim">Nenhuma oportunidade perdida no período.</p>
              ) : (
                <HBars
                  rows={d.lossReasons.map((r) => ({
                    key: r.reason,
                    label: r.reason === "sem_motivo" ? "Sem motivo informado" : label("lost_reason", r.reason),
                    value: r.count,
                    figure: `${r.count}${r.valueCents > 0 ? ` · ${brl(r.valueCents)}` : ""}`,
                  }))}
                />
              )}
            </Card>
            <Card title="De onde vêm os leads">
              {d.sources.length === 0 ? (
                <p className="text-[12.5px] text-crm-dim">Nenhum lead novo no período.</p>
              ) : (
                <HBars
                  rows={d.sources.map((s) => ({
                    key: s.source,
                    label: label("source", s.source),
                    value: s.newLeads,
                    figure: `${s.newLeads} lead${s.newLeads === 1 ? "" : "s"} · ${s.won} ganho${s.won === 1 ? "" : "s"}${s.wonValueCents > 0 ? ` (${brl(s.wonValueCents)})` : ""}`,
                  }))}
                />
              )}
            </Card>
          </div>

          <Card title={seeAll ? "Por pessoa da equipe" : "Seus resultados"}>
            <div className="overflow-x-auto -mx-4 sm:-mx-5">
              <table className="w-full text-[13px]">
                <thead className="border-b border-crm-line">
                  <tr>
                    <th className={CRM_TH}>Pessoa</th>
                    <th className={`${CRM_TH} text-right`}>Em aberto</th>
                    <th className={`${CRM_TH} text-right`}>Ganhos</th>
                    <th className={`${CRM_TH} text-right`}>Perdidos</th>
                    <th className={`${CRM_TH} text-right`}>Conversão</th>
                    <th className={`${CRM_TH} text-right`}>Tarefas feitas</th>
                    <th className={`${CRM_TH} text-right`}>Atrasadas</th>
                    <th className={CRM_TH}>Última atividade</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-crm-line">
                  {d.team.map((r) => (
                    <tr key={r.ownerId ?? "none"}>
                      <td className={`${CRM_TD} font-semibold whitespace-nowrap`}>{r.name}</td>
                      <td className={`${CRM_TD} text-right tabular-nums whitespace-nowrap`}>
                        {r.openCount}
                        {r.openValueCents > 0 && <span className="text-crm-dim"> · {brl(r.openValueCents)}</span>}
                      </td>
                      <td className={`${CRM_TD} text-right tabular-nums whitespace-nowrap`}>
                        {r.wonCount}
                        {r.wonValueCents > 0 && <span className="text-crm-dim"> · {brl(r.wonValueCents)}</span>}
                      </td>
                      <td className={`${CRM_TD} text-right tabular-nums`}>{r.lostCount}</td>
                      <td className={`${CRM_TD} text-right tabular-nums`}>{pct(r.conversion)}</td>
                      <td className={`${CRM_TD} text-right tabular-nums`}>{r.tasksDone}</td>
                      <td className={`${CRM_TD} text-right tabular-nums ${r.tasksOverdue > 0 ? "text-crm-red font-semibold" : ""}`}>{r.tasksOverdue}</td>
                      <td className={`${CRM_TD} text-crm-dim whitespace-nowrap`}>{r.lastActivityAt ? relativeTime(r.lastActivityAt, now) : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {analysis && <CrmAnalysisDialog request={{ kind: "dashboard", from, to, owner, source, segment, stage }} onClose={() => setAnalysis(false)} />}
      {records && (
        <RecordsDialog
          key={`${records}|${key}`}
          metric={records}
          query={query}
          canExport={canExport}
          onClose={() => setRecords(null)}
          onOpen={(r) => {
            if (r.kind === "client") onOpenClient?.(r.id);
            else if (r.kind === "task") onOpenTask?.(r.id);
            else if (r.contactId) onOpenContact?.(r.contactId);
            else return;
            setRecords(null);
          }}
        />
      )}
    </section>
  );
}
