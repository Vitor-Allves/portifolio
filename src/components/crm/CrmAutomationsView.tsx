"use client";

// Automações (especificação v1.0, módulo 9) — Administrador: each rule with
// its gatilho, condição, ação, prazo, responsável and situação; turn it on,
// pause, adjust, run the daily check now, and every execution (and failure)
// in the history below. Automations never send messages.

import { useCallback, useEffect, useMemo, useState } from "react";
import { CRM_TEMPERATURES, TASK_REMINDERS_TIMED, type CrmPage, type CrmTeamMember } from "@/lib/crm-types";
import {
  AUTOMATION_DEFS,
  AUTOMATION_STATUSES,
  automationDef,
  type AutomationConfig,
  type AutomationDef,
  type AutomationSchedule,
  type AutomationStatus,
  type CrmAutomation,
  type CrmAutomationRun,
} from "@/lib/crm-automation-defs";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_SEGMENT_TRACK, CRM_TD, CRM_TH, crmSegment } from "./crm-styles";
import { dateTime } from "./crm-format";
import { useCatalog } from "./crm-catalog-context";

const STATUS_TONE: Record<AutomationStatus, string> = {
  ativa: "bg-crm-green/10 text-crm-green border-crm-green/25",
  pausada: "bg-crm-amber/10 text-crm-amber border-crm-amber/30",
  desativada: "bg-crm-sunken text-crm-dim border-crm-line",
};
const RUN_TONE: Record<CrmAutomationRun["status"], string> = { ok: "text-crm-green", ignorada: "text-crm-dim", falha: "text-crm-red" };
const RUN_LABEL: Record<CrmAutomationRun["status"], string> = { ok: "Feito", ignorada: "Ignorada", falha: "Falha" };

async function send(url: string, method: string, body: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  return { ok: res.ok, data: (await res.json().catch(() => null)) as Record<string, unknown> | null };
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Rules about Clientes ativos: the responsible is the client's, not the lead's. */
const CLIENT_RULES: string[] = ["cliente_onboarding", "renovacao_contrato", "cliente_sem_atualizacao"];

/** Prazo, in words. */
function deadline(def: AutomationDef, cfg: AutomationConfig): string {
  if (def.id === "renovacao_contrato") return `${plural(cfg.days ?? 0, "dia", "dias")} antes do fim do contrato`;
  if (def.id === "cliente_sem_atualizacao") return `A partir do dia ${cfg.dayOfMonth ?? 25} do mês (tarefa para o dia)`;
  if (def.fields.includes("dueDays")) return cfg.dueDays ? `Tarefa para ${plural(cfg.dueDays, "dia", "dias")} depois` : "Tarefa para o mesmo dia";
  if (def.fields.includes("days")) return `${plural(cfg.days ?? 0, "dia", "dias")}${def.id === "lead_sem_resposta" ? " sem resposta (tarefa para o dia)" : " parado"}`;
  if (def.fields.includes("reminderMinutes")) return `Lembrete ${TASK_REMINDERS_TIMED.find((r) => r.minutes === cfg.reminderMinutes)?.label.toLowerCase() ?? ""}`;
  return "Na hora";
}

/** Responsável, in words. */
function responsible(def: AutomationDef, cfg: AutomationConfig, team: CrmTeamMember[]): string {
  const name = (id: string | null | undefined) => team.find((m) => m.id === id)?.name ?? "pessoa removida";
  if (def.id === "lead_atribuido") return "O novo responsável do lead";
  if (def.id === "resposta_campanha") return cfg.notifyOwner ? "Aviso para o responsável do lead" : "Sem aviso";
  if (def.id === "reuniao_agendada") return "O responsável da reunião";
  if (CLIENT_RULES.includes(def.id)) return `Responsável pelo cliente (sem responsável: ${cfg.fallbackOwnerId ? name(cfg.fallbackOwnerId) : def.id === "renovacao_contrato" ? "não avisa ninguém" : "ninguém"})`;
  if (!def.fields.includes("owner")) return "—";
  const main = !cfg.owner || cfg.owner === "lead" ? "Responsável do lead" : name(cfg.owner);
  const fallback = cfg.fallbackOwnerId ? name(cfg.fallbackOwnerId) : "ninguém";
  return !cfg.owner || cfg.owner === "lead" ? `${main} (sem responsável: ${fallback})` : main;
}

function ConfigForm({
  def,
  config,
  team,
  onSave,
  onCancel,
}: {
  def: AutomationDef;
  config: AutomationConfig;
  team: CrmTeamMember[];
  onSave: (config: AutomationConfig) => Promise<boolean>;
  onCancel: () => void;
}) {
  const { options } = useCatalog();
  const [draft, setDraft] = useState<AutomationConfig>(config);
  const has = (f: keyof AutomationConfig) => def.fields.includes(f);
  const set = (patch: Partial<AutomationConfig>) => setDraft((d) => ({ ...d, ...patch }));
  const people = (
    <>
      {team.map((m) => (
        <option key={m.id} value={m.id}>
          {m.name}
        </option>
      ))}
    </>
  );
  return (
    <form
      className="mt-3 rounded-xl border border-crm-line bg-crm-sunken p-3 grid gap-2.5 sm:grid-cols-2"
      onSubmit={async (e) => {
        e.preventDefault();
        await onSave(draft);
      }}
      aria-label={`Ajustar ${def.name}`}
    >
      {has("taskKind") && (
        <label className="block">
          <span className={CRM_LABEL}>Tipo de tarefa</span>
          <select value={draft.taskKind} onChange={(e) => set({ taskKind: e.target.value })} aria-label="Tipo de tarefa" className={`${CRM_INPUT} mt-1`}>
            {options("task_kind", config.taskKind).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {has("title") && (
        <label className="block">
          <span className={CRM_LABEL}>Título da tarefa</span>
          <input value={draft.title ?? ""} onChange={(e) => set({ title: e.target.value })} maxLength={200} aria-label="Título da tarefa" className={`${CRM_INPUT} mt-1`} />
        </label>
      )}
      {has("dueDays") && (
        <label className="block">
          <span className={CRM_LABEL}>Prazo (dias depois)</span>
          <input type="number" min={0} max={60} value={draft.dueDays ?? 0} onChange={(e) => set({ dueDays: Number(e.target.value) })} aria-label="Prazo em dias" className={`${CRM_INPUT} mt-1`} />
        </label>
      )}
      {has("dayOfMonth") && (
        <label className="block">
          <span className={CRM_LABEL}>A partir do dia do mês</span>
          <input type="number" min={1} max={28} value={draft.dayOfMonth ?? 25} onChange={(e) => set({ dayOfMonth: Number(e.target.value) })} aria-label="Dia do mês" className={`${CRM_INPUT} mt-1`} />
        </label>
      )}
      {has("days") && (
        <label className="block">
          <span className={CRM_LABEL}>{def.id === "lead_sem_resposta" ? "Dias sem resposta" : def.id === "renovacao_contrato" ? "Dias antes do fim" : "Dias parado"}</span>
          <input type="number" min={1} max={90} value={draft.days ?? 1} onChange={(e) => set({ days: Number(e.target.value) })} aria-label="Dias" className={`${CRM_INPUT} mt-1`} />
        </label>
      )}
      {has("priority") && (
        <label className="block">
          <span className={CRM_LABEL}>Prioridade</span>
          <select value={draft.priority} onChange={(e) => set({ priority: e.target.value })} aria-label="Prioridade" className={`${CRM_INPUT} mt-1`}>
            {options("priority", config.priority).map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {has("reminderMinutes") && (
        <label className="block">
          <span className={CRM_LABEL}>Lembrete</span>
          <select value={String(draft.reminderMinutes ?? 60)} onChange={(e) => set({ reminderMinutes: Number(e.target.value) })} aria-label="Lembrete" className={`${CRM_INPUT} mt-1`}>
            {TASK_REMINDERS_TIMED.map((r) => (
              <option key={r.minutes} value={String(r.minutes)}>
                {r.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {has("owner") && (
        <label className="block">
          <span className={CRM_LABEL}>Responsável</span>
          <select value={draft.owner ?? "lead"} onChange={(e) => set({ owner: e.target.value })} aria-label="Responsável" className={`${CRM_INPUT} mt-1`}>
            <option value="lead">Responsável do lead</option>
            {people}
          </select>
        </label>
      )}
      {has("fallbackOwnerId") && (!draft.owner || draft.owner === "lead") && (
        <label className="block">
          <span className={CRM_LABEL}>{CLIENT_RULES.includes(def.id) ? "Se o cliente não tiver responsável" : "Se o lead não tiver responsável"}</span>
          <select
            value={draft.fallbackOwnerId ?? ""}
            onChange={(e) => set({ fallbackOwnerId: e.target.value || null })}
            aria-label={CLIENT_RULES.includes(def.id) ? "Se o cliente não tiver responsável" : "Se o lead não tiver responsável"}
            className={`${CRM_INPUT} mt-1`}
          >
            <option value="">{def.id === "lead_sem_movimentacao" || def.id === "renovacao_contrato" ? "Não avisar ninguém" : "Deixar sem responsável"}</option>
            {people}
          </select>
        </label>
      )}
      {has("temperature") && (
        <label className="block">
          <span className={CRM_LABEL}>Temperatura</span>
          <select value={draft.temperature ?? ""} onChange={(e) => set({ temperature: e.target.value })} aria-label="Temperatura" className={`${CRM_INPUT} mt-1`}>
            <option value="">Não mudar</option>
            {CRM_TEMPERATURES.map((t) => (
              <option key={t.id} value={t.id}>
                {t.label}
              </option>
            ))}
          </select>
        </label>
      )}
      {has("notifyOwner") && (
        <label className="flex items-center gap-2 text-[13px] self-end pb-2">
          <input type="checkbox" checked={draft.notifyOwner === true} onChange={(e) => set({ notifyOwner: e.target.checked })} className="accent-[var(--crm-accent)]" />
          Avisar o responsável no sino
        </label>
      )}
      {has("sources") && (
        <fieldset className="sm:col-span-2">
          <legend className={CRM_LABEL}>Origens (nenhuma marcada = todas)</legend>
          <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
            {options("source").map((o) => (
              <label key={o.id} className="flex items-center gap-1.5 text-[12.5px]">
                <input
                  type="checkbox"
                  checked={(draft.sources ?? []).includes(o.id)}
                  onChange={(e) => set({ sources: e.target.checked ? [...(draft.sources ?? []), o.id] : (draft.sources ?? []).filter((s) => s !== o.id) })}
                  className="accent-[var(--crm-accent)]"
                />
                {o.label}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <div className="sm:col-span-2 flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
          Cancelar
        </button>
        <button type="submit" className={CRM_BTN_PRIMARY}>
          Salvar ajustes
        </button>
      </div>
    </form>
  );
}

export default function CrmAutomationsView({ team, onOpenContact }: { team: CrmTeamMember[]; onOpenContact: (id: string) => void }) {
  const [data, setData] = useState<{ automations: CrmAutomation[]; schedule: AutomationSchedule } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const [runFilter, setRunFilter] = useState({ automation: "", status: "", page: 1 });
  const [runs, setRuns] = useState<{ key: string; page: CrmPage<CrmAutomationRun> } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/automations/")
      .then(async (res) => {
        const d = (await res.json().catch(() => null)) as { automations?: CrmAutomation[]; schedule?: AutomationSchedule; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !d?.automations || !d.schedule) setError(d?.error ?? "Não foi possível carregar as automações.");
        else setData({ automations: d.automations, schedule: d.schedule });
      })
      .catch(() => !cancelled && setError("Não foi possível carregar as automações."));
    return () => {
      cancelled = true;
    };
  }, [version]);

  const runKey = `${runFilter.automation}|${runFilter.status}|${runFilter.page}|${version}`;
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ page: String(runFilter.page) });
    if (runFilter.automation) qs.set("automation", runFilter.automation);
    if (runFilter.status) qs.set("status", runFilter.status);
    fetch(`/api/crm/automations/runs/?${qs}`)
      .then(async (res) => {
        const page = (await res.json().catch(() => null)) as CrmPage<CrmAutomationRun> | null;
        if (!cancelled && res.ok && page) setRuns({ key: runKey, page });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [runFilter, runKey]);

  const act = useCallback(async (id: string, url: string, method: string, body: unknown, ok: string) => {
    setBusy(id);
    setNotice(null);
    const r = await send(url, method, body);
    setBusy(null);
    if (!r.ok) {
      setError(typeof r.data?.error === "string" ? r.data.error : "Não foi possível salvar.");
      return false;
    }
    setError(null);
    setNotice(ok);
    setVersion((v) => v + 1);
    return true;
  }, []);

  const byId = useMemo(() => new Map((data?.automations ?? []).map((a) => [a.id, a])), [data]);
  const pages = runs ? Math.max(1, Math.ceil(runs.page.total / runs.page.pageSize)) : 1;

  return (
    <section aria-label="Automações" className="space-y-4 max-w-5xl">
      <div className="rounded-xl border border-crm-line bg-crm-card px-4 py-3 text-[12.5px] text-crm-dim space-y-1 shadow-[var(--crm-shadow)]">
        <p>
          <strong className="text-crm-text">Nenhuma automação envia mensagem.</strong> Elas criam tarefas, lembretes, linhas no histórico e avisos no sino, e
          nunca repetem a mesma ação para o mesmo lead.
        </p>
        {data && (
          <p>
            Verificação diária (automações 3 e 6):{" "}
            {data.schedule.configured ? (
              <span className="text-crm-green">agendada no servidor.</span>
            ) : (
              <span className="text-crm-amber">ainda não agendada no servidor. Até lá, elas rodam quando você clicar em Rodar agora.</span>
            )}
          </p>
        )}
      </div>
      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}
      {notice && (
        <p className="rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green" role="status">
          {notice}
        </p>
      )}
      {!data && !error && <p className="text-[12.5px] text-crm-dim">Carregando...</p>}

      {data && (
        <ul className="space-y-3" aria-label="Lista de automações">
          {AUTOMATION_DEFS.map((def) => {
            const a = byId.get(def.id);
            if (!a) return null;
            return (
              <li key={def.id} className={`rounded-2xl border border-crm-line bg-crm-card px-4 py-3.5 shadow-[var(--crm-shadow)] ${def.available ? "" : "opacity-70"}`}>
                <section aria-label={def.name}>
                  <div className="flex flex-wrap items-start gap-2">
                    <div className="min-w-0 flex-1">
                      <h2 className="text-[14px] font-semibold">
                        <span className="text-crm-faint tabular-nums">{def.number}.</span> {def.name}
                      </h2>
                      {def.available ? (
                        <span className={`mt-1 inline-flex rounded-full border px-2 py-px text-[11px] font-medium ${STATUS_TONE[a.status]}`}>
                          {AUTOMATION_STATUSES.find((s) => s.id === a.status)?.label}
                        </span>
                      ) : (
                        <span className="mt-1 inline-flex rounded-full border border-crm-line px-2 py-px text-[11px] text-crm-dim">Disponível na Fase 5 (clientes ativos)</span>
                      )}
                    </div>
                    {def.available && (
                      <div className={CRM_SEGMENT_TRACK} role="radiogroup" aria-label={`Situação de ${def.name}`}>
                        {AUTOMATION_STATUSES.map((s) => (
                          <button
                            key={s.id}
                            type="button"
                            role="radio"
                            aria-checked={a.status === s.id}
                            disabled={busy === def.id}
                            onClick={() => a.status !== s.id && void act(def.id, `/api/crm/automations/${def.id}/`, "PATCH", { status: s.id }, `"${def.name}": ${s.label.toLowerCase()}.`)}
                            className={crmSegment(a.status === s.id)}
                          >
                            {s.id === "ativa" ? "Ativar" : s.id === "pausada" ? "Pausar" : "Desativar"}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <dl className="mt-2.5 grid gap-x-4 gap-y-1.5 text-[12.5px] sm:grid-cols-[110px_minmax(0,1fr)]">
                    <dt className="text-crm-faint">Gatilho</dt>
                    <dd>{def.trigger}</dd>
                    <dt className="text-crm-faint">Condição</dt>
                    <dd>{def.condition}</dd>
                    <dt className="text-crm-faint">Ação</dt>
                    <dd>{def.action}</dd>
                    {def.available && (
                      <>
                        <dt className="text-crm-faint">Prazo</dt>
                        <dd>{deadline(def, a.config)}</dd>
                        <dt className="text-crm-faint">Responsável</dt>
                        <dd>{responsible(def, a.config, team)}</dd>
                      </>
                    )}
                  </dl>
                  {def.available && (
                    <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-crm-dim">
                      {def.fields.length > 0 && editing !== def.id && (
                        <button type="button" className={CRM_LINK_BTN} onClick={() => setEditing(def.id)}>
                          Ajustar
                        </button>
                      )}
                      {def.scheduled && (
                        <>
                          <span>
                            Última verificação:{" "}
                            {a.lastRunAt
                              ? `${dateTime(a.lastRunAt)}${a.lastRunSummary ? ` · ${plural(a.lastRunSummary.ok, "feita", "feitas")}, ${plural(a.lastRunSummary.failed, "falha", "falhas")}${a.lastRunSummary.more ? " (continua na próxima)" : ""}` : ""}`
                              : "nunca"}
                          </span>
                          {a.status === "ativa" && (
                            <button
                              type="button"
                              className={CRM_BTN_OUTLINE}
                              disabled={busy === def.id}
                              onClick={async () => {
                                setBusy(def.id);
                                setNotice(null);
                                const r = await send("/api/crm/automations/run/", "POST", { id: def.id });
                                setBusy(null);
                                if (!r.ok) return setError(typeof r.data?.error === "string" ? r.data.error : "Não foi possível rodar.");
                                const s = (r.data?.results as Record<string, { ok: number; ignored: number; failed: number; more: boolean }> | undefined)?.[def.id];
                                setError(null);
                                setNotice(
                                  s
                                    ? `"${def.name}": ${plural(s.ok, "ação feita", "ações feitas")}${s.ignored ? `, ${plural(s.ignored, "ignorada", "ignoradas")}` : ""}${s.failed ? `, ${plural(s.failed, "falha", "falhas")}` : ""}${s.more ? " — há mais; rode de novo." : "."}`
                                    : `"${def.name}" não está ativa.`
                                );
                                setVersion((v) => v + 1);
                              }}
                            >
                              {busy === def.id ? "Rodando..." : "Rodar agora"}
                            </button>
                          )}
                        </>
                      )}
                      {a.updatedByName && <span className="text-crm-faint">Alterada por {a.updatedByName} em {dateTime(a.updatedAt)}</span>}
                    </div>
                  )}
                  {editing === def.id && (
                    <ConfigForm
                      def={def}
                      config={a.config}
                      team={team}
                      onCancel={() => setEditing(null)}
                      onSave={async (config) => {
                        const ok = await act(def.id, `/api/crm/automations/${def.id}/`, "PATCH", { config }, `"${def.name}": ajustes salvos.`);
                        if (ok) setEditing(null);
                        return ok;
                      }}
                    />
                  )}
                </section>
              </li>
            );
          })}
        </ul>
      )}

      <section aria-label="Histórico de execuções" className="space-y-2">
        <h2 className="text-[14px] font-semibold">Histórico de execuções</h2>
        <div className="flex flex-wrap items-center gap-2">
          <select value={runFilter.automation} onChange={(e) => setRunFilter({ ...runFilter, automation: e.target.value, page: 1 })} aria-label="Automação" className={`${CRM_FILTER} max-w-full`}>
            <option value="">Todas as automações</option>
            {AUTOMATION_DEFS.filter((d) => d.available).map((d) => (
              <option key={d.id} value={d.id}>
                {d.number}. {d.name}
              </option>
            ))}
          </select>
          <select value={runFilter.status} onChange={(e) => setRunFilter({ ...runFilter, status: e.target.value, page: 1 })} aria-label="Resultado" className={CRM_FILTER}>
            <option value="">Todos os resultados</option>
            <option value="ok">Feito</option>
            <option value="ignorada">Ignorada</option>
            <option value="falha">Falha</option>
          </select>
          <span className="text-[12px] text-crm-dim" aria-live="polite">
            {runs ? plural(runs.page.total, "execução", "execuções") : "Carregando..."}
          </span>
        </div>
        {/* relative: keeps any visually-hidden content inside the scroll box on phones */}
        <div className={`relative rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-x-auto ${runs?.key !== runKey ? "opacity-60" : ""}`}>
          <table className="w-full text-[12.5px]">
            <thead className="bg-crm-sunken border-b border-crm-line">
              <tr>
                <th className={CRM_TH}>Quando</th>
                <th className={CRM_TH}>Automação</th>
                <th className={CRM_TH}>Registro</th>
                <th className={CRM_TH}>Resultado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crm-line">
              {runs?.page.rows.length === 0 && (
                <tr>
                  <td colSpan={4} className={`${CRM_TD} text-crm-dim`}>
                    Nenhuma execução com esses filtros.
                  </td>
                </tr>
              )}
              {runs?.page.rows.map((r) => (
                <tr key={r.id}>
                  <td className={`${CRM_TD} whitespace-nowrap text-crm-dim`}>{dateTime(r.at)}</td>
                  <td className={`${CRM_TD} min-w-[160px]`}>{automationDef(r.automationId)?.name ?? r.automationId}</td>
                  <td className={CRM_TD}>
                    {r.contactId ? (
                      <button type="button" onClick={() => onOpenContact(r.contactId!)} className="text-left font-semibold hover:underline">
                        {r.contactName ?? "Contato"}
                      </button>
                    ) : (
                      <span className="text-crm-faint">—</span>
                    )}
                  </td>
                  <td className={`${CRM_TD} min-w-[220px]`}>
                    <span className={`font-semibold ${RUN_TONE[r.status]}`}>{RUN_LABEL[r.status]}</span>
                    {r.detail && <span className="block text-crm-dim">{r.detail}</span>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {pages > 1 && (
          <nav aria-label="Páginas" className="flex items-center justify-end gap-3 text-[12px] text-crm-dim">
            <span>
              Página {runFilter.page} de {pages}
            </span>
            <button type="button" disabled={runFilter.page <= 1} onClick={() => setRunFilter({ ...runFilter, page: runFilter.page - 1 })} className={`${CRM_BTN_OUTLINE} disabled:opacity-40`}>
              ← Anterior
            </button>
            <button type="button" disabled={runFilter.page >= pages} onClick={() => setRunFilter({ ...runFilter, page: runFilter.page + 1 })} className={`${CRM_BTN_OUTLINE} disabled:opacity-40`}>
              Próxima →
            </button>
          </nav>
        )}
      </section>
    </section>
  );
}
