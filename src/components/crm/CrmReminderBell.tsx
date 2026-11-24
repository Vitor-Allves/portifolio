"use client";

// Lembretes (especificação v1.0, módulo 8): the bell in the CRM header. It
// lists my tasks whose reminder time has come (until I dismiss each one),
// my unread notices from the automações (lead atribuído, alerta, interesse
// em campanha) and how many of my tasks are late. In-app only: it checks
// while the CRM is open — nothing is sent by WhatsApp or e-mail.

import { useCallback, useEffect, useRef, useState } from "react";
import type { CrmBellNotice, CrmReminders } from "@/lib/crm-types";
import { CRM_LINK_BTN, CRM_POPOVER } from "./crm-styles";
import { relativeTime, taskDueLabel } from "./crm-format";

const POLL_MS = 60_000;

export default function CrmReminderBell({
  version,
  onOpenTask,
  onOpenContact,
  onOpenClient,
  onShowTasks,
}: {
  /** Bumped after any change in the CRM: reload. */
  version: number;
  onOpenTask: (taskId: string) => void;
  onOpenContact: (contactId: string) => void;
  /** A notice about a client (contract near its end) opens the client. */
  onOpenClient?: (clientId: string) => void;
  onShowTasks: () => void;
}) {
  const [data, setData] = useState<CrmReminders & { notifications: CrmBellNotice[] }>({ due: [], overdue: 0, notifications: [] });
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const box = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/crm/reminders/", { cache: "no-store" });
      if (res.ok) {
        const d = (await res.json()) as CrmReminders & { notifications?: CrmBellNotice[] };
        setData({ ...d, notifications: d.notifications ?? [] });
      }
    } catch {
      // The bell just keeps what it had; the next check tries again.
    }
    setNow(Date.now());
  }, []);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void load();
    };
    run();
    const timer = setInterval(run, POLL_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, version]);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (box.current && !box.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  async function dismiss(id: string) {
    setData((d) => ({ ...d, due: d.due.filter((t) => t.id !== id) }));
    await fetch(`/api/crm/tasks/${id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ dismissReminder: true }) }).catch(() => {});
    void load();
  }

  async function markRead(ids: string[] | "all") {
    setData((d) => ({ ...d, notifications: ids === "all" ? [] : d.notifications.filter((n) => !ids.includes(n.id)) }));
    await fetch("/api/crm/notifications/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ids }) }).catch(() => {});
    void load();
  }

  const count = data.due.length + data.notifications.length;
  const label = count === 0 ? "Lembretes" : `Lembretes: ${count} ${count === 1 ? "novo" : "novos"}`;

  return (
    <div ref={box} className="relative shrink-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label={label}
        aria-expanded={open}
        className="relative h-9 w-9 inline-flex items-center justify-center rounded-xl border border-crm-line bg-crm-card text-crm-dim hover:text-crm-text"
      >
        <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
          <path d="M6 8a6 6 0 1 1 12 0c0 7 3 9 3 9H3s3-2 3-9" />
          <path d="M10.3 21a1.94 1.94 0 0 0 3.4 0" />
        </svg>
        {count > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-crm-red text-white text-[10.5px] font-semibold flex items-center justify-center" aria-hidden="true">
            {count > 9 ? "9+" : count}
          </span>
        )}
      </button>
      {open && (
        <div role="dialog" aria-label="Lembretes" className={`${CRM_POPOVER} fixed sm:absolute left-3 right-3 sm:left-auto sm:right-0 top-16 sm:top-11 z-40 sm:w-[360px] overflow-hidden`}>
          <header className="px-4 py-2.5 border-b border-crm-line">
            <h2 className="text-[13px] font-semibold">Lembretes</h2>
          </header>
          {data.notifications.length > 0 && (
            <section aria-label="Avisos" className="border-b border-crm-line">
              <div className="px-4 pt-2 flex items-center justify-between">
                <h3 className="text-[11px] font-semibold uppercase tracking-wide text-crm-faint">Avisos</h3>
                <button type="button" onClick={() => void markRead("all")} className="text-[11.5px] text-crm-dim hover:text-crm-text">
                  Marcar todos como lidos
                </button>
              </div>
              <ul className="divide-y divide-crm-line max-h-[35vh] overflow-y-auto">
                {data.notifications.map((n) => (
                  <li key={n.id} className="px-4 py-2.5 flex items-start gap-2">
                    <button
                      type="button"
                      disabled={!n.contactId && !(n.clientId && onOpenClient)}
                      onClick={() => {
                        setOpen(false);
                        void markRead([n.id]);
                        if (n.clientId && onOpenClient) onOpenClient(n.clientId);
                        else if (n.contactId) onOpenContact(n.contactId);
                      }}
                      className="min-w-0 flex-1 text-left disabled:cursor-default"
                    >
                      <span className="block text-[13px] font-semibold">{n.title}</span>
                      {n.body && <span className="block text-[11.5px] text-crm-dim">{n.body}</span>}
                      <span className="block text-[11px] text-crm-faint">{relativeTime(n.at, now)}</span>
                    </button>
                    <button type="button" onClick={() => void markRead([n.id])} aria-label={`Marcar como lido: ${n.title}`} className="text-[11.5px] text-crm-dim hover:text-crm-text shrink-0">
                      Lido
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          {count === 0 ? (
            <p className="px-4 py-4 text-[12.5px] text-crm-dim">Nenhum lembrete agora.</p>
          ) : data.due.length === 0 ? null : (
            <ul className="divide-y divide-crm-line max-h-[50vh] overflow-y-auto">
              {data.due.map((t) => (
                <li key={t.id} className="px-4 py-2.5 flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setOpen(false);
                      onOpenTask(t.id);
                    }}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="block text-[13px] font-semibold truncate">{t.title}</span>
                    <span className="block text-[11.5px] text-crm-dim truncate">
                      {taskDueLabel(t.dueAt, t.allDay, now)} · {t.contactName ?? t.company ?? "Atividade interna"}
                    </span>
                  </button>
                  <button type="button" onClick={() => void dismiss(t.id)} aria-label={`Dispensar lembrete: ${t.title}`} className="text-[11.5px] text-crm-dim hover:text-crm-text shrink-0">
                    Dispensar
                  </button>
                </li>
              ))}
            </ul>
          )}
          {data.overdue > 0 && (
            <footer className="px-4 py-2.5 border-t border-crm-line flex items-center justify-between gap-2 text-[12px]">
              <span className="text-crm-red">
                {data.overdue} {data.overdue === 1 ? "tarefa sua atrasada" : "tarefas suas atrasadas"}
              </span>
              <button
                type="button"
                className={CRM_LINK_BTN}
                onClick={() => {
                  setOpen(false);
                  onShowTasks();
                }}
              >
                Ver em Tarefas
              </button>
            </footer>
          )}
        </div>
      )}
    </div>
  );
}
