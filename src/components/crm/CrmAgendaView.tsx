"use client";

// Agenda (especificação v1.0, módulo 8): day, week and month, filtered by
// person and type, each task in its type's color (Personalização → Tipos de
// tarefa). A task opens its form; the related contact or company opens from
// there or straight from the day view.

import { useEffect, useMemo, useState } from "react";
import type { CrmTask, CrmTeamMember } from "@/lib/crm-types";
import type { TagColor } from "@/lib/crm-catalog";
import { CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_LINK_BTN, CRM_SEGMENT_TRACK, crmSegment } from "./crm-styles";
import { TASK_STATE_TONE, addDays, spDate, taskState, timeOfDay, weekStart } from "./crm-format";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { TAG_DOT, useCatalog } from "./crm-catalog-context";
import { PriorityChip, TaskKindChip, type TaskDraft } from "./CrmTaskDialog";

type Mode = "dia" | "semana" | "mes";

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];

/** The colored edge of an agenda item, per type color (literal strings so Tailwind keeps them). */
const ACCENT: Record<TagColor, string> = {
  azul: "border-l-crm-accent",
  verde: "border-l-crm-green",
  amarelo: "border-l-crm-amber",
  vermelho: "border-l-crm-red",
  roxo: "border-l-crm-violet",
  turquesa: "border-l-crm-chart-2",
  cinza: "border-l-crm-line-strong",
};

const ddmm = (day: string) => `${day.slice(8, 10)}/${day.slice(5, 7)}`;
const firstOfMonth = (day: string) => `${day.slice(0, 8)}01`;
function addMonths(day: string, n: number): string {
  const d = new Date(`${firstOfMonth(day)}T12:00:00Z`);
  d.setUTCMonth(d.getUTCMonth() + n);
  return d.toISOString().slice(0, 10);
}
function lastOfMonth(day: string): string {
  return addDays(addMonths(day, 1), -1);
}
function longDay(day: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "UTC", weekday: "long", day: "2-digit", month: "long" }).format(new Date(`${day}T12:00:00Z`));
}

/** The days shown: one, Monday–Sunday, or the whole weeks that cover the month. */
function windowOf(mode: Mode, anchor: string): { start: string; end: string } {
  if (mode === "dia") return { start: anchor, end: anchor };
  if (mode === "semana") return { start: weekStart(anchor), end: addDays(weekStart(anchor), 6) };
  return { start: weekStart(firstOfMonth(anchor)), end: addDays(weekStart(lastOfMonth(anchor)), 6) };
}

function sortTasks(a: CrmTask, b: CrmTask) {
  return Number(!a.allDay) - Number(!b.allDay) || Date.parse(a.dueAt!) - Date.parse(b.dueAt!);
}

export default function CrmAgendaView({
  team,
  version,
  now,
  canCreate,
  onOpenTask,
  onNewTask,
  onOpenContact,
  onOpenCompany,
}: {
  team: CrmTeamMember[];
  version: number;
  now: number;
  canCreate: boolean;
  onOpenTask: (taskId: string) => void;
  onNewTask: (draft: TaskDraft) => void;
  onOpenContact: (contactId: string, dealId?: string | null) => void;
  onOpenCompany: (companyId: string) => void;
}) {
  const { options, label, color } = useCatalog();
  const today = spDate(now);
  const [mode, setMode] = useState<Mode>("semana");
  const [anchor, setAnchor] = useState(today);
  const [owner, setOwner] = useState("all");
  const [kind, setKind] = useState("");
  const [result, setResult] = useState<{ key: string; tasks: CrmTask[]; error: boolean } | null>(null);
  const { start, end } = windowOf(mode, anchor);
  const key = `${start}|${end}|${owner}|${kind}|${version}`;

  useEffect(() => {
    let cancelled = false;
    // Window in Brasília: first day 00:00 to last day 23:59:59 (-03:00).
    const from = new Date(`${start}T00:00:00-03:00`).toISOString();
    const to = new Date(`${end}T23:59:59-03:00`).toISOString();
    const qs = new URLSearchParams({ status: "any", owner, from, to });
    if (kind) qs.set("kind", kind);
    fetch(`/api/crm/tasks/?${qs}`)
      .then(async (res) => {
        const tasks = res.ok ? ((await res.json()) as { tasks: CrmTask[] }).tasks : [];
        if (!cancelled) setResult({ key, tasks, error: !res.ok });
      })
      .catch(() => !cancelled && setResult({ key, tasks: [], error: true }));
    return () => {
      cancelled = true;
    };
  }, [start, end, owner, kind, key]);

  const tasks = useMemo(() => result?.tasks ?? [], [result]);
  const byDay = useMemo(() => {
    const map = new Map<string, CrmTask[]>();
    for (const t of tasks) {
      if (!t.dueAt) continue;
      const day = spDate(t.dueAt);
      map.set(day, [...(map.get(day) ?? []), t]);
    }
    for (const list of map.values()) list.sort(sortTasks);
    return map;
  }, [tasks]);
  const usedKinds = [...new Set(tasks.map((t) => t.kind))];

  const step = (n: number) => setAnchor((a) => (mode === "dia" ? addDays(a, n) : mode === "semana" ? addDays(a, 7 * n) : addMonths(a, n)));
  const title =
    mode === "dia"
      ? longDay(anchor)
      : mode === "semana"
        ? `Semana de ${ddmm(start)} a ${ddmm(end)}`
        : `${MONTHS[Number(anchor.slice(5, 7)) - 1]} de ${anchor.slice(0, 4)}`;
  const unit = mode === "dia" ? "Dia" : mode === "semana" ? "Semana" : "Mês";

  /** One task as a compact line (week, month) — the type's color on its left edge. */
  const item = (t: CrmTask, compact: boolean) => {
    const done = Boolean(t.doneAt);
    const state = taskState(t.dueAt, t.allDay, now);
    const when = t.allDay ? "Dia todo" : timeOfDay(t.dueAt!);
    return (
      <button
        type="button"
        onClick={() => onOpenTask(t.id)}
        title={`${when} · ${t.title} (${label("task_kind", t.kind)})`}
        aria-label={`${when} ${t.title} (${label("task_kind", t.kind)})`}
        className={`w-full text-left rounded-md transition-colors ${
          compact
            ? `p-0.5 sm:px-1 sm:py-0.5 sm:border sm:border-crm-line sm:border-l-[3px] ${ACCENT[color("task_kind", t.kind)]}`
            : `px-2 py-1.5 border border-crm-line border-l-[3px] ${ACCENT[color("task_kind", t.kind)]}`
        } ${done ? `${compact ? "sm:bg-crm-sunken" : "bg-crm-sunken"} opacity-60` : `${compact ? "sm:bg-crm-raised" : "bg-crm-raised"} hover:border-crm-line-strong`}`}
      >
        {compact ? (
          <>
            {/* Phone: too narrow for text — a bar in the type's color (tap the day for the list). */}
            <span className={`sm:hidden block h-1.5 rounded-full ${TAG_DOT[color("task_kind", t.kind)]}`} aria-hidden="true" />
            <span className={`hidden sm:block truncate text-[10.5px] leading-tight ${done ? "line-through text-crm-faint" : "text-crm-text"}`}>
              {!t.allDay && <span className="tabular-nums text-crm-dim">{timeOfDay(t.dueAt!)} </span>}
              {t.title}
            </span>
          </>
        ) : (
          <>
            <span className={`block text-[11px] font-medium ${done ? "text-crm-faint" : TASK_STATE_TONE[state]}`}>{when}</span>
            <span className={`block text-[12px] font-semibold truncate ${done ? "line-through text-crm-faint" : "text-crm-text"}`}>{t.title}</span>
            <span className="flex items-center justify-between gap-1">
              <span className="text-[11px] text-crm-dim truncate">{t.contactName ?? t.company ?? "Atividade interna"}</span>
              <OwnerAvatar name={t.ownerName} />
            </span>
          </>
        )}
      </button>
    );
  };

  const addButton = (day: string, text = "+") =>
    canCreate ? (
      <button
        type="button"
        onClick={() => onNewTask({ date: day })}
        aria-label={`Nova tarefa em ${ddmm(day)}`}
        title="Nova tarefa neste dia"
        className="h-6 min-w-6 px-1 rounded-md text-[13px] leading-none text-crm-faint hover:text-crm-text hover:bg-crm-hover"
      >
        {text}
      </button>
    ) : null;

  const loading = result?.key !== key;
  const days = mode === "dia" ? [anchor] : Array.from({ length: Math.round((Date.parse(end) - Date.parse(start)) / 86_400_000) + 1 }, (_, i) => addDays(start, i));

  return (
    <section aria-label="Agenda" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => step(-1)} className={CRM_BTN_OUTLINE} aria-label={`${unit} anterior`}>
          ←
        </button>
        <button type="button" onClick={() => setAnchor(today)} className={CRM_BTN_OUTLINE}>
          Hoje
        </button>
        <button type="button" onClick={() => step(1)} className={CRM_BTN_OUTLINE} aria-label={`Próximo ${unit.toLowerCase()}`}>
          →
        </button>
        <h2 className="text-[14px] font-semibold ml-1 first-letter:uppercase" aria-live="polite">
          {title}
        </h2>
        <div className={`${CRM_SEGMENT_TRACK} sm:ml-auto`} role="tablist" aria-label="Visualização">
          {(
            [
              ["dia", "Dia"],
              ["semana", "Semana"],
              ["mes", "Mês"],
            ] as const
          ).map(([id, text]) => (
            <button key={id} type="button" role="tab" aria-selected={mode === id} onClick={() => setMode(id)} className={crmSegment(mode === id)}>
              {text}
            </button>
          ))}
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Agenda de" className={CRM_FILTER}>
          <option value="all">Todos</option>
          <option value="mine">Só a minha</option>
          <option value="none">Sem responsável</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo de tarefa" className={CRM_FILTER}>
          <option value="">Todos os tipos</option>
          {options("task_kind").map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        {canCreate && (
          <button type="button" onClick={() => onNewTask({ date: mode === "dia" ? anchor : today >= start && today <= end ? today : start })} className={`${CRM_BTN_PRIMARY} ml-auto`}>
            + Nova tarefa
          </button>
        )}
      </div>
      {result?.error && <p className="text-[12.5px] text-crm-red">Não foi possível carregar a agenda.</p>}

      {mode === "dia" ? (
        <div className={`rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] transition-opacity ${loading ? "opacity-60" : ""}`}>
          {(byDay.get(anchor) ?? []).length === 0 ? (
            <p className="px-4 py-6 text-[12.5px] text-crm-faint">Nada marcado para este dia.</p>
          ) : (
            <ul className="divide-y divide-crm-line" aria-label={`Tarefas de ${ddmm(anchor)}`}>
              {(byDay.get(anchor) ?? []).map((t) => {
                const done = Boolean(t.doneAt);
                const state = taskState(t.dueAt, t.allDay, now);
                return (
                  <li key={t.id} className={`flex items-start gap-3 px-4 py-3 border-l-4 ${ACCENT[color("task_kind", t.kind)]}`}>
                    <span className={`w-14 shrink-0 text-[12.5px] font-semibold tabular-nums ${done ? "text-crm-faint" : TASK_STATE_TONE[state]}`}>
                      {t.allDay ? "Dia todo" : timeOfDay(t.dueAt!)}
                    </span>
                    <div className="min-w-0 flex-1 space-y-1">
                      <button type="button" onClick={() => onOpenTask(t.id)} className={`block text-left text-[13.5px] font-semibold hover:underline ${done ? "line-through text-crm-faint" : ""}`}>
                        {t.title}
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <TaskKindChip kind={t.kind} small />
                        <PriorityChip priority={t.priority} />
                        {t.status === "em_andamento" && <span className="text-[10.5px] font-medium text-crm-accent">Em andamento</span>}
                      </div>
                      {t.contactId ? (
                        <button type="button" onClick={() => onOpenContact(t.contactId!, t.dealId)} className={`${CRM_LINK_BTN} !text-[12px] !font-medium`}>
                          {t.contactName}
                          {t.company ? ` · ${t.company}` : ""} ↗
                        </button>
                      ) : t.companyId ? (
                        <button type="button" onClick={() => onOpenCompany(t.companyId!)} className={`${CRM_LINK_BTN} !text-[12px] !font-medium`}>
                          {t.company} ↗
                        </button>
                      ) : (
                        <p className="text-[12px] text-crm-dim">Atividade interna</p>
                      )}
                    </div>
                    <OwnerAvatar name={t.ownerName} />
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      ) : mode === "semana" ? (
        <div className={`grid grid-cols-1 md:grid-cols-7 gap-2 transition-opacity ${loading ? "opacity-60" : ""}`}>
          {days.map((day, i) => {
            const items = byDay.get(day) ?? [];
            const isToday = day === today;
            return (
              <section
                key={day}
                aria-label={`${DAY_NAMES[i]} ${ddmm(day)}`}
                className={`rounded-2xl border min-h-[120px] md:min-h-[260px] ${isToday ? "border-crm-accent bg-crm-accent/[0.04]" : "border-crm-line bg-crm-card"} shadow-[var(--crm-shadow)]`}
              >
                <header className="px-3 pt-2.5 pb-1.5 flex items-center justify-between gap-1">
                  <button type="button" onClick={() => (setAnchor(day), setMode("dia"))} className="flex items-baseline gap-2 hover:opacity-80" aria-label={`Ver o dia ${ddmm(day)}`}>
                    <span className={`text-[12px] font-semibold ${isToday ? "text-crm-accent" : "text-crm-dim"}`}>{DAY_NAMES[i]}</span>
                    <span className={`text-[18px] font-semibold tabular-nums ${isToday ? "text-crm-accent" : "text-crm-text"}`}>{day.slice(8, 10)}</span>
                  </button>
                  {addButton(day)}
                </header>
                <ul className="px-2 pb-2 space-y-1.5">
                  {items.map((t) => (
                    <li key={t.id}>{item(t, false)}</li>
                  ))}
                  {items.length === 0 && <li className="px-1 py-2 text-[11px] text-crm-faint">Livre</li>}
                </ul>
              </section>
            );
          })}
        </div>
      ) : (
        <div className={`transition-opacity ${loading ? "opacity-60" : ""}`}>
          <div className="grid grid-cols-7 gap-1 mb-1" aria-hidden="true">
            {DAY_NAMES.map((d) => (
              <span key={d} className="text-center text-[10.5px] font-semibold uppercase tracking-wide text-crm-faint">
                {d}
              </span>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {days.map((day) => {
              const items = byDay.get(day) ?? [];
              const isToday = day === today;
              const inMonth = day.slice(0, 7) === anchor.slice(0, 7);
              const shown = items.slice(0, 3);
              return (
                <section
                  key={day}
                  aria-label={`Dia ${ddmm(day)}`}
                  className={`min-w-0 rounded-lg border min-h-[64px] sm:min-h-[104px] p-1 ${isToday ? "border-crm-accent bg-crm-accent/[0.04]" : "border-crm-line bg-crm-card"} ${inMonth ? "" : "opacity-50"}`}
                >
                  <div className="flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => (setAnchor(day), setMode("dia"))}
                      aria-label={`Ver o dia ${ddmm(day)}`}
                      className={`text-[12px] font-semibold tabular-nums px-1 rounded hover:bg-crm-hover ${isToday ? "text-crm-accent" : "text-crm-text"}`}
                    >
                      {Number(day.slice(8, 10))}
                    </button>
                    <span className="hidden sm:inline">{addButton(day)}</span>
                  </div>
                  <ul className="mt-0.5 space-y-0.5">
                    {shown.map((t) => (
                      <li key={t.id}>{item(t, true)}</li>
                    ))}
                  </ul>
                  {items.length > shown.length && (
                    <button type="button" onClick={() => (setAnchor(day), setMode("dia"))} className="mt-0.5 text-[10.5px] text-crm-dim hover:text-crm-text">
                      +{items.length - shown.length} mais
                    </button>
                  )}
                </section>
              );
            })}
          </div>
        </div>
      )}

      {usedKinds.length > 0 && (
        <ul className="flex flex-wrap items-center gap-1.5" aria-label="Cores por tipo">
          {usedKinds.map((k) => (
            <li key={k}>
              <TaskKindChip kind={k} small />
            </li>
          ))}
        </ul>
      )}
      <p className="text-[11.5px] text-crm-faint">Tarefas sem data aparecem na aba Tarefas. Canceladas não aparecem na agenda.</p>
    </section>
  );
}
