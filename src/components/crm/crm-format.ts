// Display helpers for the CRM screens. Dates are always read in Brasília
// time, whatever the viewer's own browser timezone is.

import { serviceWindowRemainingMs } from "@/lib/crm-types";

const TZ = "America/Sao_Paulo";
const dayFormatter = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" });

/** "YYYY-MM-DD" of an instant, in Brasília. */
export function spDate(iso: string | number | Date): string {
  return dayFormatter.format(new Date(iso));
}

export function todaySp(): string {
  return spDate(Date.now());
}

/** "14/11" from an ISO instant or a "YYYY-MM-DD" date. */
export function shortDate(value: string): string {
  const day = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : spDate(value);
  return `${day.slice(8, 10)}/${day.slice(5, 7)}`;
}

export function timeOfDay(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

export function dateTime(iso: string): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(iso));
}

/** "agora", "há 12 min", "há 3h", "há 4d". */
export function relativeTime(iso: string, now: number = Date.now()): string {
  const minutes = Math.floor((now - Date.parse(iso)) / 60000);
  if (minutes < 1) return "agora";
  if (minutes < 60) return `há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `há ${hours}h`;
  return `há ${Math.floor(hours / 24)}d`;
}

/** Chat-list time, like WhatsApp: "14:32" today, "ontem", "qua." this week, "14/11" before. */
export function chatTime(iso: string, now: number = Date.now()): string {
  const day = spDate(iso);
  const today = spDate(now);
  if (day === today) return timeOfDay(iso);
  if (day === spDate(now - 86_400_000)) return "ontem";
  if (Date.parse(`${today}T00:00:00-03:00`) - Date.parse(`${day}T00:00:00-03:00`) < 7 * 86_400_000) {
    return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short" }).format(new Date(iso));
  }
  return shortDate(iso);
}

/** null when the 24h window is closed; otherwise "faltam 22h" / "faltam 35 min". */
export function windowLabel(lastInboundAt: string | null, now: number = Date.now()): string | null {
  const ms = serviceWindowRemainingMs(lastInboundAt, now);
  if (ms === 0) return null;
  const minutes = Math.ceil(ms / 60000);
  return minutes >= 60 ? `faltam ${Math.floor(minutes / 60)}h` : `faltam ${minutes} min`;
}

export type FollowUpState = "overdue" | "today" | "upcoming" | "none";

export function followUpState(nextActionAt: string | null, today: string = todaySp()): FollowUpState {
  if (!nextActionAt) return "none";
  const day = spDate(nextActionAt);
  if (day < today) return "overdue";
  if (day === today) return "today";
  return "upcoming";
}

/** "Ana Ribeiro" → "AR". */
export function initials(name: string): string {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0]!.toUpperCase())
    .join("");
}

/** "seg., 18/11" style weekday + date, Brasília. */
export function weekdayDate(iso: string | number | Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TZ, weekday: "short", day: "2-digit", month: "2-digit" }).format(new Date(iso));
}

/** Adds n days to a "YYYY-MM-DD" (calendar math, no timezone surprises). */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** Monday of the week containing `day` ("YYYY-MM-DD"). */
export function weekStart(day: string): string {
  const wd = new Date(`${day}T12:00:00Z`).getUTCDay(); // 0 = Sunday
  return addDays(day, wd === 0 ? -6 : 1 - wd);
}

export type TaskState = "overdue" | "today" | "soon" | "later" | "none";

/** Where a pending task stands: overdue, due today, within 7 days, later or without a date. */
export function taskState(dueAt: string | null, allDay: boolean, now: number = Date.now()): TaskState {
  if (!dueAt) return "none";
  const today = spDate(now);
  const day = spDate(dueAt);
  if (day < today || (!allDay && day === today && Date.parse(dueAt) < now)) return "overdue";
  if (day === today) return "today";
  if (day <= addDays(today, 7)) return "soon";
  return "later";
}

/** "Hoje 13:30", "Amanhã", "Atrasada · 14/11", "qui., 20/11 09:00", "Sem data". */
export function taskDueLabel(dueAt: string | null, allDay: boolean, now: number = Date.now()): string {
  if (!dueAt) return "Sem data";
  const today = spDate(now);
  const day = spDate(dueAt);
  const time = allDay ? "" : ` ${timeOfDay(dueAt)}`;
  if (taskState(dueAt, allDay, now) === "overdue") return `Atrasada · ${shortDate(dueAt)}${time}`;
  if (day === today) return `Hoje${time}`;
  if (day === addDays(today, 1)) return `Amanhã${time}`;
  return `${weekdayDate(dueAt)}${time}`;
}

export const TASK_STATE_TONE: Record<TaskState, string> = {
  overdue: "text-crm-red",
  today: "text-crm-amber",
  soon: "text-crm-text",
  later: "text-crm-dim",
  none: "text-crm-faint",
};
