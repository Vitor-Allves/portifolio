"use client";

import { useEffect, useState } from "react";
import {
  CRM_GOAL_METRICS,
  formatBRL,
  monthLabel,
  monthTitle,
  type CrmGoalMetric,
  type CrmGoalRow,
  type CrmGoalsMonth,
  type CrmProductivity,
  type CrmProductivityNumbers,
} from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { PRESETS, dateTime, minutesLabel, presetRange, relativeTime, shortDate, spDate, type Preset } from "./crm-format";
import { shiftMonth } from "./CrmFollowUpView";

const brl = (cents: number) => formatBRL(cents, { compact: true }) || "R$ 0";
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);
const metricValue = (metric: CrmGoalMetric, v: number) => (metric === "wonValue" ? brl(v) : String(v));

type Tone = "green" | "amber" | "red" | "dim";
const TONE_TEXT: Record<Tone, string> = { green: "text-crm-green", amber: "text-crm-amber", red: "text-crm-red", dim: "text-crm-faint" };
const TONE_FILL: Record<Tone, string> = { green: "bg-crm-green", amber: "bg-crm-amber", red: "bg-crm-red", dim: "bg-crm-faint" };

/** Where a goal stands against the month's pace (elapsed share of the month). */
export function goalStatus(actual: number, target: number, elapsed: number): { label: string; tone: Tone } {
  if (actual >= target) return { label: "Meta batida", tone: "green" };
  if (elapsed >= 1) return { label: "Não batida", tone: "red" };
  if (elapsed <= 0) return { label: "Mês não começou", tone: "dim" };
  return actual / target >= elapsed ? { label: "No ritmo", tone: "green" } : { label: "Abaixo do ritmo", tone: "amber" };
}

/** One indicator's progress: "4 de 10", the bar (with the expected pace) and where it stands. */
export function GoalBar({ metric, actual, target, elapsed, owner }: { metric: CrmGoalMetric; actual: number; target: number; elapsed: number; owner: string }) {
  const def = CRM_GOAL_METRICS.find((m) => m.id === metric)!;
  const share = target > 0 ? actual / target : 0;
  const st = goalStatus(actual, target, elapsed);
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[12.5px]">
        <span className="text-crm-dim truncate">{def.short}</span>
        <span className="tabular-nums whitespace-nowrap">
          <strong className="text-crm-text">{metricValue(metric, actual)}</strong>
          <span className="text-crm-dim"> de {metricValue(metric, target)}</span>
          <span className="text-crm-faint"> · {Math.round(share * 100)}%</span>
        </span>
      </div>
      <div
        className="relative mt-1 h-2 rounded-full bg-crm-sunken"
        role="progressbar"
        aria-label={`${def.label} — ${owner}`}
        aria-valuemin={0}
        aria-valuemax={target}
        aria-valuenow={Math.min(actual, target)}
        aria-valuetext={`${metricValue(metric, actual)} de ${metricValue(metric, target)} (${Math.round(share * 100)}%), ${st.label.toLowerCase()}`}
      >
        <div className={`h-full rounded-full ${TONE_FILL[st.tone]}`} style={{ width: `${Math.min(1, share) * 100}%` }} />
        {elapsed > 0 && elapsed < 1 && (
          <span className="absolute -top-0.5 h-3 w-0.5 rounded-full bg-crm-text/60" style={{ left: `calc(${elapsed * 100}% - 1px)` }} title="Ritmo esperado até hoje" aria-hidden="true" />
        )}
      </div>
      <p className={`mt-0.5 text-[11px] font-medium ${TONE_TEXT[st.tone]}`}>{st.label}</p>
    </div>
  );
}

const draftKey = (userId: string | null, metric: CrmGoalMetric) => `${userId ?? "equipe"}:${metric}`;
const targetText = (metric: CrmGoalMetric, v: number | undefined) =>
  v === undefined ? "" : metric === "wonValue" ? (v / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 }) : String(v);
function draftOf(g: CrmGoalsMonth): Record<string, string> {
  const out: Record<string, string> = {};
  for (const r of g.rows) for (const m of CRM_GOAL_METRICS) out[draftKey(r.userId, m.id)] = targetText(m.id, r.targets[m.id]);
  return out;
}

/** A line's card: its goals against what was achieved — or, editing, one field per indicator. */
function GoalCard({
  row,
  elapsed,
  you,
  draft,
  onDraft,
}: {
  row: CrmGoalRow;
  elapsed: number;
  you: boolean;
  draft: Record<string, string> | null;
  onDraft: (key: string, value: string) => void;
}) {
  const title = row.userId === null ? "Equipe" : `${row.name}${you ? " (você)" : ""}`;
  const set = CRM_GOAL_METRICS.filter((m) => row.targets[m.id] !== undefined);
  const hit = set.filter((m) => row.actual[m.id] >= row.targets[m.id]!).length;
  const unset = CRM_GOAL_METRICS.filter((m) => row.targets[m.id] === undefined);
  return (
    <article
      aria-label={row.userId === null ? "Metas da equipe" : `Metas de ${row.name}`}
      className={`rounded-2xl border bg-crm-card shadow-[var(--crm-shadow)] p-4 min-w-0 ${row.userId === null ? "border-crm-accent/40" : "border-crm-line"}`}
    >
      <header className="flex items-baseline justify-between gap-2 mb-3">
        <h3 className="text-[13.5px] font-semibold truncate">{title}</h3>
        {!draft && set.length > 0 && (
          <span className="text-[11.5px] text-crm-dim whitespace-nowrap">
            {hit} de {set.length} {set.length === 1 ? "meta batida" : "metas batidas"}
          </span>
        )}
      </header>
      {draft ? (
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {CRM_GOAL_METRICS.map((m) => {
            const k = draftKey(row.userId, m.id);
            return (
              <label key={m.id} className={`block min-w-0 ${m.money ? "col-span-2" : ""}`}>
                <span className="block text-[11.5px] text-crm-dim mb-0.5">
                  {m.label}
                  {m.money ? " (R$)" : ""}
                </span>
                <input
                  type="text"
                  inputMode={m.money ? "decimal" : "numeric"}
                  value={draft[k] ?? ""}
                  onChange={(e) => onDraft(k, e.target.value)}
                  placeholder="sem meta"
                  aria-label={`Meta de ${m.label.toLowerCase()} — ${row.userId === null ? "equipe" : row.name}`}
                  className={`${CRM_INPUT} !py-1.5 tabular-nums`}
                />
                <span className="block text-[11px] text-crm-faint mt-0.5">realizado: {metricValue(m.id, row.actual[m.id])}</span>
              </label>
            );
          })}
        </div>
      ) : set.length === 0 ? (
        <p className="text-[12px] text-crm-dim">
          Sem metas neste mês.{" "}
          <span className="text-crm-faint">
            Realizado: {row.actual.leads} leads · {row.actual.meetings} reuniões · {row.actual.proposals} propostas · {row.actual.won} ganhos
            {row.actual.wonValue > 0 ? ` (${brl(row.actual.wonValue)})` : ""}
          </span>
        </p>
      ) : (
        <div className="space-y-2.5">
          {set.map((m) => (
            <GoalBar key={m.id} metric={m.id} actual={row.actual[m.id]} target={row.targets[m.id]!} elapsed={elapsed} owner={row.userId === null ? "equipe" : row.name} />
          ))}
          {unset.length > 0 && (
            <p className="text-[11.5px] text-crm-faint">
              Sem meta: {unset.map((m) => `${m.short.toLowerCase()} ${metricValue(m.id, row.actual[m.id])}`).join(" · ")}
            </p>
          )}
        </div>
      )}
    </article>
  );
}

/** Metas do mês: each line's goals and progress; Administrador and Gestor edit them. */
function GoalsSection({ currentUserId, canEdit, canExport, version, now }: { currentUserId: string; canEdit: boolean; canExport: boolean; version: number; now: number }) {
  const thisMonth = spDate(now).slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [result, setResult] = useState<{ key: string; data: CrmGoalsMonth | null; error: string | null } | null>(null);
  const [draft, setDraft] = useState<Record<string, string> | null>(null);
  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState<{ text: string; error: boolean } | null>(null);
  const key = `${month}#${version}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/goals/?month=${key.split("#")[0]}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { goals?: CrmGoalsMonth; error?: string } | null;
        if (cancelled) return;
        setResult({ key, data: body?.goals ?? null, error: res.ok ? null : body?.error ?? "Não foi possível carregar as metas." });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const g = result?.data ?? null;
  const loading = result?.key !== key;
  const changeMonth = (n: number) => {
    setMonth((m) => shiftMonth(m, n));
    setDraft(null);
    setMsg(null);
  };

  async function copyPrevious() {
    if (!draft) return;
    const prev = shiftMonth(month, -1);
    setMsg(null);
    const res = await fetch(`/api/crm/goals/?month=${prev}`).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { goals?: CrmGoalsMonth } | null;
    if (!body?.goals) return setMsg({ text: "Não foi possível buscar as metas do mês anterior.", error: true });
    const from = draftOf(body.goals);
    const keys = Object.keys(draft).filter((k) => from[k]);
    if (keys.length === 0) return setMsg({ text: `${monthTitle(prev)} não tem metas para copiar.`, error: true });
    setDraft({ ...draft, ...Object.fromEntries(keys.map((k) => [k, from[k]])) });
    setMsg({ text: `Metas de ${monthLabel(prev)} copiadas. Revise e salve.`, error: false });
  }

  async function save() {
    if (!g || !draft) return;
    const before = draftOf(g);
    const goals = Object.entries(draft)
      .filter(([k, v]) => v.trim() !== (before[k] ?? ""))
      .map(([k, v]) => {
        const [who, metric] = k.split(":");
        return { userId: who === "equipe" ? null : who, metric, target: v.trim() };
      });
    if (goals.length === 0) {
      setDraft(null);
      return;
    }
    setSaving(true);
    setMsg(null);
    const res = await fetch("/api/crm/goals/", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ month, goals }) }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { goals?: CrmGoalsMonth; error?: string } | null;
    setSaving(false);
    if (!res?.ok || !body?.goals) return setMsg({ text: body?.error ?? "Não foi possível salvar as metas.", error: true });
    setResult({ key, data: body.goals, error: null });
    setDraft(null);
    setMsg({ text: "Metas salvas.", error: false });
  }

  const withGoals = g?.rows.filter((r) => Object.keys(r.targets).length > 0) ?? [];
  const withoutGoals = g?.rows.filter((r) => Object.keys(r.targets).length === 0) ?? [];
  const anyGoal = withGoals.length > 0;
  return (
    <section aria-label="Metas do mês" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold mr-1">Metas do mês</h2>
        <div className="flex items-center gap-1" role="group" aria-label="Mês das metas">
          <button type="button" onClick={() => changeMonth(-1)} aria-label="Mês anterior" className="h-8 w-8 rounded-full border border-crm-line hover:bg-crm-hover">
            ‹
          </button>
          <span className="min-w-[10.5rem] text-center text-[13.5px] font-semibold" aria-live="polite">
            {monthTitle(month)}
          </span>
          <button
            type="button"
            onClick={() => changeMonth(1)}
            disabled={month >= shiftMonth(thisMonth, 3)}
            aria-label="Próximo mês"
            className="h-8 w-8 rounded-full border border-crm-line hover:bg-crm-hover disabled:opacity-40"
          >
            ›
          </button>
        </div>
        {g && g.elapsed > 0 && g.elapsed < 1 && (
          <span className="text-[12px] px-3 py-1 rounded-full border border-crm-line text-crm-dim">{Math.round(g.elapsed * 100)}% do mês decorrido</span>
        )}
        <div className="ml-auto flex items-center gap-3">
          {canExport && !draft && (
            <a href={`/api/crm/goals/export/?month=${month}`} download className={CRM_LINK_BTN}>
              Exportar CSV
            </a>
          )}
          {canEdit && g && !draft && (
            <button
              type="button"
              onClick={() => {
                setDraft(draftOf(g));
                setMsg(null);
              }}
              className={CRM_BTN_OUTLINE}
            >
              Editar metas
            </button>
          )}
        </div>
      </div>

      {draft && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-crm-line bg-crm-sunken px-3 py-2 text-[12px] text-crm-dim">
          <span className="mr-auto">Deixe em branco (ou 0) para não ter meta. O realizado é contado como no Painel.</span>
          <button type="button" onClick={copyPrevious} className={CRM_BTN_OUTLINE}>
            Copiar de {monthLabel(shiftMonth(month, -1)).split(" de ")[0]}
          </button>
          <button
            type="button"
            onClick={() => {
              setDraft(null);
              setMsg(null);
            }}
            className={CRM_BTN_OUTLINE}
          >
            Cancelar
          </button>
          <button type="button" onClick={save} disabled={saving} className={CRM_BTN_PRIMARY}>
            {saving ? "Salvando..." : "Salvar metas"}
          </button>
        </div>
      )}
      {msg && (
        <p className={msg.error ? CRM_ALERT : "text-[12px] text-crm-green font-medium"} role={msg.error ? "alert" : "status"}>
          {msg.text}
        </p>
      )}
      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}
      {!result && <p className="text-[12.5px] text-crm-dim">Carregando as metas...</p>}

      {g && (
        <div className={`space-y-2 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {!anyGoal && !draft && (
            <p className="text-[12.5px] text-crm-dim">
              Nenhuma meta definida para {monthLabel(month)}.{canEdit ? " Use Editar metas para definir as da equipe e as de cada pessoa." : ""}
            </p>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 items-start">
            {(draft ? g.rows : withGoals).map((r) => (
              <GoalCard
                key={r.userId ?? "equipe"}
                row={r}
                elapsed={g.elapsed}
                you={r.userId === currentUserId}
                draft={draft}
                onDraft={(k, v) => setDraft((d) => (d ? { ...d, [k]: v } : d))}
              />
            ))}
          </div>
          {!draft && anyGoal && withoutGoals.length > 0 && (
            <p className="text-[12px] text-crm-dim">
              Sem metas em {monthLabel(month)}:{" "}
              {withoutGoals.map((r, i) => (
                <span key={r.userId ?? "equipe"}>
                  {i > 0 && ", "}
                  <span className="text-crm-text">{r.userId === null ? "Equipe" : r.name}</span>
                  <span className="text-crm-faint">
                    {" "}
                    ({r.actual.leads} leads · {r.actual.won} ganhos)
                  </span>
                </span>
              ))}
            </p>
          )}
          {g.updatedAt && !draft && (
            <p className="text-[11.5px] text-crm-faint">
              Metas alteradas por {g.updatedByName ?? "—"} em {dateTime(g.updatedAt)}. O realizado conta leads cadastrados, reuniões e propostas que entraram na etapa, negócios
              ganhos e o valor negociado neles no mês — os mesmos números do Painel.
            </p>
          )}
        </div>
      )}
    </section>
  );
}

const PROD_COLUMNS: { key: keyof CrmProductivityNumbers; label: string; title?: string }[] = [
  { key: "leads", label: "Leads", title: "Leads cadastrados no período" },
  { key: "worked", label: "Trabalhados", title: "Leads com mensagem, tarefa concluída ou registro da equipe no período" },
  { key: "assigned", label: "Atribuídos", title: "Leads de que a pessoa é responsável agora" },
  { key: "meetings", label: "Reuniões" },
  { key: "followUps", label: "Follow-ups", title: "Tarefas de follow-up e retorno comercial concluídas" },
  { key: "proposals", label: "Propostas", title: "Oportunidades que chegaram a Proposta enviada" },
  { key: "proposalsApproved", label: "Aprovadas", title: "Propostas aprovadas no período" },
  { key: "wonCount", label: "Ganhos" },
  { key: "lostCount", label: "Perdidos" },
  { key: "wonValueCents", label: "Valor vendido" },
  { key: "avgTicketCents", label: "Ticket médio", title: "Valor vendido ÷ ganhos" },
  { key: "conversion", label: "Conversão", title: "Ganhos ÷ (ganhos + perdidos) no período" },
  { key: "tasksDone", label: "Tarefas feitas" },
  { key: "tasksOverdue", label: "Atrasadas", title: "Tarefas e follow-ups atrasados agora" },
  { key: "conversations", label: "Conversas", title: "Contatos atendidos no WhatsApp (campanhas não contam)" },
  { key: "avgResponseMinutes", label: "Tempo de resposta", title: "Média do tempo até responder quem estava esperando" },
];

function cell(x: CrmProductivityNumbers, key: keyof CrmProductivityNumbers): string {
  const v = x[key];
  if (key === "wonValueCents") return brl(v as number);
  if (key === "avgTicketCents") return v === null ? "—" : brl(v as number);
  if (key === "conversion") return pct(v as number | null);
  if (key === "avgResponseMinutes") return v === null ? "—" : `${minutesLabel(v as number)}${x.answered ? ` (${x.answered})` : ""}`;
  return String(v);
}

/** Produtividade por pessoa no período, with the team's totals. */
function ProductivitySection({ currentUserId, seeAll, canExport, version, now }: { currentUserId: string; seeAll: boolean; canExport: boolean; version: number; now: number }) {
  const today = spDate(now);
  const [preset, setPreset] = useState<Preset>("mes");
  const [custom, setCustom] = useState<[string, string]>(() => presetRange("mes", today));
  const [from, to] = preset === "custom" ? custom : presetRange(preset, today);
  const q = new URLSearchParams({ from, to }).toString();
  const key = `${q}#${version}`;
  const [result, setResult] = useState<{ key: string; data: CrmProductivity | null; error: string | null } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/productivity/?${key.split("#")[0]}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { productivity?: CrmProductivity; error?: string } | null;
        if (cancelled) return;
        setResult({ key, data: body?.productivity ?? null, error: res.ok ? null : body?.error ?? "Não foi possível carregar a produtividade." });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const d = result?.data ?? null;
  return (
    <section aria-label="Produtividade" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <h2 className="text-[15px] font-semibold mr-1">{seeAll ? "Produtividade por pessoa" : "Sua produtividade"}</h2>
        <select value={preset} onChange={(e) => setPreset(e.target.value as Preset)} aria-label="Período da produtividade" className={CRM_FILTER}>
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
        <span className="text-[12px] text-crm-faint" aria-live="polite">
          {shortDate(from)} a {shortDate(to)}
        </span>
        {canExport && (
          <a href={`/api/crm/productivity/export/?${q}`} download className={`${CRM_LINK_BTN} ml-auto`}>
            Exportar CSV
          </a>
        )}
      </div>
      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}
      {!result && <p className="text-[12.5px] text-crm-dim">Carregando a produtividade...</p>}
      {d && (
        <div className={`rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden transition-opacity ${result?.key !== key ? "opacity-60" : ""}`}>
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]" aria-label="Produtividade no período">
              <thead className="border-b border-crm-line">
                <tr>
                  <th className={`${CRM_TH} sticky left-0 bg-crm-card align-bottom`}>Pessoa</th>
                  {PROD_COLUMNS.map((c) => (
                    <th key={c.key} className={`${CRM_TH} !whitespace-normal text-right align-bottom leading-tight !px-2`} title={c.title}>
                      {c.label}
                    </th>
                  ))}
                  <th className={`${CRM_TH} !whitespace-normal align-bottom leading-tight !pl-5 !pr-3`}>Última atividade</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-crm-line">
                {d.rows.map((r) => (
                  <tr key={r.userId ?? "none"}>
                    <th scope="row" className={`${CRM_TD} sticky left-0 bg-crm-card text-left font-semibold whitespace-nowrap ${r.userId === null ? "text-crm-dim font-normal" : ""}`}>
                      {r.name}
                      {r.userId === currentUserId ? <span className="text-crm-faint font-normal"> (você)</span> : null}
                    </th>
                    {PROD_COLUMNS.map((c) => (
                      <td
                        key={c.key}
                        className={`${CRM_TD} !px-2 text-right tabular-nums whitespace-nowrap ${c.key === "tasksOverdue" && r.tasksOverdue > 0 ? "text-crm-red font-semibold" : ""}`}
                      >
                        {r.userId === null && ["conversations", "avgResponseMinutes"].includes(c.key) ? "—" : cell(r, c.key)}
                      </td>
                    ))}
                    <td className={`${CRM_TD} !pl-5 !pr-3 text-crm-dim whitespace-nowrap`}>{r.lastActivityAt ? relativeTime(r.lastActivityAt, now) : "—"}</td>
                  </tr>
                ))}
              </tbody>
              {d.team && (
                <tfoot className="border-t border-crm-line-strong">
                  <tr>
                    <th scope="row" className={`${CRM_TD} sticky left-0 bg-crm-card text-left font-semibold`}>
                      Equipe
                    </th>
                    {PROD_COLUMNS.map((c) => (
                      <td key={c.key} className={`${CRM_TD} !px-2 text-right tabular-nums font-semibold whitespace-nowrap`}>
                        {cell(d.team!, c.key)}
                      </td>
                    ))}
                    <td className={CRM_TD} />
                  </tr>
                </tfoot>
              )}
            </table>
          </div>
        </div>
      )}
      <p className="text-[11.5px] text-crm-faint">
        Leads, oportunidades e tarefas contam para o responsável; conversas e tempo de resposta, para quem respondeu (campanhas não contam). Tempo de resposta: do primeiro
        contato esperando até a primeira resposta, em horas corridas; entre parênteses, quantas respostas. Contatos arquivados ficam de fora, como no Painel.
      </p>
    </section>
  );
}

/**
 * Metas e produtividade (Gestão): the month's goals per person and for the
 * team with their progress, and each person's productivity in a period.
 * A Comercial sees only their own; Administrador and Gestor set the goals.
 */
export default function CrmGoalsView({
  currentUserId,
  seeAll,
  canEdit,
  canExport,
  version,
  now,
}: {
  currentUserId: string;
  seeAll: boolean;
  canEdit: boolean;
  canExport: boolean;
  version: number;
  now: number;
}) {
  return (
    <section aria-label="Metas e produtividade" className="space-y-6">
      <GoalsSection currentUserId={currentUserId} canEdit={canEdit} canExport={canExport} version={version} now={now} />
      <ProductivitySection currentUserId={currentUserId} seeAll={seeAll} canExport={canExport} version={version} now={now} />
    </section>
  );
}

/**
 * The Painel's goals card: this month's goals of whoever the Painel shows
 * (the team, the picked person, or a Comercial's own), with a way in.
 */
export function GoalsSummary({
  owner,
  currentUserId,
  seeAll,
  version,
  now,
  onOpen,
}: {
  owner: string;
  currentUserId: string;
  seeAll: boolean;
  version: number;
  now: number;
  onOpen?: () => void;
}) {
  const month = spDate(now).slice(0, 7);
  const [g, setG] = useState<CrmGoalsMonth | null>(null);
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/goals/?month=${month}`)
      .then((res) => (res.ok ? res.json() : null))
      .then((body: { goals?: CrmGoalsMonth } | null) => !cancelled && setG(body?.goals ?? null))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [month, version]);
  if (!g) return null;
  const who = !seeAll ? currentUserId : owner === "all" ? null : owner;
  const row = g.rows.find((r) => r.userId === who);
  if (!row) return null;
  const set = CRM_GOAL_METRICS.filter((m) => row.targets[m.id] !== undefined);
  if (set.length === 0) return null;
  const title = `Metas de ${monthLabel(month).split(" de ")[0]}${row.userId === null ? " · equipe" : row.userId === currentUserId ? "" : ` · ${row.name}`}`;
  return (
    <section aria-label={title} className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4 sm:p-5 min-w-0">
      <div className="flex items-baseline justify-between gap-2 mb-3">
        <h2 className="text-[13.5px] font-semibold text-crm-text">{title}</h2>
        {onOpen && (
          <button type="button" onClick={onOpen} className={CRM_LINK_BTN}>
            Ver metas e produtividade
          </button>
        )}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-x-5 gap-y-3">
        {set.map((m) => (
          <GoalBar key={m.id} metric={m.id} actual={row.actual[m.id]} target={row.targets[m.id]!} elapsed={g.elapsed} owner={row.userId === null ? "equipe" : row.name} />
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-crm-faint">Metas do mês corrente, qualquer que seja o período escolhido acima. A marca na barra é o ritmo esperado até hoje.</p>
    </section>
  );
}
