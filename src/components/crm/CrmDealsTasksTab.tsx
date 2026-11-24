"use client";

import { useState, type FormEvent } from "react";
import {
  STAGE_REQUIREMENTS,
  TASK_REMINDERS_ALL_DAY,
  TASK_REMINDERS_TIMED,
  formatBRL,
  isClosedStage,
  stageLabel,
  type CrmStageRequirement,
  type CrmContactDetail,
  type CrmDeal,
  type CrmTask,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, STAGE_DOT, taskKindIcon } from "./crm-styles";
import { TASK_STATE_TONE, shortDate, spDate, taskDueLabel, taskState, timeOfDay } from "./crm-format";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { useCatalog } from "./crm-catalog-context";
import { ServiceSelect, TemperatureSelect, centsToInput } from "./crm-fields";

type Send = (url: string, method: "POST" | "PATCH", body: Record<string, unknown>) => Promise<boolean>;

type DealForm = {
  title: string;
  value: string;
  negotiated: string;
  close: string;
  service: string;
  source: string;
  temperature: string;
};

function DealEditor({ deal, send }: { deal: CrmDeal; send: Send }) {
  const { options } = useCatalog();
  const [form, setForm] = useState<DealForm | null>(null);
  const f: DealForm = form ?? {
    title: deal.title,
    value: centsToInput(deal.valueCents),
    negotiated: centsToInput(deal.negotiatedCents),
    close: deal.expectedCloseAt ? spDate(deal.expectedCloseAt) : "",
    service: deal.service ?? "",
    source: deal.source,
    temperature: deal.temperature ?? "",
  };
  const required = STAGE_REQUIREMENTS[deal.stage] ?? [];
  const star = (r: CrmStageRequirement) => (required.includes(r) ? " *" : "");
  return (
    <div className="space-y-2 rounded-xl border border-crm-line bg-crm-sunken p-3">
      <input value={f.title} onChange={(e) => setForm({ ...f, title: e.target.value })} aria-label="Título da oportunidade" placeholder="Título" className={CRM_INPUT} />
      <div className="grid grid-cols-2 gap-2">
        <label className="block">
          <span className={CRM_LABEL}>Valor estimado (R$){star("value")}</span>
          <input value={f.value} onChange={(e) => setForm({ ...f, value: e.target.value })} inputMode="decimal" aria-label="Valor da oportunidade" placeholder="Ex.: 2.500" className={`${CRM_INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={CRM_LABEL}>Valor negociado (R$){star("negotiated")}</span>
          <input value={f.negotiated} onChange={(e) => setForm({ ...f, negotiated: e.target.value })} inputMode="decimal" aria-label="Valor negociado da oportunidade" placeholder="Fechado com o cliente" className={`${CRM_INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={CRM_LABEL}>Serviço{star("service")}</span>
          <ServiceSelect value={f.service} onChange={(v) => setForm({ ...f, service: v })} label="Serviço da oportunidade" className={`${CRM_INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={CRM_LABEL}>
            Previsão<span className="hidden sm:inline"> de fechamento</span>
          </span>
          <input type="date" value={f.close} onChange={(e) => setForm({ ...f, close: e.target.value })} aria-label="Previsão de fechamento" className={`${CRM_INPUT} mt-1`} />
        </label>
        <label className="block">
          <span className={CRM_LABEL}>Origem</span>
          <select value={f.source} onChange={(e) => setForm({ ...f, source: e.target.value })} aria-label="Origem da oportunidade" className={`${CRM_INPUT} mt-1`}>
            {options("source", deal.source).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className={CRM_LABEL}>Temperatura</span>
          <TemperatureSelect
            value={f.temperature}
            onChange={(v) => setForm({ ...f, temperature: v })}
            label="Temperatura da oportunidade"
            emptyLabel="A do contato"
            className={`${CRM_INPUT} mt-1`}
          />
        </label>
      </div>
      {required.length > 0 && <p className="text-[11px] text-crm-faint">* obrigatório em {stageLabel(deal.stage)}</p>}
      <button
        type="button"
        disabled={!form}
        onClick={async () => {
          if (
            form &&
            (await send(`/api/crm/deals/${deal.id}/`, "PATCH", {
              title: form.title,
              value: form.value,
              negotiatedValue: form.negotiated,
              expectedCloseAt: form.close || null,
              service: form.service || null,
              source: form.source,
              temperature: form.temperature || null,
            }))
          )
            setForm(null);
        }}
        className={CRM_LINK_BTN}
      >
        Salvar oportunidade
      </button>
    </div>
  );
}

function PendingTask({
  task,
  now,
  send,
  deals,
  readOnly,
  onOpenTask,
}: {
  task: CrmTask;
  now: number;
  send: Send;
  deals: CrmDeal[];
  readOnly: boolean;
  onOpenTask?: (taskId: string) => void;
}) {
  const { label } = useCatalog();
  const [open, setOpen] = useState(false);
  const [result, setResult] = useState("");
  const [date, setDate] = useState(task.dueAt ? spDate(task.dueAt) : "");
  const [time, setTime] = useState(task.dueAt && !task.allDay ? timeOfDay(task.dueAt) : "");
  const state = taskState(task.dueAt, task.allDay, now);
  const deal = deals.find((d) => d.id === task.dealId);
  return (
    <li className="rounded-xl border border-crm-line bg-crm-card">
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        {!readOnly && (
          <button
            type="button"
            onClick={() => void send(`/api/crm/tasks/${task.id}/`, "PATCH", { done: true })}
            aria-label={`Concluir: ${task.title}`}
            title="Concluir"
            className="mt-0.5 h-5 w-5 shrink-0 rounded-md border-2 border-crm-line-strong hover:border-crm-green hover:bg-crm-green/10 transition-colors"
          />
        )}
        <button type="button" onClick={() => setOpen((v) => !v)} disabled={readOnly} aria-expanded={open} className="min-w-0 flex-1 text-left">
          <span className="block text-[13px] font-semibold truncate">
            <span aria-hidden="true" className="text-crm-faint mr-1">
              {taskKindIcon(task.kind)}
            </span>
            {task.title}
          </span>
          <span className="block text-[11.5px] text-crm-dim truncate">
            {label("task_kind", task.kind)}
            {task.priority !== "media" ? ` · ${label("priority", task.priority)}` : ""}
            {task.status === "em_andamento" ? " · em andamento" : ""}
            {deal ? ` · ${deal.title}` : ""}
          </span>
        </button>
        {onOpenTask && (
          <button type="button" onClick={() => onOpenTask(task.id)} aria-label={`Detalhes: ${task.title}`} className={`${CRM_LINK_BTN} !text-[11.5px] shrink-0`}>
            Detalhes
          </button>
        )}
        <span className={`text-[12px] font-medium whitespace-nowrap ${TASK_STATE_TONE[state]}`}>{taskDueLabel(task.dueAt, task.allDay, now)}</span>
        <OwnerAvatar name={task.ownerName} />
      </div>
      {open && (
        <div className="border-t border-crm-line px-3 py-3 space-y-2">
          <textarea value={result} onChange={(e) => setResult(e.target.value)} rows={2} placeholder="Resultado (ex.: atendeu, pediu proposta até sexta)" aria-label="Resultado da tarefa" className={CRM_INPUT} />
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={() => void send(`/api/crm/tasks/${task.id}/`, "PATCH", { done: true, result })} className={CRM_BTN_PRIMARY}>
              Concluir
            </button>
            <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Nova data" className={`${CRM_INPUT} !w-auto`} />
            <input type="time" value={time} onChange={(e) => setTime(e.target.value)} aria-label="Novo horário" className={`${CRM_INPUT} !w-auto`} />
            <button type="button" onClick={async () => {
                if (await send(`/api/crm/tasks/${task.id}/`, "PATCH", { dueDate: date || null, dueTime: date ? time || null : null })) setOpen(false);
              }} className={CRM_BTN_OUTLINE}>
              Reagendar
            </button>
            <button type="button" onClick={() => void send(`/api/crm/tasks/${task.id}/`, "PATCH", { canceled: true })} className="text-[12px] text-crm-dim hover:text-crm-red ml-auto">
              Cancelar tarefa
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

function NewTaskForm({
  contactId,
  deals,
  defaultDealId,
  team,
  defaultOwnerId,
  send,
}: {
  contactId: string;
  deals: CrmDeal[];
  defaultDealId: string | null;
  team: CrmTeamMember[];
  defaultOwnerId: string;
  send: Send;
}) {
  const { options } = useCatalog();
  const [mode, setMode] = useState<"agendar" | "registrar">("agendar");
  const [kind, setKind] = useState("ligacao");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [ownerId, setOwnerId] = useState(defaultOwnerId);
  const [dealId, setDealId] = useState(defaultDealId ?? "");
  const [priority, setPriority] = useState("media");
  const [reminder, setReminder] = useState("");
  const [result, setResult] = useState("");
  const reminderChoices: readonly { minutes: number; label: string }[] = time ? TASK_REMINDERS_TIMED : TASK_REMINDERS_ALL_DAY;

  async function submit(e: FormEvent) {
    e.preventDefault();
    const ok = await send("/api/crm/tasks/", "POST", {
      contactId,
      dealId: dealId || null,
      kind,
      title,
      ownerId,
      priority,
      ...(mode === "registrar"
        ? { done: true, result }
        : { dueDate: date || null, dueTime: date ? time || null : null, reminder: date && reminder !== "" ? Number(reminder) : null }),
    });
    if (ok) {
      setTitle("");
      setDate("");
      setTime("");
      setReminder("");
      setPriority("media");
      setResult("");
    }
  }

  return (
    <form onSubmit={submit} className="space-y-2 rounded-xl border border-crm-line bg-crm-sunken p-3">
      <div className="flex gap-1" role="tablist" aria-label="Tipo de registro">
        {(
          [
            ["agendar", "Agendar tarefa"],
            ["registrar", "Registrar o que já aconteceu"],
          ] as const
        ).map(([id, label]) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={mode === id}
            onClick={() => setMode(id)}
            className={`text-[12px] px-3 py-1.5 rounded-full transition-colors ${mode === id ? "bg-crm-ink text-crm-on-ink" : "text-crm-dim hover:text-crm-text"}`}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <select value={kind} onChange={(e) => setKind(e.target.value)} aria-label="Tipo" className={CRM_INPUT}>
          {options("task_kind").map((k) => (
            <option key={k.id} value={k.id}>
              {k.label}
            </option>
          ))}
        </select>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder={mode === "agendar" ? "O que fazer (ex.: ligar para fechar)" : "O que foi feito"} aria-label="Título da tarefa" className={`${CRM_INPUT} sm:col-span-2`} />
      </div>
      {mode === "agendar" ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} aria-label="Data da tarefa" className={CRM_INPUT} />
          <input
            type="time"
            value={time}
            onChange={(e) => {
              setTime(e.target.value);
              const list: readonly { minutes: number }[] = e.target.value ? TASK_REMINDERS_TIMED : TASK_REMINDERS_ALL_DAY;
              if (reminder !== "" && !list.some((r) => String(r.minutes) === reminder)) setReminder("");
            }}
            disabled={!date}
            aria-label="Horário da tarefa"
            className={CRM_INPUT}
          />
          <select value={date ? reminder : ""} onChange={(e) => setReminder(e.target.value)} disabled={!date} aria-label="Lembrete da tarefa" className={CRM_INPUT}>
            <option value="">Sem lembrete</option>
            {reminderChoices.map((r) => (
              <option key={r.minutes} value={String(r.minutes)}>
                {r.label}
              </option>
            ))}
          </select>
          <select value={priority} onChange={(e) => setPriority(e.target.value)} aria-label="Prioridade da tarefa" className={CRM_INPUT}>
            {options("priority").map((p) => (
              <option key={p.id} value={p.id}>
                Prioridade {p.label.toLowerCase()}
              </option>
            ))}
          </select>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Responsável pela tarefa" className={CRM_INPUT}>
            <option value="">Sem responsável</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
          <select value={dealId} onChange={(e) => setDealId(e.target.value)} aria-label="Oportunidade da tarefa" className={CRM_INPUT}>
            <option value="">Sem oportunidade</option>
            {deals.map((d) => (
              <option key={d.id} value={d.id}>
                {d.title}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <textarea value={result} onChange={(e) => setResult(e.target.value)} rows={2} placeholder="Como foi (ex.: falei com a sócia, quer proposta para 2 unidades)" aria-label="Resultado da atividade" className={CRM_INPUT} />
      )}
      <button type="submit" className={CRM_BTN_PRIMARY}>
        {mode === "agendar" ? "Agendar" : "Registrar"}
      </button>
    </form>
  );
}

export default function CrmDealsTasksTab({
  detail,
  readOnly,
  team,
  currentUserId,
  selectedDealId,
  onSelectDeal,
  now,
  onReload,
  onOpenTask,
}: {
  detail: CrmContactDetail;
  /** Profiles that can't touch the funnel (Marketing) see opportunities and tasks without editing them. */
  readOnly: boolean;
  team: CrmTeamMember[];
  currentUserId: string;
  selectedDealId: string | null;
  onSelectDeal: (id: string) => void;
  now: number;
  /** Refetch the contact (and the board) after a change. */
  onReload: () => Promise<void>;
  onOpenTask?: (taskId: string) => void;
}) {
  const { label } = useCatalog();
  const [error, setError] = useState<string | null>(null);
  const [newDeal, setNewDeal] = useState<{ title: string; value: string } | null>(null);
  const selected = detail.deals.find((d) => d.id === selectedDealId) ?? null;
  const pending = detail.tasks.filter((t) => !t.doneAt);
  const done = detail.tasks.filter((t) => t.doneAt);

  const send: Send = async (url, method, body) => {
    const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
      return false;
    }
    setError(null);
    await onReload();
    return true;
  };

  return (
    <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}

      <section className="space-y-2">
        <div className="flex items-center justify-between">
          <h3 className={CRM_LABEL}>Oportunidades</h3>
          {!newDeal && !readOnly && (
            <button type="button" onClick={() => setNewDeal({ title: "", value: "" })} className={CRM_LINK_BTN}>
              + Nova oportunidade
            </button>
          )}
        </div>
        {newDeal && (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const res = await fetch("/api/crm/deals/", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ contactId: detail.id, title: newDeal.title, value: newDeal.value }),
              });
              if (!res.ok) {
                setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível criar.");
                return;
              }
              const { id } = (await res.json()) as { id: string };
              setNewDeal(null);
              setError(null);
              await onReload();
              onSelectDeal(id);
            }}
            className="grid grid-cols-1 sm:grid-cols-[1fr_140px_auto] gap-2 rounded-xl border border-crm-line bg-crm-sunken p-3"
          >
            <input value={newDeal.title} onChange={(e) => setNewDeal({ ...newDeal, title: e.target.value })} placeholder={detail.company ?? detail.name} aria-label="Título da nova oportunidade" className={CRM_INPUT} />
            <input value={newDeal.value} onChange={(e) => setNewDeal({ ...newDeal, value: e.target.value })} inputMode="decimal" placeholder="Valor (R$)" aria-label="Valor da nova oportunidade" className={CRM_INPUT} />
            <div className="flex gap-2">
              <button type="submit" className={CRM_BTN_PRIMARY}>
                Criar
              </button>
              <button type="button" onClick={() => setNewDeal(null)} className="text-[12.5px] text-crm-dim hover:text-crm-text px-1">
                Cancelar
              </button>
            </div>
          </form>
        )}
        {detail.deals.length === 0 ? (
          <p className="text-[12.5px] text-crm-dim">Nenhuma oportunidade para este contato ainda.</p>
        ) : (
          <ul className="space-y-1.5">
            {detail.deals.map((d) => (
              <li key={d.id}>
                <button
                  type="button"
                  onClick={() => onSelectDeal(d.id)}
                  aria-pressed={d.id === selectedDealId}
                  className={`w-full text-left flex items-center gap-3 rounded-xl border px-3 py-2 transition-colors ${
                    d.id === selectedDealId ? "border-crm-accent bg-crm-accent/[0.05]" : "border-crm-line bg-crm-card hover:border-crm-line-strong"
                  }`}
                >
                  <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STAGE_DOT[d.stage]}`} aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold truncate">{d.title}</span>
                    <span className="block text-[11.5px] text-crm-dim truncate">
                      {stageLabel(d.stage)}
                      {d.service ? ` · ${label("service", d.service)}` : ""}
                      {d.stage === "perdido" && d.lostReason ? ` · ${label("lost_reason", d.lostReason)}` : ""}
                      {d.stage === "ganho" && d.wonReason ? ` · ${label("won_reason", d.wonReason)}` : ""}
                      {isClosedStage(d.stage) && d.closedAt ? ` · ${shortDate(d.closedAt)}` : ""}
                      {!isClosedStage(d.stage) && d.expectedCloseAt ? ` · previsão ${shortDate(d.expectedCloseAt)}` : ""}
                    </span>
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{formatBRL(d.negotiatedCents ?? d.valueCents)}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
        {selected && !readOnly && <DealEditor key={selected.id} deal={selected} send={send} />}
      </section>

      <section className="space-y-2">
        <h3 className={CRM_LABEL}>Tarefas</h3>
        {!readOnly && (
          <NewTaskForm
            contactId={detail.id}
            deals={detail.deals.filter((d) => !isClosedStage(d.stage) || d.id === selectedDealId)}
            defaultDealId={selectedDealId}
            team={team}
            defaultOwnerId={team.some((m) => m.id === currentUserId) ? currentUserId : ""}
            send={send}
          />
        )}
        {pending.length === 0 ? (
          <p className="text-[12.5px] text-crm-dim">Nenhuma tarefa pendente. Agende o próximo passo acima.</p>
        ) : (
          <ul className="space-y-1.5">
            {pending.map((t) => (
              <PendingTask key={t.id} task={t} now={now} send={send} deals={detail.deals} readOnly={readOnly} onOpenTask={onOpenTask} />
            ))}
          </ul>
        )}
        {done.length > 0 && (
          <details className="pt-1">
            <summary className="cursor-pointer text-[12px] text-crm-dim hover:text-crm-text">Concluídas ({done.length})</summary>
            <ul className="mt-2 space-y-1.5">
              {done.map((t) => (
                <li key={t.id} className="rounded-xl border border-crm-line bg-crm-sunken px-3 py-2">
                  <p className="text-[12.5px] text-crm-dim">
                    <span className="text-crm-green mr-1" aria-hidden="true">
                      ✓
                    </span>
                    <span className="line-through">{t.title}</span> · {label("task_kind", t.kind)}
                  </p>
                  {t.result && <p className="text-[12.5px] text-crm-text mt-0.5 whitespace-pre-wrap">{t.result}</p>}
                  <p className="text-[10.5px] text-crm-faint mt-0.5">
                    {t.doneByName ?? "—"} · {t.doneAt ? shortDate(t.doneAt) : ""}
                  </p>
                </li>
              ))}
            </ul>
          </details>
        )}
      </section>
    </div>
  );
}
