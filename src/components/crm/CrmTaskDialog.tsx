"use client";

// One form for every task (especificação v1.0, módulo 8): created from the
// Agenda, Tarefas, or a company; opened from any of them to edit, finish or
// cancel it, with its own history and a way to the record it is about.

import { useEffect, useState, type FormEvent } from "react";
import {
  CRM_TASK_STATUSES,
  TASK_REMINDERS_ALL_DAY,
  TASK_REMINDERS_TIMED,
  taskStatusLabel,
  type CrmCompanyRow,
  type CrmContactCard,
  type CrmContactDetail,
  type CrmDeal,
  type CrmPage,
  type CrmTask,
  type CrmTaskEvent,
  type CrmTaskStatus,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_SEGMENT_TRACK, crmSegment } from "./crm-styles";
import { dateTime, shortDate, spDate, timeOfDay } from "./crm-format";
import { TAG_TONE, useCatalog } from "./crm-catalog-context";

/** What a new task starts with (where it was created from). */
export type TaskDraft = {
  contactId?: string;
  contactName?: string;
  companyId?: string;
  companyName?: string;
  dealId?: string | null;
  /** YYYY-MM-DD */
  date?: string;
  /** HH:MM */
  time?: string;
};

export type TaskDialogTarget = { id: string } | { draft: TaskDraft };

type Link = "contato" | "empresa" | "nenhum";
type Picked = { id: string; name: string };

/** Type chip in the type's color (Personalização → Tipos de tarefa). */
export function TaskKindChip({ kind, small }: { kind: string; small?: boolean }) {
  const { label, color } = useCatalog();
  return (
    <span className={`inline-flex items-center rounded-full border font-medium whitespace-nowrap ${small ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-[11.5px]"} ${TAG_TONE[color("task_kind", kind)]}`}>
      {label("task_kind", kind)}
    </span>
  );
}

export function PriorityChip({ priority }: { priority: string }) {
  const { label, color } = useCatalog();
  return (
    <span className={`inline-flex items-center rounded-full border px-1.5 py-px text-[10.5px] font-medium whitespace-nowrap ${TAG_TONE[color("priority", priority)]}`}>
      {label("priority", priority)}
    </span>
  );
}

function eventText(e: CrmTaskEvent): string {
  const p = e.payload;
  switch (e.action) {
    case "created":
      return "Criou a tarefa";
    case "logged":
      return "Registrou a atividade";
    case "edited":
      return `Alterou ${Array.isArray(p.fields) ? (p.fields as string[]).join(", ") : "a tarefa"}`;
    case "rescheduled":
      return p.dueAt ? `Reagendou para ${shortDate(String(p.dueAt))}${p.allDay ? "" : ` ${timeOfDay(String(p.dueAt))}`}` : "Tirou a data";
    case "owner":
      return `Responsável: ${String(p.from ?? "ninguém")} → ${String(p.to ?? "ninguém")}`;
    case "status":
      return `${taskStatusLabel(String(p.from))} → ${taskStatusLabel(String(p.to))}${p.result ? ` · ${String(p.result)}` : ""}`;
    default:
      return e.action;
  }
}

/** Contact or company picker: type to search, pick one. */
function RecordSearch({ kind, onPick }: { kind: "contato" | "empresa"; onPick: (p: Picked) => void }) {
  const [q, setQ] = useState("");
  const [found, setFound] = useState<Picked[]>([]);
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(() => {
      const url = kind === "contato" ? `/api/crm/contacts/?q=${encodeURIComponent(term)}&page=1&pageSize=8` : `/api/crm/companies/?q=${encodeURIComponent(term)}&page=1&pageSize=8`;
      fetch(url, { signal: controller.signal })
        .then((res) => (res.ok ? res.json() : { rows: [] }))
        .then((body: CrmPage<CrmContactCard | CrmCompanyRow>) =>
          setFound(body.rows.map((r) => ({ id: r.id, name: "company" in r && r.company ? `${r.name} · ${r.company}` : r.name })))
        )
        .catch(() => {});
    }, 200);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [q, kind]);
  const results = q.trim().length >= 2 ? found : [];
  return (
    <div className="space-y-1">
      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={kind === "contato" ? "Buscar contato pelo nome, telefone ou e-mail" : "Buscar empresa pelo nome ou CNPJ"}
        aria-label={kind === "contato" ? "Buscar contato" : "Buscar empresa"}
        autoComplete="off"
        className={CRM_INPUT}
      />
      {results.length > 0 && (
        <ul className="rounded-lg border border-crm-line bg-crm-card divide-y divide-crm-line max-h-40 overflow-y-auto" aria-label="Resultados">
          {results.map((r) => (
            <li key={r.id}>
              <button type="button" onClick={() => onPick(r)} className="w-full text-left px-3 py-1.5 text-[12.5px] hover:bg-crm-hover truncate">
                {r.name}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default function CrmTaskDialog({
  target,
  team,
  canEdit,
  defaultOwnerId,
  onClose,
  onSaved,
  onOpenContact,
  onOpenCompany,
}: {
  target: TaskDialogTarget;
  /** People this session may give the task to. */
  team: CrmTeamMember[];
  canEdit: boolean;
  defaultOwnerId: string;
  onClose: () => void;
  onSaved: () => void;
  onOpenContact: (contactId: string, dealId?: string | null) => void;
  onOpenCompany: (companyId: string) => void;
}) {
  const { options } = useCatalog();
  const editing = "id" in target ? target.id : null;
  const draft = "draft" in target ? target.draft : {};
  const [loaded, setLoaded] = useState<{ task: CrmTask; events: CrmTaskEvent[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("tarefa");
  const [priority, setPriority] = useState("media");
  const [status, setStatus] = useState<CrmTaskStatus>("pendente");
  const [date, setDate] = useState(draft.date ?? "");
  const [time, setTime] = useState(draft.time ?? "");
  const [reminder, setReminder] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [description, setDescription] = useState("");
  const [result, setResult] = useState("");
  const [link, setLink] = useState<Link>(draft.contactId ? "contato" : draft.companyId ? "empresa" : "contato");
  const [contact, setContact] = useState<Picked | null>(draft.contactId ? { id: draft.contactId, name: draft.contactName ?? "Contato" } : null);
  const [company, setCompany] = useState<Picked | null>(draft.companyId ? { id: draft.companyId, name: draft.companyName ?? "Empresa" } : null);
  const [deals, setDeals] = useState<CrmDeal[]>([]);
  const [dealId, setDealId] = useState(draft.dealId ?? "");

  // Escape closes only this form, not the contact or company panel under it (capture phase, then stop).
  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    }
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  // Editing: load the task and its history, and fill the form.
  useEffect(() => {
    if (!editing) return;
    let cancelled = false;
    fetch(`/api/crm/tasks/${editing}/`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { task?: CrmTask; events?: CrmTaskEvent[]; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !data?.task) return setError(data?.error ?? "Não foi possível abrir a tarefa.");
        const t = data.task;
        setLoaded({ task: t, events: data.events ?? [] });
        setTitle(t.title);
        setKind(t.kind);
        setPriority(t.priority);
        setStatus(t.status);
        setDate(t.dueAt ? spDate(t.dueAt) : "");
        setTime(t.dueAt && !t.allDay ? timeOfDay(t.dueAt) : "");
        setReminder(t.remindMinutes === null ? "" : String(t.remindMinutes));
        setOwnerId(t.ownerId ?? "");
        setDescription(t.description ?? "");
        setResult(t.result ?? "");
      })
      .catch(() => !cancelled && setError("Não foi possível abrir a tarefa."));
    return () => {
      cancelled = true;
    };
  }, [editing]);

  // New task on a contact: offer its opportunities.
  const contactId = editing ? null : link === "contato" ? contact?.id ?? null : null;
  useEffect(() => {
    if (!contactId) return;
    let cancelled = false;
    fetch(`/api/crm/contacts/${contactId}/`)
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { contact?: CrmContactDetail } | null) => !cancelled && setDeals(data?.contact?.deals ?? []))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [contactId]);

  const allDay = !time;
  const reminderChoices: readonly { minutes: number; label: string }[] = allDay ? TASK_REMINDERS_ALL_DAY : TASK_REMINDERS_TIMED;
  const task = loaded?.task ?? null;
  const readOnly = !canEdit;
  const ownerOptions = task?.ownerId && !team.some((m) => m.id === task.ownerId) ? [...team, { id: task.ownerId, name: task.ownerName ?? "Responsável" }] : team;

  function changeTime(next: string) {
    setTime(next);
    // A reminder that doesn't exist for the new kind of day (15 min on an all-day task) goes back to none.
    const list: readonly { minutes: number }[] = !next ? TASK_REMINDERS_ALL_DAY : TASK_REMINDERS_TIMED;
    if (reminder !== "" && !list.some((r) => String(r.minutes) === reminder)) setReminder("");
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (readOnly) return;
    setBusy(true);
    setError(null);
    const due = { dueDate: date || null, dueTime: date ? time || null : null };
    const rem = reminder === "" || !date ? null : Number(reminder);
    let res: Response;
    if (!task) {
      if (link === "contato" && !contact) {
        setBusy(false);
        return setError("Escolha o contato (ou mude para empresa ou atividade interna).");
      }
      if (link === "empresa" && !company) {
        setBusy(false);
        return setError("Escolha a empresa (ou mude para contato ou atividade interna).");
      }
      res = await fetch("/api/crm/tasks/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(link === "contato" ? { contactId: contact!.id, dealId: dealId || null } : link === "empresa" ? { companyId: company!.id } : {}),
          title,
          kind,
          priority,
          description,
          ...due,
          reminder: rem,
          ownerId,
        }),
      });
    } else {
      const patch: Record<string, unknown> = { title, kind, priority, description };
      const before = { date: task.dueAt ? spDate(task.dueAt) : "", time: task.dueAt && !task.allDay ? timeOfDay(task.dueAt) : "" };
      if (before.date !== date || before.time !== (date ? time : "")) Object.assign(patch, due);
      if ((task.remindMinutes === null ? "" : String(task.remindMinutes)) !== (date ? reminder : "")) patch.reminder = rem;
      if ((task.ownerId ?? "") !== ownerId) patch.ownerId = ownerId || null;
      if (status !== task.status) patch.status = status;
      if (status === "concluida") patch.result = result;
      res = await fetch(`/api/crm/tasks/${task.id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(patch) });
    }
    setBusy(false);
    if (!res.ok) return setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
    onSaved();
    onClose();
  }

  const heading = editing ? (task ? task.title : "Tarefa") : "Nova tarefa";

  return (
    <div className="fixed inset-0 z-[55] flex items-start sm:items-center justify-center bg-black/50 px-3 py-4 overflow-y-auto" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={editing ? `Tarefa ${task?.title ?? ""}`.trim() : "Nova tarefa"}
        className="w-full max-w-lg rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-5 shadow-[var(--crm-shadow-lg)] space-y-3.5"
      >
        <div className="flex items-start gap-3">
          <div className="min-w-0 flex-1">
            <h2 className="crm-display text-[17px] break-words">{heading}</h2>
            {task && (
              <p className="text-[11.5px] text-crm-faint">
                Criada {task.createdByName ? `por ${task.createdByName} ` : ""}em {dateTime(task.createdAt)}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar tarefa" className="h-8 w-8 shrink-0 rounded-lg text-crm-dim hover:text-crm-text hover:bg-crm-hover text-[18px] leading-none">
            ×
          </button>
        </div>

        {editing && !task && !error && <p className="text-[12.5px] text-crm-dim">Carregando...</p>}
        {error && (
          <p className={CRM_ALERT} role="alert">
            {error}
          </p>
        )}

        {(!editing || task) && (
          <>
            {/* What the task is about */}
            {task ? (
              <div className="rounded-xl border border-crm-line bg-crm-sunken px-3 py-2.5 text-[12.5px] space-y-1">
                {task.contactId ? (
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="text-crm-dim">Contato:</span>
                    <span className="font-semibold">{task.contactName}</span>
                    <button type="button" className={CRM_LINK_BTN} onClick={() => onOpenContact(task.contactId!, task.dealId)}>
                      Abrir contato
                    </button>
                  </p>
                ) : null}
                {task.companyId ? (
                  <p className="flex flex-wrap items-center gap-x-2">
                    <span className="text-crm-dim">Empresa:</span>
                    <span className="font-semibold">{task.company}</span>
                    <button type="button" className={CRM_LINK_BTN} onClick={() => onOpenCompany(task.companyId!)}>
                      Abrir empresa
                    </button>
                  </p>
                ) : null}
                {task.dealTitle && (
                  <p>
                    <span className="text-crm-dim">Oportunidade:</span> {task.dealTitle}
                  </p>
                )}
                {!task.contactId && !task.companyId && <p className="text-crm-dim">Atividade interna (sem contato nem empresa).</p>}
              </div>
            ) : (
              <fieldset className="space-y-2">
                <legend className={CRM_LABEL}>Relacionada a</legend>
                <div className={`${CRM_SEGMENT_TRACK} w-fit`} role="radiogroup" aria-label="Relacionada a">
                  {(
                    [
                      ["contato", "Contato"],
                      ["empresa", "Empresa"],
                      ["nenhum", "Atividade interna"],
                    ] as const
                  ).map(([id, text]) => (
                    <button key={id} type="button" role="radio" aria-checked={link === id} onClick={() => setLink(id)} className={crmSegment(link === id)}>
                      {text}
                    </button>
                  ))}
                </div>
                {link === "contato" &&
                  (contact ? (
                    <p className="flex items-center gap-2 text-[13px]">
                      <span className="font-semibold truncate">{contact.name}</span>
                      <button type="button" className={CRM_LINK_BTN} onClick={() => (setContact(null), setDeals([]), setDealId(""))}>
                        Trocar
                      </button>
                    </p>
                  ) : (
                    <RecordSearch kind="contato" onPick={setContact} />
                  ))}
                {link === "empresa" &&
                  (company ? (
                    <p className="flex items-center gap-2 text-[13px]">
                      <span className="font-semibold truncate">{company.name}</span>
                      <button type="button" className={CRM_LINK_BTN} onClick={() => setCompany(null)}>
                        Trocar
                      </button>
                    </p>
                  ) : (
                    <RecordSearch kind="empresa" onPick={setCompany} />
                  ))}
                {link === "contato" && contact && deals.length > 0 && (
                  <select value={dealId} onChange={(e) => setDealId(e.target.value)} aria-label="Oportunidade da tarefa" className={CRM_INPUT}>
                    <option value="">Sem oportunidade</option>
                    {deals.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.title}
                      </option>
                    ))}
                  </select>
                )}
              </fieldset>
            )}

            <label className="block">
              <span className={CRM_LABEL}>Título</span>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                disabled={readOnly}
                maxLength={200}
                placeholder="O que fazer (vazio = o nome do tipo)"
                aria-label="Título"
                className={`${CRM_INPUT} mt-1`}
              />
            </label>

            <div className="grid grid-cols-2 gap-2">
              <label className="block">
                <span className={CRM_LABEL}>Tipo</span>
                <select value={kind} onChange={(e) => setKind(e.target.value)} disabled={readOnly} aria-label="Tipo" className={`${CRM_INPUT} mt-1`}>
                  {options("task_kind", task?.kind).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Prioridade</span>
                <select value={priority} onChange={(e) => setPriority(e.target.value)} disabled={readOnly} aria-label="Prioridade" className={`${CRM_INPUT} mt-1`}>
                  {options("priority", task?.priority).map((k) => (
                    <option key={k.id} value={k.id}>
                      {k.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              <label className="block">
                <span className={CRM_LABEL}>Data</span>
                <input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={readOnly} aria-label="Data" className={`${CRM_INPUT} mt-1`} />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Horário</span>
                <input type="time" value={time} onChange={(e) => changeTime(e.target.value)} disabled={readOnly || !date} aria-label="Horário" className={`${CRM_INPUT} mt-1`} />
              </label>
              <label className="block col-span-2 sm:col-span-1">
                <span className={CRM_LABEL}>Lembrete</span>
                <select value={date ? reminder : ""} onChange={(e) => setReminder(e.target.value)} disabled={readOnly || !date} aria-label="Lembrete" className={`${CRM_INPUT} mt-1`}>
                  <option value="">Sem lembrete</option>
                  {reminderChoices.map((r) => (
                    <option key={r.minutes} value={String(r.minutes)}>
                      {r.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <div className={`grid gap-2 ${task ? "grid-cols-2" : "grid-cols-1"}`}>
              <label className="block">
                <span className={CRM_LABEL}>Responsável</span>
                <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} disabled={readOnly} aria-label="Responsável" className={`${CRM_INPUT} mt-1`}>
                  <option value="">Sem responsável</option>
                  {ownerOptions.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
                </select>
              </label>
              {task && (
                <label className="block">
                  <span className={CRM_LABEL}>Situação</span>
                  <select
                    value={status}
                    onChange={(e) => setStatus(e.target.value as CrmTaskStatus)}
                    disabled={readOnly}
                    aria-label="Situação"
                    className={`${CRM_INPUT} mt-1`}
                  >
                    {CRM_TASK_STATUSES.filter((s) => task.status === "cancelada" ? s.id === "cancelada" || s.id === "pendente" : true).map((s) => (
                      <option key={s.id} value={s.id}>
                        {task.status === "cancelada" && s.id === "pendente" ? "Reativar (pendente)" : s.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}
            </div>

            {status === "concluida" && task && (
              <label className="block">
                <span className={CRM_LABEL}>Resultado</span>
                <textarea value={result} onChange={(e) => setResult(e.target.value)} disabled={readOnly} rows={2} aria-label="Resultado" className={`${CRM_INPUT} mt-1`} />
              </label>
            )}

            <label className="block">
              <span className={CRM_LABEL}>Descrição</span>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                disabled={readOnly}
                rows={3}
                maxLength={4000}
                placeholder="Detalhes, pauta, o que levar..."
                aria-label="Descrição"
                className={`${CRM_INPUT} mt-1`}
              />
            </label>

            {loaded && loaded.events.length > 0 && (
              <section aria-label="Histórico da tarefa" className="space-y-1.5">
                <h3 className={CRM_LABEL}>Histórico</h3>
                <ol className="space-y-1 text-[12px]">
                  {loaded.events.map((e) => (
                    <li key={e.id} className="flex gap-2">
                      <span className="shrink-0 text-crm-faint tabular-nums">{dateTime(e.at)}</span>
                      <span className="min-w-0">
                        <span className="text-crm-dim">{e.userName ?? "Sistema"}:</span> {eventText(e)}
                      </span>
                    </li>
                  ))}
                </ol>
              </section>
            )}

            {!readOnly && (
              <div className="flex items-center justify-end gap-2 pt-1">
                <button type="button" onClick={onClose} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
                  Cancelar
                </button>
                <button type="submit" disabled={busy} className={CRM_BTN_PRIMARY}>
                  {task ? "Salvar tarefa" : "Criar tarefa"}
                </button>
              </div>
            )}
          </>
        )}
      </form>
    </div>
  );
}
