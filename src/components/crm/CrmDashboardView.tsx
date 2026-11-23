"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  formatBRL,
  stageLabel,
  type CrmDashboard,
  type CrmDashboardMetrics,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_ALERT, CRM_FILTER, CRM_INPUT, CRM_LABEL, CRM_TD, CRM_TH } from "./crm-styles";
import { addDays, relativeTime, shortDate, spDate } from "./crm-format";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";

type Preset = "mes" | "mes_passado" | "7d" | "30d" | "90d" | "ano" | "custom";
const PRESETS: { id: Preset; label: string }[] = [
  { id: "mes", label: "Este mês" },
  { id: "mes_passado", label: "Mês passado" },
  { id: "7d", label: "Últimos 7 dias" },
  { id: "30d", label: "Últimos 30 dias" },
  { id: "90d", label: "Últimos 90 dias" },
  { id: "ano", label: "Este ano" },
  { id: "custom", label: "Outro período" },
];

/** [from, to] (inclusive Brasília days) for a preset. */
function presetRange(p: Preset, today: string): [string, string] {
  const month = today.slice(0, 7);
  switch (p) {
    case "mes_passado": {
      const first = `${month}-01`;
      const last = addDays(first, -1);
      return [`${last.slice(0, 7)}-01`, last];
    }
    case "7d":
      return [addDays(today, -6), today];
    case "30d":
      return [addDays(today, -29), today];
    case "90d":
      return [addDays(today, -89), today];
    case "ano":
      return [`${today.slice(0, 4)}-01-01`, today];
    default:
      return [`${month}-01`, today];
  }
}

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
}: {
  label: string;
  value: string;
  note?: string | null;
  now?: number | null;
  before?: number | null;
  goodWhenUp?: boolean;
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
  return (
    <div className="rounded-xl border border-crm-line bg-crm-card px-3.5 py-3 shadow-[var(--crm-shadow)] min-w-0">
      <p className={`${CRM_LABEL} leading-snug`}>{label}</p>
      <p className="mt-1 text-[24px] leading-none font-semibold tabular-nums text-crm-text">{value}</p>
      <p className="mt-1.5 h-4 flex items-center gap-2 text-[11px] font-medium truncate">
        {delta}
        {note && <span className="text-crm-dim truncate">{note}</span>}
      </p>
    </div>
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
          {hover !== null && (
            <div
              className="pointer-events-none absolute top-1 rounded-lg border border-crm-line bg-crm-raised px-3 py-2 text-[12px] shadow-[var(--crm-shadow-lg)] whitespace-nowrap"
              style={{ left: `${Math.min(80, Math.max(0, ((pad.l + step * hover) / W) * 100))}%` }}
            >
              <p className="font-semibold text-crm-text">
                {unit} {s[hover].label}
              </p>
              <p className="text-crm-dim">Novos leads: <span className="text-crm-text tabular-nums">{s[hover].newLeads}</span></p>
              <p className="text-crm-dim">Ganhos: <span className="text-crm-text tabular-nums">{s[hover].won}</span></p>
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
}: {
  team: CrmTeamMember[];
  currentUserId: string;
  /** false for Comercial: no owner picker, own numbers only. */
  seeAll: boolean;
  version: number;
  now: number;
}) {
  const { label } = useCatalog();
  const today = spDate(now);
  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("mes", today));
  const [owner, setOwner] = useState("all");
  const [result, setResult] = useState<{ key: string; data: CrmDashboard | null; error: string | null } | null>(null);

  const [from, to] = preset === "custom" ? custom : presetRange(preset, today);
  const key = `${from}|${to}|${owner}`;
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ from, to, owner });
    fetch(`/api/crm/dashboard/?${qs}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { dashboard?: CrmDashboard; error?: string } | null;
        if (cancelled) return;
        setResult({ key, data: body?.dashboard ?? null, error: res.ok ? null : body?.error ?? "Não foi possível carregar o painel." });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível carregar o painel." }));
    return () => {
      cancelled = true;
    };
  }, [key, from, to, owner, version]);

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
          <span className="text-[12px] px-3 py-1.5 rounded-full border border-crm-line text-crm-dim">Seus números</span>
        )}
        <span className="text-[12px] text-crm-faint" aria-live="polite">
          {shortDate(from)} a {shortDate(to)}
          {d ? ` · comparado com ${shortDate(d.previousFrom)} a ${shortDate(d.previousTo)}` : ""}
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
              <Tile label="Novos leads" value={String(c.newLeads)} now={c.newLeads} before={p.newLeads} note={vs} />
              <Tile label="Novas oportunidades" value={String(c.newDeals)} now={c.newDeals} before={p.newDeals} />
              <Tile label="Reuniões agendadas" value={String(c.meetings)} now={c.meetings} before={p.meetings} />
              <Tile label="Propostas enviadas" value={String(c.proposals)} now={c.proposals} before={p.proposals} />
              <Tile label="Ganhos" value={String(c.wonCount)} now={c.wonCount} before={p.wonCount} note={c.wonValueCents > 0 ? brl(c.wonValueCents) : null} />
              <Tile label="Perdidos" value={String(c.lostCount)} now={c.lostCount} before={p.lostCount} goodWhenUp={false} note={c.lostValueCents > 0 ? brl(c.lostValueCents) : null} />
              <Tile label="Conversão" value={pct(c.conversion)} now={c.conversion} before={p.conversion} note="ganhos ÷ fechados" />
              <Tile label="Ticket médio" value={brl(c.avgTicketCents)} now={c.avgTicketCents} before={p.avgTicketCents} />
              <Tile label="Tempo para fechar" value={c.avgCycleDays === null ? "—" : `${c.avgCycleDays} d`} now={c.avgCycleDays} before={p.avgCycleDays} goodWhenUp={false} note="média, até ganhar" />
              <Tile label="Tarefas concluídas" value={String(c.tasksDone)} now={c.tasksDone} before={p.tasksDone} />
            </section>
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
    </section>
  );
}
