"use client";

import { useCallback, useEffect, useState } from "react";
import {
  BR_STATES,
  CRM_COMPANY_STATUSES,
  formatBRL,
  formatCnpj,
  formatPhone,
  isClosedStage,
  stageLabel,
  type CrmCompanyDetail,
  type CrmTask,
  type CrmTeamMember,
} from "@/lib/crm-types";
import type { CrmCapabilities } from "@/lib/crm-permissions";
import { CRM_ALERT, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, STAGE_DOT } from "./crm-styles";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";
import { SegmentSelect, TagChips, useCatalog } from "./crm-catalog-context";
import CrmTagsEditor from "./CrmTagsEditor";
import { CompanyStatusChip, TemperatureChip } from "./crm-fields";
import { TASK_STATE_TONE, shortDate, taskDueLabel, taskState } from "./crm-format";
import { TaskKindChip, type TaskDraft } from "./CrmTaskDialog";

type Form = {
  name: string;
  legalName: string;
  cnpj: string;
  segment: string;
  city: string;
  state: string;
  address: string;
  website: string;
  notes: string;
  ownerId: string;
  status: string;
};

export default function CrmCompanyPanel({
  companyId,
  team,
  currentUserId,
  caps,
  version,
  onClose,
  onOpenContact,
  onOpenTask,
  onNewTask,
  onChanged,
}: {
  companyId: string;
  team: CrmTeamMember[];
  currentUserId: string;
  caps: CrmCapabilities;
  /** Bumped after any change (e.g. a task saved in the task form): reload the tasks. */
  version: number;
  onClose: () => void;
  onOpenContact: (id: string) => void;
  onOpenTask: (taskId: string) => void;
  onNewTask: (draft: TaskDraft) => void;
  onChanged: () => void;
}) {
  const { label } = useCatalog();
  const [company, setCompany] = useState<CrmCompanyDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const canEdit = caps.editContacts;
  const [tasks, setTasks] = useState<CrmTask[] | null>(null);

  // Pending tasks on the company itself and on its contacts.
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/tasks/?status=pending&owner=all&companyId=${encodeURIComponent(companyId)}`)
      .then(async (res) => {
        const list = res.ok ? ((await res.json()) as { tasks: CrmTask[] }).tasks : [];
        if (!cancelled) setTasks(list);
      })
      .catch(() => !cancelled && setTasks([]));
    return () => {
      cancelled = true;
    };
  }, [companyId, version]);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/companies/${companyId}/`);
    if (!res.ok) {
      setLoadError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível abrir a empresa.");
      return;
    }
    setCompany(((await res.json()) as { company: CrmCompanyDetail }).company);
  }, [companyId]);

  useEffect(() => {
    let cancelled = false;
    const run = () => {
      if (!cancelled) void load();
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [load]);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const fields: Form | null =
    form ??
    (company
      ? {
          name: company.name,
          legalName: company.legalName ?? "",
          cnpj: formatCnpj(company.cnpj),
          segment: company.segment ?? "",
          city: company.city ?? "",
          state: company.state ?? "",
          address: company.address ?? "",
          website: company.website ?? "",
          notes: company.notes ?? "",
          ownerId: company.ownerId ?? "",
          status: company.status ?? "",
        }
      : null);
  const edit = (changes: Partial<Form>) => {
    if (!fields) return;
    setForm({ ...fields, ...changes });
    setSaved(false);
  };
  // Without the right to reassign, the account-owner picker offers only oneself (and whoever has it now).
  const owners = caps.assignAnyOwner ? team : team.filter((m) => m.id === currentUserId || m.id === company?.ownerId);

  async function save() {
    if (!form || !company) return;
    const body: Record<string, unknown> = { ...form, ownerId: form.ownerId || null, status: form.status || null };
    // Send the owner only when it changed (the server checks who may change it).
    if ((form.ownerId || null) === company.ownerId) delete body.ownerId;
    const res = await fetch(`/api/crm/companies/${companyId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.");
      return;
    }
    setError(null);
    setForm(null);
    setSaved(true);
    await load();
    onChanged();
  }

  const openDeals = company?.deals.filter((d) => !isClosedStage(d.stage)) ?? [];
  const closedDeals = company?.deals.filter((d) => isClosedStage(d.stage)) ?? [];

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={company ? `Empresa ${company.name}` : "Empresa"}
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-[540px] bg-crm-raised text-crm-text border-l border-crm-line shadow-[var(--crm-shadow-lg)] flex flex-col"
      >
        {!company || !fields ? (
          <div className="p-6 flex-1 flex flex-col">
            <button type="button" onClick={onClose} className="self-start text-[12.5px] text-crm-dim hover:text-crm-text">
              ← Fechar
            </button>
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <Mascot name={loadError ? "titanDoubt" : "titanLoading"} decorative className={`h-36 w-auto ${loadError ? "" : "animate-pulse"}`} />
              <p className={`text-[13px] ${loadError ? "text-crm-red" : "text-crm-dim"}`}>{loadError ?? "Carregando empresa..."}</p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-5 pt-4 pb-3 border-b border-crm-line flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <span className="h-10 w-10 shrink-0 rounded-xl bg-crm-navy text-white flex items-center justify-center ring-2 ring-crm-silver/50" aria-hidden="true">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M4 21V5l8-3 8 3v16h-6v-5h-4v5H4Zm4-12h2V7H8v2Zm0 4h2v-2H8v2Zm6-4h2V7h-2v2Zm0 4h2v-2h-2v2Z" />
                  </svg>
                </span>
                <div className="min-w-0">
                  <h2 className="text-[16px] font-semibold truncate">{company.name}</h2>
                  <p className="text-[12px] text-crm-dim truncate">
                    {[company.legalName, company.cnpj ? `CNPJ ${formatCnpj(company.cnpj)}` : null].filter(Boolean).join(" · ") ||
                      `${company.contactCount} contato${company.contactCount === 1 ? "" : "s"}`}
                  </p>
                  <p className="mt-1 flex flex-wrap items-center gap-1.5">
                    <CompanyStatusChip value={company.status} />
                    {company.ownerName && (
                      <span className="inline-flex items-center gap-1 text-[11.5px] text-crm-dim">
                        <OwnerAvatar name={company.ownerName} />
                        {company.ownerName}
                      </span>
                    )}
                    <TagChips ids={company.tagIds} max={3} />
                  </p>
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar painel" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
                ×
              </button>
            </header>
            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              <section className="space-y-2">
                <h3 className={CRM_LABEL}>Dados da empresa</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="block">
                    <span className={CRM_LABEL}>Nome (fantasia)</span>
                    <input value={fields.name} onChange={(e) => edit({ name: e.target.value })} aria-label="Nome da empresa" placeholder="Nome" className={`${CRM_INPUT} mt-1`} />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Razão social</span>
                    <input value={fields.legalName} onChange={(e) => edit({ legalName: e.target.value })} aria-label="Razão social" placeholder="Como no cartão CNPJ" className={`${CRM_INPUT} mt-1`} />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>CNPJ</span>
                    <input value={fields.cnpj} onChange={(e) => edit({ cnpj: e.target.value })} aria-label="CNPJ" placeholder="00.000.000/0000-00" className={`${CRM_INPUT} mt-1`} />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Situação comercial</span>
                    <select value={fields.status} onChange={(e) => edit({ status: e.target.value })} aria-label="Situação comercial" className={`${CRM_INPUT} mt-1`}>
                      <option value="">Não definida</option>
                      {CRM_COMPANY_STATUSES.map((st) => (
                        <option key={st.id} value={st.id}>
                          {st.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Responsável pela conta</span>
                    <select value={fields.ownerId} onChange={(e) => edit({ ownerId: e.target.value })} aria-label="Responsável pela conta" className={`${CRM_INPUT} mt-1`}>
                      <option value="">Sem responsável</option>
                      {owners.map((m) => (
                        <option key={m.id} value={m.id}>
                          {m.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Segmento</span>
                    <SegmentSelect value={fields.segment} onChange={(v) => edit({ segment: v })} className={`${CRM_INPUT} mt-1`} />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Cidade</span>
                    <input value={fields.city} onChange={(e) => edit({ city: e.target.value })} aria-label="Cidade" placeholder="Cidade" className={`${CRM_INPUT} mt-1`} />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Estado</span>
                    <select value={fields.state} onChange={(e) => edit({ state: e.target.value })} aria-label="Estado" className={`${CRM_INPUT} mt-1`}>
                      <option value="">—</option>
                      {BR_STATES.map((uf) => (
                        <option key={uf} value={uf}>
                          {uf}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <input value={fields.address} onChange={(e) => edit({ address: e.target.value })} aria-label="Endereço" placeholder="Endereço (rua, número, bairro)" className={CRM_INPUT} />
                <input value={fields.website} onChange={(e) => edit({ website: e.target.value })} aria-label="Site" placeholder="Site" className={CRM_INPUT} />
                <textarea value={fields.notes} onChange={(e) => edit({ notes: e.target.value })} rows={3} aria-label="Observações da empresa" placeholder="Observações" className={CRM_INPUT} />
                {error && (
                  <p className={CRM_ALERT} role="alert">
                    {error}
                  </p>
                )}
                {canEdit && (
                  <div className="flex items-center gap-3">
                    <button type="button" disabled={!form} onClick={() => void save()} className={CRM_LINK_BTN}>
                      Salvar empresa
                    </button>
                    {saved && <span className="text-[12px] text-crm-green">Salvo</span>}
                    {company.website && /^https?:\/\//i.test(company.website) && (
                      <a href={company.website} target="_blank" rel="noreferrer" className="ml-auto text-[12.5px] text-crm-accent underline">
                        Abrir site
                      </a>
                    )}
                  </div>
                )}
                <p className="text-[11.5px] text-crm-faint">Segmento e cidade valem para todos os contatos desta empresa. O CNPJ não se repete: uma empresa por CNPJ.</p>
              </section>

              <CrmTagsEditor
                links={company.tagLinks}
                endpoint={`/api/crm/companies/${company.id}/tags/`}
                canEdit={canEdit}
                onChanged={() => {
                  void load();
                  onChanged();
                }}
              />

              <section className="space-y-2">
                <h3 className={CRM_LABEL}>Decisores</h3>
                {company.decisionMakers.length === 0 ? (
                  <p className="text-[12.5px] text-crm-dim">Nenhum decisor marcado. Marque em Detalhes do contato → &quot;Decisor na empresa&quot;.</p>
                ) : (
                  <p className="flex flex-wrap gap-1.5">
                    {company.decisionMakers.map((d) => (
                      <button
                        key={d.id}
                        type="button"
                        onClick={() => onOpenContact(d.id)}
                        className="text-[12px] font-semibold px-2.5 py-1 rounded-full bg-crm-violet/10 text-crm-violet border border-crm-violet/25 hover:opacity-80"
                      >
                        {d.name}
                      </button>
                    ))}
                  </p>
                )}
              </section>

              <section className="space-y-2">
                <h3 className={CRM_LABEL}>Contatos</h3>
                {company.contacts.length === 0 ? (
                  <p className="text-[12.5px] text-crm-dim">Nenhum contato ativo nesta empresa.</p>
                ) : (
                  <ul className="divide-y divide-crm-line rounded-xl border border-crm-line">
                    {company.contacts.map((c) => (
                      <li key={c.id}>
                        <button type="button" onClick={() => onOpenContact(c.id)} className="w-full text-left flex items-center gap-3 px-3 py-2.5 hover:bg-crm-hover">
                          <OwnerAvatar name={c.ownerName} />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-[13px] font-semibold min-w-0">
                              <span className="truncate">
                                {c.name}
                                {c.jobTitle ? <span className="font-normal text-crm-dim"> · {c.jobTitle}</span> : null}
                              </span>
                              {c.isDecisionMaker && (
                                <span className="shrink-0 text-[10px] font-semibold px-1.5 py-px rounded-full bg-crm-violet/10 text-crm-violet border border-crm-violet/25">Decisor</span>
                              )}
                              <TemperatureChip value={c.temperature} />
                            </span>
                            <span className="block text-[11.5px] text-crm-faint truncate">{c.phone ? formatPhone(c.phone) : c.email}</span>
                          </span>
                          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-crm-dim whitespace-nowrap">
                            <span className={`h-2 w-2 rounded-full ${STAGE_DOT[c.stage]}`} aria-hidden="true" />
                            {stageLabel(c.stage)}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2" aria-label="Tarefas da empresa">
                <div className="flex items-center justify-between gap-2">
                  <h3 className={CRM_LABEL}>Tarefas</h3>
                  {caps.editPipeline && (
                    <button type="button" className={CRM_LINK_BTN} onClick={() => onNewTask({ companyId: company.id, companyName: company.name })}>
                      + Nova tarefa
                    </button>
                  )}
                </div>
                {tasks === null ? (
                  <p className="text-[12.5px] text-crm-dim">Carregando...</p>
                ) : tasks.length === 0 ? (
                  <p className="text-[12.5px] text-crm-dim">Nenhuma tarefa pendente.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {tasks.map((t) => (
                      <li key={t.id}>
                        <button
                          type="button"
                          onClick={() => onOpenTask(t.id)}
                          className="w-full text-left flex items-center gap-3 rounded-xl border border-crm-line bg-crm-card px-3 py-2 hover:border-crm-line-strong"
                        >
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold truncate">{t.title}</span>
                            <span className="flex items-center gap-1.5 text-[11.5px] text-crm-dim min-w-0">
                              <TaskKindChip kind={t.kind} small />
                              <span className="truncate">{t.contactName ?? "Da empresa"}</span>
                            </span>
                          </span>
                          <span className={`text-[12px] font-medium whitespace-nowrap ${TASK_STATE_TONE[taskState(t.dueAt, t.allDay)]}`}>{taskDueLabel(t.dueAt, t.allDay)}</span>
                          <OwnerAvatar name={t.ownerName} />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>

              <section className="space-y-2">
                <h3 className={CRM_LABEL}>Oportunidades</h3>
                {company.deals.length === 0 ? (
                  <p className="text-[12.5px] text-crm-dim">Nenhuma oportunidade ainda.</p>
                ) : (
                  <ul className="space-y-1.5" aria-label="Oportunidades da empresa">
                    {[...openDeals, ...closedDeals].map((d) => (
                      <li key={d.id}>
                        <button
                          type="button"
                          onClick={() => onOpenContact(d.contactId)}
                          className="w-full text-left flex items-center gap-3 rounded-xl border border-crm-line bg-crm-card px-3 py-2 hover:border-crm-line-strong"
                        >
                          <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${STAGE_DOT[d.stage]}`} aria-hidden="true" />
                          <span className="min-w-0 flex-1">
                            <span className="block text-[13px] font-semibold truncate">{d.title}</span>
                            <span className="block text-[11.5px] text-crm-dim truncate">
                              {stageLabel(d.stage)} · {d.contactName}
                              {d.service ? ` · ${label("service", d.service)}` : ""}
                              {d.stage === "ganho" && d.wonReason ? ` · ${label("won_reason", d.wonReason)}` : ""}
                              {d.stage === "perdido" && d.lostReason ? ` · ${label("lost_reason", d.lostReason)}` : ""}
                              {isClosedStage(d.stage) && d.closedAt ? ` · ${shortDate(d.closedAt)}` : ""}
                            </span>
                          </span>
                          <span className="text-[13px] font-semibold tabular-nums whitespace-nowrap">{formatBRL(d.negotiatedCents ?? d.valueCents)}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </>
        )}
      </aside>
    </>
  );
}
