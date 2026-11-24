"use client";

// Mensagens agendadas (evolução v1.0, item 11), above the conversation's
// composer: the ones still to go out (with Cancelar) and the latest that
// could not be sent, with the reason. Sent and cancelled ones are in the
// history and the conversation itself.

import { useEffect, useState } from "react";
import type { CrmScheduledMessage } from "@/lib/crm-scheduled-types";
import { dateTime } from "./crm-format";

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const data = (await res.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? fallback;
}

/** "YYYY-MM-DDTHH:MM" in the browser's time, for a datetime-local input. */
export function localInputValue(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

/** A sensible default: an hour from now, on the next quarter hour. */
export function defaultScheduleValue(now = Date.now()): string {
  const d = new Date(now + 60 * 60_000);
  d.setMinutes(Math.ceil(d.getMinutes() / 15) * 15, 0, 0);
  return localInputValue(d);
}

function what(m: CrmScheduledMessage): string {
  if (m.kind === "template") return `Modelo ${m.templateName ?? ""}${m.templateParams.length ? ` (${m.templateParams.join(" · ")})` : ""}`;
  return m.body ?? "";
}

export default function CrmScheduledMessages({
  contactId,
  refreshKey,
  canCancel,
  onChanged,
}: {
  contactId: string;
  /** Changes whenever the list may have changed (a new schedule, a new message in the conversation). */
  refreshKey: string;
  canCancel: boolean;
  onChanged: () => void;
}) {
  const [{ messages, loadedAt }, setLoaded] = useState<{ messages: CrmScheduledMessage[]; loadedAt: number }>({ messages: [], loadedAt: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/contacts/${contactId}/scheduled-messages/`, { cache: "no-store" })
      .then(async (res) => (res.ok ? ((await res.json()) as { messages: CrmScheduledMessage[] }).messages : []))
      .then((list) => !cancelled && setLoaded({ messages: list, loadedAt: Date.now() }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contactId, refreshKey, version]);

  async function cancel(id: string) {
    setBusy(id);
    const res = await fetch(`/api/crm/contacts/${contactId}/scheduled-messages/${id}/`, { method: "DELETE" });
    setBusy(null);
    if (!res.ok) setError(await errorFrom(res, "Não foi possível cancelar."));
    else setError(null);
    setVersion((v) => v + 1);
    onChanged();
  }

  const pending = messages.filter((m) => m.status === "pendente" || m.status === "enviando");
  // Only failures of the last 3 days stay in view; older ones are in the history.
  const failed = messages.filter((m) => m.status === "falhou" && loadedAt - Date.parse(m.sendAt) < 3 * 86_400_000).slice(0, 3);
  if (pending.length === 0 && failed.length === 0 && !error) return null;
  const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;
  const summary = [
    pending.length ? `${plural(pending.length, "agendada", "agendadas")} · próxima ${dateTime(pending[0].sendAt)}` : null,
    failed.length ? plural(failed.length, "não enviada", "não enviadas") : null,
  ]
    .filter(Boolean)
    .join(" · ");

  // One line, so the conversation keeps its room; the details open on demand.
  return (
    <section aria-label="Mensagens agendadas" className="rounded-lg border border-crm-line bg-crm-sunken text-[12px]">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-1.5 text-left">
        <span aria-hidden>🕒</span>
        <span className={`min-w-0 flex-1 truncate font-medium ${failed.length ? "text-crm-amber" : "text-crm-text"}`}>{summary || "Mensagens agendadas"}</span>
        <span className="shrink-0 text-crm-dim">{open ? "Ocultar" : "Ver"}</span>
      </button>
      {open && (
        <ul className="max-h-48 overflow-y-auto border-t border-crm-line divide-y divide-crm-line">
          {pending.map((m) => (
            <li key={m.id} className="flex items-start gap-2 px-3 py-2">
              <div className="min-w-0 flex-1">
                <p className="font-medium text-crm-text">
                  {m.status === "enviando" ? "Enviando agora" : `Agendada para ${dateTime(m.sendAt)}`}
                  {m.createdByName ? <span className="font-normal text-crm-dim"> · por {m.createdByName}</span> : null}
                </p>
                <p className="truncate text-crm-dim" title={what(m)}>
                  {what(m)}
                </p>
              </div>
              {canCancel && m.status === "pendente" && (
                <button
                  type="button"
                  disabled={busy === m.id}
                  onClick={() => void cancel(m.id)}
                  className="shrink-0 text-crm-red hover:underline disabled:opacity-60"
                >
                  {busy === m.id ? "Cancelando..." : "Cancelar"}
                </button>
              )}
            </li>
          ))}
          {failed.map((m) => (
            <li key={m.id} className="px-3 py-2 text-crm-amber">
              <strong>Não enviada</strong> (agendada para {dateTime(m.sendAt)}): {m.error}
            </li>
          ))}
        </ul>
      )}
      {error && <p className="px-3 pb-2 text-crm-red">{error}</p>}
    </section>
  );
}
