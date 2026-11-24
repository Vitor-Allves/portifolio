"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CRM_CLIENT_STATUSES,
  CRM_CONTRACT_BILLINGS,
  CRM_CONTRACT_STATUSES,
  contractStatusLabel,
  formatBRL,
  monthLabel,
  monthTitle,
  type CrmClientDetail,
  type CrmClientReport,
  type CrmContract,
  type CrmTeamMember,
} from "@/lib/crm-types";
import type { CrmCapabilities } from "@/lib/crm-permissions";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_SEGMENT_TRACK, crmSegment } from "./crm-styles";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";
import { TagChips, useCatalog } from "./crm-catalog-context";
import { brDay, centsToInput } from "./crm-fields";
import { dateTime, todaySp } from "./crm-format";
import { shiftMonth } from "./CrmFollowUpView";
import { ClientStatusChip, clientEventText, contractDue, contractValue } from "./crm-client-ui";

type Form = { ownerId: string; status: string; endReason: string; startedOn: string; notes: string };
export type ClientTab = "cliente" | "acompanhamento" | "historico";

async function send(url: string, method: string, body: unknown): Promise<{ client?: CrmClientDetail; error?: string }> {
  const res = await fetch(url, { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { client?: CrmClientDetail; error?: string } | null;
  if (!res.ok) return { error: data?.error ?? "Não foi possível salvar." };
  return data ?? {};
}

export default function CrmClientPanel({
  clientId,
  team,
  currentUserId,
  caps,
  onClose,
  onOpenContact,
  onOpenCompany,
  onChanged,
  initialTab = "cliente",
  initialMonth,
}: {
  clientId: string;
  team: CrmTeamMember[];
  currentUserId: string;
  caps: CrmCapabilities;
  onClose: () => void;
  onOpenContact: (id: string) => void;
  onOpenCompany: (id: string) => void;
  onChanged: () => void;
  initialTab?: ClientTab;
  /** "YYYY-MM": the acompanhamento month to open on. */
  initialMonth?: string;
}) {
  const { label } = useCatalog();
  const [tab, setTab] = useState<ClientTab>(initialTab);
  const [client, setClient] = useState<CrmClientDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [form, setForm] = useState<Form | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState<string | "new" | null>(null);
  const [note, setNote] = useState("");
  const canEdit = caps.editClients;

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/clients/${clientId}/`);
    const body = (await res.json().catch(() => null)) as { client?: CrmClientDetail; error?: string } | null;
    if (!res.ok || !body?.client) {
      setLoadError(body?.error ?? "Não foi possível abrir o cliente.");
      return;
    }
    setClient(body.client);
  }, [clientId]);

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
    form ?? (client ? { ownerId: client.ownerId ?? "", status: client.status, endReason: "", startedOn: client.startedOn ?? "", notes: client.notes ?? "" } : null);
  const edit = (changes: Partial<Form>) => {
    if (!fields) return;
    setForm({ ...fields, ...changes });
    setSaved(false);
  };
  // Without the right to reassign, the picker offers only oneself (and whoever has it now).
  const owners = caps.assignAnyOwner ? team : team.filter((m) => m.id === currentUserId || m.id === client?.ownerId);

  function applied(r: { client?: CrmClientDetail; error?: string }): boolean {
    if (r.error) {
      setError(r.error);
      return false;
    }
    setError(null);
    if (r.client) setClient(r.client);
    onChanged();
    return true;
  }

  async function save() {
    if (!form || !client) return;
    const body: Record<string, unknown> = { startedOn: form.startedOn || null, notes: form.notes };
    if ((form.ownerId || null) !== client.ownerId) body.ownerId = form.ownerId || null;
    if (form.status !== client.status) {
      body.status = form.status;
      if (form.status === "encerrado") body.endReason = form.endReason;
    }
    if (form.status === "encerrado" && client.status !== "encerrado" && !window.confirm("Encerrar este cliente? Os contratos vigentes serão encerrados e a empresa vira Ex-cliente.")) return;
    if (applied(await send(`/api/crm/clients/${clientId}/`, "PATCH", body))) {
      setForm(null);
      setSaved(true);
    }
  }

  async function addNote() {
    if (!note.trim()) return;
    if (applied(await send(`/api/crm/clients/${clientId}/notes/`, "POST", { text: note }))) setNote("");
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={client ? `Cliente ${client.companyName}` : "Cliente"}
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-[560px] bg-crm-raised text-crm-text border-l border-crm-line shadow-[var(--crm-shadow-lg)] flex flex-col"
      >
        {!client || !fields ? (
          <div className="p-6 flex-1 flex flex-col">
            <button type="button" onClick={onClose} className="self-start text-[12.5px] text-crm-dim hover:text-crm-text">
              ← Fechar
            </button>
            <div className="flex-1 flex flex-col items-center justify-center gap-3 text-center">
              <Mascot name={loadError ? "titanDoubt" : "titanLoading"} decorative className={`h-36 w-auto ${loadError ? "" : "animate-pulse"}`} />
              <p className={`text-[13px] ${loadError ? "text-crm-red" : "text-crm-dim"}`}>{loadError ?? "Carregando cliente..."}</p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-5 pt-4 pb-3 border-b border-crm-line flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className={CRM_LABEL}>Cliente ativo</p>
                <h2 className="text-[16px] font-semibold truncate">{client.companyName}</h2>
                <p className="mt-1 flex flex-wrap items-center gap-1.5">
                  <ClientStatusChip value={client.status} />
                  {client.ownerName && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-crm-dim">
                      <OwnerAvatar name={client.ownerName} />
                      {client.ownerName}
                    </span>
                  )}
                  <TagChips ids={client.tagIds} max={4} />
                </p>
                <p className="mt-1 text-[12px] text-crm-dim">
                  {client.startedOn ? `Cliente desde ${brDay(client.startedOn)}` : "Sem data de início"}
                  {client.monthlyCents !== null ? ` · ${formatBRL(client.monthlyCents)}/mês vigente` : ""}
                  {client.status === "encerrado" && client.endedOn ? ` · encerrado em ${brDay(client.endedOn)}${client.endReason ? ` (${client.endReason})` : ""}` : ""}
                </p>
                <button type="button" onClick={() => onOpenCompany(client.companyId)} className={`${CRM_LINK_BTN} mt-1`}>
                  Abrir empresa
                </button>
                <div className={`${CRM_SEGMENT_TRACK} w-fit mt-2`} role="tablist" aria-label="Seções do cliente">
                  {(
                    [
                      ["cliente", "Cliente"],
                      ["acompanhamento", "Acompanhamento"],
                      ["historico", "Histórico"],
                    ] as [ClientTab, string][]
                  ).map(([id, text]) => (
                    <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className={crmSegment(tab === id)}>
                      {text}
                    </button>
                  ))}
                </div>
              </div>
              <button type="button" onClick={onClose} aria-label="Fechar painel" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
                ×
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {error && (
                <p className={CRM_ALERT} role="alert">
                  {error}
                </p>
              )}

              {tab === "acompanhamento" && (
                <ReportsTab
                  client={client}
                  team={owners}
                  canEdit={canEdit}
                  initialMonth={initialMonth}
                  onSave={async (body) => applied(await send(`/api/crm/clients/${clientId}/reports/`, "POST", body))}
                />
              )}

              {tab === "cliente" && (
                <>
                  <section className="space-y-2" aria-label="Dados do cliente">
                    <h3 className={CRM_LABEL}>Situação e responsável</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      <label className="block min-w-0">
                        <span className={CRM_LABEL}>Situação</span>
                        <select value={fields.status} disabled={!canEdit} onChange={(e) => edit({ status: e.target.value })} aria-label="Situação do cliente" className={`${CRM_INPUT} mt-1`}>
                          {CRM_CLIENT_STATUSES.map((s) => (
                            <option key={s.id} value={s.id}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block min-w-0">
                        <span className={CRM_LABEL}>Responsável</span>
                        <select value={fields.ownerId} disabled={!canEdit} onChange={(e) => edit({ ownerId: e.target.value })} aria-label="Responsável pelo cliente" className={`${CRM_INPUT} mt-1`}>
                          <option value="">Sem responsável</option>
                          {owners.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="block min-w-0">
                        <span className={CRM_LABEL}>Cliente desde</span>
                        <input type="date" value={fields.startedOn} disabled={!canEdit} onChange={(e) => edit({ startedOn: e.target.value })} aria-label="Cliente desde" className={`${CRM_INPUT} mt-1`} />
                      </label>
                    </div>
                    {fields.status === "encerrado" && client.status !== "encerrado" && (
                      <input
                        value={fields.endReason}
                        onChange={(e) => edit({ endReason: e.target.value })}
                        maxLength={300}
                        aria-label="Motivo do encerramento"
                        placeholder="Motivo do encerramento (obrigatório)"
                        className={CRM_INPUT}
                      />
                    )}
                    <textarea
                      value={fields.notes}
                      disabled={!canEdit}
                      onChange={(e) => edit({ notes: e.target.value })}
                      rows={3}
                      maxLength={2000}
                      aria-label="Observações do cliente"
                      placeholder="Observações (como gosta de ser atendido, acessos combinados, particularidades...)"
                      className={CRM_INPUT}
                    />
                    {canEdit && (
                      <div className="flex items-center gap-3">
                        <button type="button" disabled={!form} onClick={() => void save()} className={CRM_LINK_BTN}>
                          Salvar cliente
                        </button>
                        {form && (
                          <button type="button" onClick={() => setForm(null)} className="text-[12.5px] text-crm-dim hover:text-crm-text">
                            Desfazer
                          </button>
                        )}
                        {saved && <span className="text-[12px] text-crm-green">Salvo</span>}
                      </div>
                    )}
                  </section>

                  <section className="space-y-2" aria-label="Decisores">
                    <h3 className={CRM_LABEL}>Contatos decisores</h3>
                    {client.decisionMakers.length === 0 ? (
                      <p className="text-[12.5px] text-crm-dim">Nenhum decisor marcado. Marque no contato → Detalhes → &quot;Decisor na empresa&quot;.</p>
                    ) : (
                      <p className="flex flex-wrap gap-1.5">
                        {client.decisionMakers.map((d) => (
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

                  <section className="space-y-2" aria-label="Contratos">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className={CRM_LABEL}>Contratos e serviços</h3>
                      {canEdit && editing !== "new" && (
                        <button type="button" onClick={() => setEditing("new")} className={CRM_LINK_BTN}>
                          + Novo contrato
                        </button>
                      )}
                    </div>
                    {editing === "new" && (
                      <ContractForm
                        contract={null}
                        showValues={caps.seeContractValues}
                        onCancel={() => setEditing(null)}
                        onSave={async (body) => {
                          if (applied(await send(`/api/crm/clients/${clientId}/contracts/`, "POST", body))) setEditing(null);
                        }}
                      />
                    )}
                    {client.contracts.length === 0 && editing !== "new" ? (
                      <p className="text-[12.5px] text-crm-dim">Nenhum contrato registrado. Registre os serviços, a vigência e o valor.</p>
                    ) : (
                      <ul className="space-y-2">
                        {client.contracts.map((k) =>
                          editing === k.id ? (
                            <li key={k.id}>
                              <ContractForm
                                contract={k}
                                showValues={caps.seeContractValues}
                                onCancel={() => setEditing(null)}
                                onSave={async (body) => {
                                  if (applied(await send(`/api/crm/clients/${clientId}/contracts/${k.id}/`, "PATCH", body))) setEditing(null);
                                }}
                              />
                            </li>
                          ) : (
                            <li key={k.id} className={`rounded-xl border px-3 py-2.5 ${k.status === "vigente" ? "border-crm-line bg-crm-card" : "border-crm-line bg-crm-sunken"}`}>
                              <div className="flex flex-wrap items-start gap-x-3 gap-y-1">
                                <span className="min-w-0 flex-1 basis-52">
                                  <span className="block text-[13px] font-semibold">{k.services.map((s) => label("service", s)).join(", ") || "Sem serviço"}</span>
                                  <span className="block text-[11.5px] text-crm-dim">
                                    {brDay(k.startsOn)} → {k.endsOn ? brDay(k.endsOn) : "sem prazo"}
                                    {k.valueCents !== null ? ` · ${contractValue(k.valueCents, k.billing)}` : ""}
                                    {k.dealTitle ? ` · da oportunidade “${k.dealTitle}”` : ""}
                                  </span>
                                  {k.notes && <span className="block text-[11.5px] text-crm-faint whitespace-pre-wrap">{k.notes}</span>}
                                </span>
                                <span className="text-right">
                                  <span className="block text-[11.5px] font-semibold">{contractStatusLabel(k.status)}</span>
                                  {k.status === "vigente" && <span className={`block text-[11.5px] ${contractDue(k.daysLeft, k.endsOn).tone}`}>{contractDue(k.daysLeft, k.endsOn).text}</span>}
                                </span>
                              </div>
                              {canEdit && editing === null && (
                                <button type="button" onClick={() => setEditing(k.id)} className={`${CRM_LINK_BTN} mt-1`} aria-label={`Editar contrato de ${brDay(k.startsOn)}`}>
                                  Editar
                                </button>
                              )}
                            </li>
                          )
                        )}
                      </ul>
                    )}
                    {!caps.seeContractValues && <p className="text-[11.5px] text-crm-faint">Seu perfil não vê os valores dos contratos.</p>}
                  </section>
                </>
              )}

              {tab === "historico" && (
                <section className="space-y-2" aria-label="Histórico do cliente">
                  <h3 className={CRM_LABEL}>Histórico de relacionamento</h3>
                  {canEdit && (
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        void addNote();
                      }}
                      className="space-y-1.5"
                    >
                      <textarea
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        rows={2}
                        maxLength={2000}
                        aria-label="Registrar no histórico"
                        placeholder="Reunião de alinhamento, pedido do cliente, reclamação, elogio..."
                        className={CRM_INPUT}
                      />
                      <button type="submit" disabled={!note.trim()} className={CRM_LINK_BTN}>
                        Registrar no histórico
                      </button>
                    </form>
                  )}
                  <ol className="space-y-2">
                    {client.events.map((e) => (
                      <li key={e.id} className="border-l-2 border-crm-line pl-3">
                        <p className={`text-[12.5px] ${e.kind === "note" ? "text-crm-text whitespace-pre-wrap" : "text-crm-dim"}`}>{clientEventText(e)}</p>
                        <p className="text-[10.5px] text-crm-faint">
                          {e.userName ?? "Sistema"} · {dateTime(e.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              )}
            </div>
          </>
        )}
      </aside>
    </>
  );
}

/** New contract, or editing one: services, period, value (when allowed to see it), billing, situation and notes. */
function ContractForm({
  contract,
  showValues,
  onCancel,
  onSave,
}: {
  contract: CrmContract | null;
  showValues: boolean;
  onCancel: () => void;
  onSave: (body: Record<string, unknown>) => Promise<void>;
}) {
  const { options, label } = useCatalog();
  const [services, setServices] = useState<string[]>(contract?.services ?? []);
  const [startsOn, setStartsOn] = useState(contract?.startsOn ?? "");
  const [endsOn, setEndsOn] = useState(contract?.endsOn ?? "");
  const [value, setValue] = useState(centsToInput(contract?.valueCents ?? null));
  const [billing, setBilling] = useState<string>(contract?.billing ?? "mensal");
  const [status, setStatus] = useState<string>(contract?.status ?? "vigente");
  const [notes, setNotes] = useState(contract?.notes ?? "");
  const [busy, setBusy] = useState(false);
  const list = options("service", null);
  // A service the contract already has stays listed even if it was archived.
  const extra = (contract?.services ?? []).filter((id) => !list.some((o) => o.id === id));

  return (
    <form
      aria-label={contract ? "Editar contrato" : "Novo contrato"}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const body: Record<string, unknown> = { services, startsOn, endsOn: endsOn || null, billing, notes };
        if (showValues) body.value = value;
        if (contract) body.status = status;
        await onSave(body);
        setBusy(false);
      }}
      className="rounded-xl border border-crm-accent/30 bg-crm-accent/[0.04] p-3 space-y-2"
    >
      <fieldset>
        <legend className={CRM_LABEL}>Serviços contratados</legend>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {[...list.map((o) => ({ id: o.id, label: o.label })), ...extra.map((id) => ({ id, label: label("service", id) }))].map((o) => (
            <label key={o.id} className="inline-flex items-center gap-1.5 text-[12.5px]">
              <input
                type="checkbox"
                checked={services.includes(o.id)}
                onChange={(e) => setServices((prev) => (e.target.checked ? [...prev, o.id] : prev.filter((x) => x !== o.id)))}
              />
              {o.label}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <label className="block min-w-0">
          <span className={CRM_LABEL}>Início</span>
          <input type="date" required value={startsOn} onChange={(e) => setStartsOn(e.target.value)} aria-label="Início do contrato" className={`${CRM_INPUT} mt-1`} />
        </label>
        <label className="block min-w-0">
          <span className={CRM_LABEL}>Fim</span>
          <input type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} aria-label="Fim do contrato" className={`${CRM_INPUT} mt-1`} />
        </label>
        {showValues && (
          <label className="block min-w-0">
            <span className={CRM_LABEL}>Valor (R$)</span>
            <input value={value} onChange={(e) => setValue(e.target.value)} inputMode="decimal" placeholder="0,00" aria-label="Valor do contrato" className={`${CRM_INPUT} mt-1`} />
          </label>
        )}
        <label className="block min-w-0">
          <span className={CRM_LABEL}>Cobrança</span>
          <select value={billing} onChange={(e) => setBilling(e.target.value)} aria-label="Cobrança" className={`${CRM_INPUT} mt-1`}>
            {CRM_CONTRACT_BILLINGS.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
        {contract && (
          <label className="block min-w-0">
            <span className={CRM_LABEL}>Situação</span>
            <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação do contrato" className={`${CRM_INPUT} mt-1`}>
              {CRM_CONTRACT_STATUSES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                </option>
              ))}
            </select>
          </label>
        )}
      </div>
      <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} maxLength={1000} aria-label="Observações do contrato" placeholder="Observações do contrato (reajuste, multa, entregas...)" className={CRM_INPUT} />
      <p className="text-[11px] text-crm-faint">Sem data de fim = contrato sem prazo. Contratos não são apagados: encerre ou cancele.</p>
      <div className="flex gap-2">
        <button type="submit" disabled={busy || services.length === 0 || !startsOn} className={CRM_BTN_PRIMARY}>
          {busy ? "Salvando..." : contract ? "Salvar contrato" : "Registrar contrato"}
        </button>
        <button type="button" onClick={onCancel} className={CRM_BTN_OUTLINE}>
          Cancelar
        </button>
      </div>
    </form>
  );
}

/**
 * Acompanhamento mensal: pick the month (from the client's start, up to this
 * month), register or edit it, and see every month registered.
 */
function ReportsTab({
  client,
  team,
  canEdit,
  initialMonth,
  onSave,
}: {
  client: CrmClientDetail;
  team: CrmTeamMember[];
  canEdit: boolean;
  initialMonth?: string;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { label } = useCatalog();
  const thisMonth = todaySp().slice(0, 7);
  const [month, setMonth] = useState(initialMonth && initialMonth <= thisMonth ? initialMonth : thisMonth);
  const report = client.reports.find((r) => r.month === month) ?? null;
  // Months to choose: from the client's start (at most 24 back), plus any month already registered.
  const start = client.startedOn ? client.startedOn.slice(0, 7) : shiftMonth(thisMonth, -11);
  const months: string[] = [];
  for (let m = thisMonth; m >= start && months.length < 24; m = shiftMonth(m, -1)) months.push(m);
  for (const r of client.reports) if (!months.includes(r.month)) months.push(r.month);
  if (!months.includes(month)) months.push(month);
  months.sort().reverse();

  return (
    <div className="space-y-5">
      <section aria-label="Acompanhamento do mês" className="space-y-2">
        <div className="flex flex-wrap items-end gap-2">
          <label className="block min-w-0">
            <span className={CRM_LABEL}>Mês de referência</span>
            <select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="Mês de referência" className={`${CRM_INPUT} mt-1`}>
              {months.map((m) => (
                <option key={m} value={m}>
                  {monthTitle(m)}
                  {client.reports.some((r) => r.month === m) ? " ✓" : ""}
                </option>
              ))}
            </select>
          </label>
          <p className="text-[11.5px] text-crm-dim pb-2">
            {report ? `Atualizado por ${report.updatedByName ?? "—"} em ${dateTime(report.updatedAt)}` : "Ainda não registrado neste mês."}
          </p>
        </div>
        <ReportForm key={month} client={client} month={month} report={report} team={team} canEdit={canEdit} onSave={onSave} />
      </section>

      <section aria-label="Meses registrados" className="space-y-2">
        <h3 className={CRM_LABEL}>Histórico mensal</h3>
        {client.reports.length === 0 ? (
          <p className="text-[12.5px] text-crm-dim">Nenhum mês registrado ainda.</p>
        ) : (
          <ol className="space-y-2">
            {client.reports.map((r) => (
              <li key={r.id}>
                <button
                  type="button"
                  onClick={() => setMonth(r.month)}
                  aria-pressed={r.month === month}
                  className={`w-full text-left rounded-xl border px-3 py-2.5 ${r.month === month ? "border-crm-accent bg-crm-accent/[0.05]" : "border-crm-line bg-crm-card hover:border-crm-line-strong"}`}
                >
                  <span className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-[13px] font-semibold">{monthTitle(r.month)}</span>
                    <span className="text-[11px] text-crm-faint">
                      {r.ownerName ? `${r.ownerName} · ` : ""}
                      {dateTime(r.updatedAt)}
                    </span>
                  </span>
                  {r.services.length > 0 && <span className="block text-[11.5px] text-crm-dim">{r.services.map((sv) => label("service", sv)).join(", ")}</span>}
                  {r.results && <span className="block text-[12px] mt-0.5 line-clamp-2">Resultados: {r.results}</span>}
                  {r.attention && <span className="block text-[12px] text-crm-amber line-clamp-2">Atenção: {r.attention}</span>}
                </button>
              </li>
            ))}
          </ol>
        )}
      </section>
    </div>
  );
}

function ReportForm({
  client,
  month,
  report,
  team,
  canEdit,
  onSave,
}: {
  client: CrmClientDetail;
  month: string;
  report: CrmClientReport | null;
  team: CrmTeamMember[];
  canEdit: boolean;
  onSave: (body: Record<string, unknown>) => Promise<boolean>;
}) {
  const { options, label } = useCatalog();
  // A new month starts with the services of the vigente contracts.
  const [services, setServices] = useState<string[]>(report?.services ?? client.services);
  const [activities, setActivities] = useState(report?.activities ?? "");
  const [results, setResults] = useState(report?.results ?? "");
  const [attention, setAttention] = useState(report?.attention ?? "");
  const [nextActions, setNextActions] = useState(report?.nextActions ?? "");
  const [ownerId, setOwnerId] = useState(report ? (report.ownerId ?? "") : (client.ownerId ?? ""));
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const list = options("service", null);
  const extra = [...new Set([...services, ...(report?.services ?? [])])].filter((id) => !list.some((o) => o.id === id));
  const ownerChoices = team.some((m) => m.id === ownerId) || !ownerId ? team : [...team, { id: ownerId, name: report?.ownerName ?? client.ownerName ?? "—" } as CrmTeamMember];
  const field = (value: string, set: (v: string) => void, title: string, placeholder: string) => (
    <label className="block">
      <span className={CRM_LABEL}>{title}</span>
      <textarea
        value={value}
        disabled={!canEdit}
        onChange={(e) => (set(e.target.value), setSaved(false))}
        rows={3}
        maxLength={4000}
        aria-label={title}
        placeholder={placeholder}
        className={`${CRM_INPUT} mt-1`}
      />
    </label>
  );

  return (
    <form
      aria-label={`Acompanhamento de ${monthLabel(month)}`}
      onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true);
        const ok = await onSave({ month, services, activities, results, attention, nextActions, ownerId: ownerId || null, expectedUpdatedAt: report?.updatedAt ?? null });
        setBusy(false);
        if (ok) setSaved(true);
      }}
      className="space-y-2.5 rounded-xl border border-crm-line bg-crm-card p-3"
    >
      <fieldset>
        <legend className={CRM_LABEL}>Serviços realizados</legend>
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {[...list.map((o) => ({ id: o.id, label: o.label })), ...extra.map((id) => ({ id, label: label("service", id) }))].map((o) => (
            <label key={o.id} className="inline-flex items-center gap-1.5 text-[12.5px]">
              <input
                type="checkbox"
                disabled={!canEdit}
                checked={services.includes(o.id)}
                onChange={(e) => (setServices((prev) => (e.target.checked ? [...prev, o.id] : prev.filter((x) => x !== o.id))), setSaved(false))}
              />
              {o.label}
            </label>
          ))}
          {list.length === 0 && extra.length === 0 && <span className="text-[12px] text-crm-faint">Nenhum serviço na Personalização.</span>}
        </div>
      </fieldset>
      {field(activities, setActivities, "Atividades executadas", "O que foi feito no mês: campanhas, posts, reuniões, ajustes...")}
      {field(results, setResults, "Resultados", "Números e conquistas do mês: leads, vendas, alcance, custo por resultado...")}
      {field(attention, setAttention, "Pontos de atenção", "Riscos, insatisfações, pendências do cliente...")}
      {field(nextActions, setNextActions, "Próximas ações", "O que vem no próximo mês")}
      <label className="block max-w-xs">
        <span className={CRM_LABEL}>Responsável pelo acompanhamento</span>
        <select value={ownerId} disabled={!canEdit} onChange={(e) => (setOwnerId(e.target.value), setSaved(false))} aria-label="Responsável pelo acompanhamento" className={`${CRM_INPUT} mt-1`}>
          <option value="">Sem responsável</option>
          {ownerChoices.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
      </label>
      {canEdit && (
        <div className="flex items-center gap-3">
          <button type="submit" disabled={busy} className={CRM_BTN_PRIMARY}>
            {busy ? "Salvando..." : report ? "Salvar alterações" : "Registrar acompanhamento"}
          </button>
          {saved && <span className="text-[12px] text-crm-green">Salvo</span>}
        </div>
      )}
    </form>
  );
}
