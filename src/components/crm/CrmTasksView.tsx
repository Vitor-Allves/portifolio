"use client";

import { useEffect, useState } from "react";
import { formatPhone, type CrmContactCard, type CrmTask, type CrmTeamMember } from "@/lib/crm-types";
import { CRM_BTN_PRIMARY, CRM_FILTER, CRM_SEGMENT_TRACK, crmSegment, taskKindIcon } from "./crm-styles";
import { TASK_STATE_TONE, dateTime, relativeTime, taskDueLabel, taskState, type TaskState } from "./crm-format";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";
import { PriorityChip, type TaskDraft } from "./CrmTaskDialog";

const GROUPS: { id: TaskState; label: string }[] = [
  { id: "overdue", label: "Atrasadas" },
  { id: "today", label: "Hoje" },
  { id: "soon", label: "Próximos 7 dias" },
  { id: "later", label: "Mais adiante" },
  { id: "none", label: "Sem data" },
];

export function TaskRow({
  task,
  now,
  onOpen,
  onDone,
  busy,
  showContact = true,
}: {
  task: CrmTask;
  now: number;
  onOpen?: () => void;
  onDone?: () => void;
  busy?: boolean;
  showContact?: boolean;
}) {
  const { label } = useCatalog();
  const state = taskState(task.dueAt, task.allDay, now);
  return (
    <div className="flex items-start gap-3 px-4 py-2.5">
      {onDone && (
        <button
          type="button"
          onClick={onDone}
          disabled={busy}
          aria-label={`Concluir: ${task.title}`}
          title="Concluir"
          className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-crm-line-strong hover:border-crm-green hover:bg-crm-green/10 transition-colors disabled:opacity-40"
        />
      )}
      <button type="button" onClick={onOpen} disabled={!onOpen} className="min-w-0 flex-1 text-left">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold text-crm-text">
          <span aria-hidden="true" className="text-crm-faint w-4 text-center">
            {taskKindIcon(task.kind)}
          </span>
          <span className="sr-only">{label("task_kind", task.kind)}:</span>
          <span className="truncate">{task.title}</span>
        </span>
        {showContact && (
          <span className="block pl-[22px] text-[12px] text-crm-dim truncate">
            {task.contactName ?? task.company ?? "Atividade interna"}
            {task.contactName && task.company ? ` · ${task.company}` : ""}
            {task.dealTitle && task.dealTitle !== task.company ? ` · ${task.dealTitle}` : ""}
          </span>
        )}
        <span className="flex flex-wrap items-center gap-1.5 pl-[22px] mt-0.5">
          {task.priority !== "media" && <PriorityChip priority={task.priority} />}
          {task.status === "em_andamento" && <span className="text-[10.5px] font-medium text-crm-accent">Em andamento</span>}
        </span>
      </button>
      <span className={`shrink-0 text-[12px] font-medium whitespace-nowrap ${task.doneAt ? "text-crm-faint" : TASK_STATE_TONE[state]}`}>
        {task.doneAt ? `Concluída ${dateTime(task.doneAt)}` : taskDueLabel(task.dueAt, task.allDay, now)}
      </span>
      <OwnerAvatar name={task.ownerName} />
    </div>
  );
}

export default function CrmTasksView({
  tasks,
  inbox,
  team,
  currentUserId,
  now,
  canComplete,
  version,
  onOpenContact,
  onOpenTask,
  onNewTask,
  onChanged,
}: {
  tasks: CrmTask[];
  inbox: CrmContactCard[];
  team: CrmTeamMember[];
  currentUserId: string;
  now: number;
  /** Profiles that can't touch the funnel (Marketing) see tasks without the "concluir" box. */
  canComplete: boolean;
  version: number;
  onOpenContact: (contactId: string, tab?: "conversa" | "negocio") => void;
  onOpenTask: (taskId: string) => void;
  onNewTask: (draft: TaskDraft) => void;
  onChanged: () => void;
}) {
  const { options } = useCatalog();
  const [owner, setOwner] = useState("all");
  const [kind, setKind] = useState("");
  const [priority, setPriority] = useState("");
  const [status, setStatus] = useState<"pending" | "em_andamento" | "done">("pending");
  const [done, setDone] = useState<{ key: number; tasks: CrmTask[] } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Finished tasks aren't on the board's list: fetched when that tab opens (the latest 1000).
  useEffect(() => {
    if (status !== "done") return;
    let cancelled = false;
    fetch("/api/crm/tasks/?status=done&owner=all")
      .then(async (res) => {
        const list = res.ok ? ((await res.json()) as { tasks: CrmTask[] }).tasks : [];
        if (!cancelled) setDone({ key: version, tasks: list });
      })
      .catch(() => !cancelled && setDone({ key: version, tasks: [] }));
    return () => {
      cancelled = true;
    };
  }, [status, version]);

  const mine = (t: CrmTask) =>
    owner === "all" ? true : owner === "mine" ? t.ownerId === currentUserId : owner === "none" ? !t.ownerId : t.ownerId === owner;
  const source = status === "done" ? (done?.tasks ?? []) : tasks;
  const visible = source.filter(
    (t) => mine(t) && (!kind || t.kind === kind) && (!priority || t.priority === priority) && (status !== "em_andamento" || t.status === "em_andamento")
  );

  async function complete(t: CrmTask) {
    setBusy(t.id);
    const res = await fetch(`/api/crm/tasks/${t.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ done: true }),
    });
    setBusy(null);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível concluir.");
      return;
    }
    setError(null);
    onChanged();
  }

  return (
    <section aria-label="Tarefas" className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap items-center gap-2">
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Tarefas de" className={CRM_FILTER}>
          <option value="all">Tarefas de todos</option>
          <option value="mine">Minhas tarefas</option>
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
        <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridade" className={CRM_FILTER}>
          <option value="">Todas as prioridades</option>
          {options("priority").map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        {canComplete && (
          <button type="button" onClick={() => onNewTask({})} className={`${CRM_BTN_PRIMARY} ml-auto`}>
            + Nova tarefa
          </button>
        )}
      </div>
      <div className={`${CRM_SEGMENT_TRACK} w-fit`} role="tablist" aria-label="Situação">
        {(
          [
            ["pending", "Pendentes"],
            ["em_andamento", "Em andamento"],
            ["done", "Concluídas"],
          ] as const
        ).map(([id, text]) => (
          <button key={id} type="button" role="tab" aria-selected={status === id} onClick={() => setStatus(id)} className={crmSegment(status === id)}>
            {text}
          </button>
        ))}
      </div>
      {error && <p className="text-[12.5px] text-crm-red">{error}</p>}

      {inbox.length > 0 && status === "pending" && (
        <section aria-label="Mensagens sem resposta" className="rounded-2xl border border-crm-accent/30 bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden">
          <header className="px-4 py-2.5 border-b border-crm-line flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-crm-accent" aria-hidden="true" />
            <h2 className="text-[13px] font-semibold">Mensagens sem resposta</h2>
            <span className="text-[11.5px] text-crm-dim">{inbox.length}</span>
          </header>
          <ul className="divide-y divide-crm-line">
            {inbox.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenContact(c.id, "conversa")} className="w-full text-left flex items-center gap-3 px-4 py-2.5 hover:bg-crm-hover">
                  <span className="min-w-[20px] h-5 px-1 rounded-full bg-crm-accent text-crm-on-accent text-[11px] font-semibold flex items-center justify-center">
                    {c.unreadCount}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">
                      {c.name}
                      {c.company ? <span className="font-normal text-crm-dim"> · {c.company}</span> : null}
                    </span>
                    <span className="block text-[12px] text-crm-dim truncate">{c.lastMessagePreview ?? (c.phone ? formatPhone(c.phone) : "")}</span>
                  </span>
                  <span className="text-[11.5px] text-crm-faint whitespace-nowrap">{c.lastMessageAt ? relativeTime(c.lastMessageAt, now) : ""}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      {status === "done" ? (
        <section aria-label="Concluídas" className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden">
          {done?.key !== version ? (
            <p className="px-4 py-4 text-[12.5px] text-crm-dim">Carregando...</p>
          ) : visible.length === 0 ? (
            <p className="px-4 py-4 text-[12.5px] text-crm-faint">Nenhuma tarefa concluída com esses filtros.</p>
          ) : (
            <ul className="divide-y divide-crm-line">
              {visible.map((t) => (
                <li key={t.id} className="hover:bg-crm-hover transition-colors">
                  <TaskRow task={t} now={now} onOpen={() => onOpenTask(t.id)} />
                </li>
              ))}
            </ul>
          )}
        </section>
      ) : visible.length === 0 ? (
        <div className="flex items-end justify-between gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 overflow-hidden">
          <div className="pb-6">
            <p className="crm-display text-[17px] mb-1">Tudo em dia</p>
            <p className="text-[12.5px] text-crm-dim">
              Nenhuma tarefa {status === "em_andamento" ? "em andamento" : "pendente"}
              {owner === "mine" ? " sua" : ""}
              {kind || priority ? " com esses filtros" : ""}. Agende o próximo passo de cada negócio no painel do contato ou em + Nova tarefa.
            </p>
          </div>
          <Mascot name="titanWin" decorative className="h-28 w-auto shrink-0" />
        </div>
      ) : (
        GROUPS.map((g) => {
          const items = visible.filter((t) => taskState(t.dueAt, t.allDay, now) === g.id);
          if (items.length === 0) return null;
          return (
            <section key={g.id} aria-label={g.label} className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden">
              <header className="px-4 py-2.5 border-b border-crm-line flex items-center gap-2">
                <h2 className={`text-[13px] font-semibold ${g.id === "overdue" ? "text-crm-red" : g.id === "today" ? "text-crm-amber" : "text-crm-text"}`}>{g.label}</h2>
                <span className="text-[11.5px] text-crm-dim">{items.length}</span>
              </header>
              <ul className="divide-y divide-crm-line">
                {items.map((t) => (
                  <li key={t.id} className="hover:bg-crm-hover transition-colors">
                    <TaskRow task={t} now={now} busy={busy === t.id} onDone={canComplete ? () => void complete(t) : undefined} onOpen={() => onOpenTask(t.id)} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}
    </section>
  );
}
