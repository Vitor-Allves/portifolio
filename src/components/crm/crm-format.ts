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
