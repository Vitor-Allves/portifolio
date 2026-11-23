"use client";

import { useEffect, useMemo, useState } from "react";
import { type CrmTask, type CrmTeamMember } from "@/lib/crm-types";
import { CRM_BTN_OUTLINE, CRM_FILTER, taskKindIcon } from "./crm-styles";
import { TASK_STATE_TONE, addDays, spDate, taskState, timeOfDay, weekStart } from "./crm-format";
import { OwnerAvatar } from "./CrmOwnerAvatar";

const DAY_NAMES = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sáb", "Dom"];

/** A simple week agenda of tasks (pending and done) with a due date. */
export default function CrmAgendaView({
  team,
  version,
  now,
  onOpenContact,
}: {
  team: CrmTeamMember[];
  version: number;
  now: number;
  onOpenContact: (contactId: string, tab?: "conversa" | "negocio") => void;
}) {
  const today = spDate(now);
  const [start, setStart] = useState(() => weekStart(today));
  const [owner, setOwner] = useState("all");
  const [result, setResult] = useState<{ key: string; tasks: CrmTask[] } | null>(null);
  const key = `${start}|${owner}|${version}`;

  useEffect(() => {
    let cancelled = false;
    // Week window in Brasília: Monday 00:00 to Sunday 23:59:59 (-03:00).
    const from = new Date(`${start}T00:00:00-03:00`).toISOString();
    const to = new Date(`${addDays(start, 6)}T23:59:59-03:00`).toISOString();
    const qs = (status: string) => `/api/crm/tasks/?status=${status}&owner=${encodeURIComponent(owner)}&from=${from}&to=${to}`;
    Promise.all([fetch(qs("pending")), fetch(qs("done"))])
      .then(async ([a, b]) => {
        const pending = a.ok ? ((await a.json()) as { tasks: CrmTask[] }).tasks : [];
        const done = b.ok ? ((await b.json()) as { tasks: CrmTask[] }).tasks : [];
        return [...pending, ...done];
      })
      .then((tasks) => !cancelled && setResult({ key, tasks }))
      .catch(() => !cancelled && setResult({ key, tasks: [] }));
    return () => {
      cancelled = true;
    };
  }, [start, owner, key]);

  const days = useMemo(() => Array.from({ length: 7 }, (_, i) => addDays(start, i)), [start]);
  const tasks = result?.tasks ?? [];
  const byDay = (day: string) =>
    tasks
      .filter((t) => t.dueAt && spDate(t.dueAt) === day)
      .sort((a, b) => Number(!a.allDay) - Number(!b.allDay) || Date.parse(a.dueAt!) - Date.parse(b.dueAt!));
  const label = `${start.slice(8, 10)}/${start.slice(5, 7)} a ${addDays(start, 6).slice(8, 10)}/${addDays(start, 6).slice(5, 7)}`;

  return (
    <section aria-label="Agenda" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => setStart((s) => addDays(s, -7))} className={CRM_BTN_OUTLINE} aria-label="Semana anterior">
          ←
        </button>
        <button type="button" onClick={() => setStart(weekStart(today))} className={CRM_BTN_OUTLINE}>
          Esta semana
        </button>
        <button type="button" onClick={() => setStart((s) => addDays(s, 7))} className={CRM_BTN_OUTLINE} aria-label="Próxima semana">
          →
        </button>
        <h2 className="text-[14px] font-semibold ml-1" aria-live="polite">
          Semana de {label}
        </h2>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Agenda de" className={`ml-auto ${CRM_FILTER}`}>
          <option value="all">Todos</option>
          <option value="mine">Só a minha</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </div>

      <div className={`grid grid-cols-1 md:grid-cols-7 gap-2 transition-opacity ${result?.key !== key ? "opacity-60" : ""}`}>
        {days.map((day, i) => {
          const items = byDay(day);
          const isToday = day === today;
          return (
            <section
              key={day}
              aria-label={`${DAY_NAMES[i]} ${day.slice(8, 10)}/${day.slice(5, 7)}`}
              className={`rounded-2xl border min-h-[120px] md:min-h-[260px] ${isToday ? "border-crm-accent bg-crm-accent/[0.04]" : "border-crm-line bg-crm-card"} shadow-[var(--crm-shadow)]`}
            >
              <header className="px-3 pt-2.5 pb-1.5 flex items-baseline justify-between">
                <span className={`text-[12px] font-semibold ${isToday ? "text-crm-accent" : "text-crm-dim"}`}>{DAY_NAMES[i]}</span>
                <span className={`text-[18px] font-semibold tabular-nums ${isToday ? "text-crm-accent" : "text-crm-text"}`}>{day.slice(8, 10)}</span>
              </header>
              <ul className="px-2 pb-2 space-y-1.5">
                {items.map((t) => {
                  const done = Boolean(t.doneAt);
                  const state = taskState(t.dueAt, t.allDay, now);
                  return (
                    <li key={t.id}>
                      <button
                        type="button"
                        onClick={() => onOpenContact(t.contactId, "negocio")}
                        className={`w-full text-left rounded-lg border px-2 py-1.5 transition-colors ${
                          done ? "border-crm-line bg-crm-sunken opacity-60" : "border-crm-line bg-crm-raised hover:border-crm-line-strong"
                        }`}
                      >
                        <span className={`block text-[11px] font-medium ${done ? "text-crm-faint" : TASK_STATE_TONE[state]}`}>
                          {t.allDay ? "Dia todo" : timeOfDay(t.dueAt!)} <span aria-hidden="true">{taskKindIcon(t.kind)}</span>
                        </span>
                        <span className={`block text-[12px] font-semibold truncate ${done ? "line-through text-crm-faint" : "text-crm-text"}`}>{t.title}</span>
                        <span className="flex items-center justify-between gap-1">
                          <span className="text-[11px] text-crm-dim truncate">{t.contactName}</span>
                          <OwnerAvatar name={t.ownerName} />
                        </span>
                      </button>
                    </li>
                  );
                })}
                {items.length === 0 && <li className="px-1 py-2 text-[11px] text-crm-faint">Livre</li>}
              </ul>
            </section>
          );
        })}
      </div>
      <p className="text-[11.5px] text-crm-faint">Tarefas sem data aparecem na aba Tarefas.</p>
    </section>
  );
}
