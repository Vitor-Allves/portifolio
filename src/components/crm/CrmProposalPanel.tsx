"use client";

// One proposal (evolução v1.0, item 3): edit it (a sent version is frozen —
// saving makes the next version, with the reason), register how it was sent,
// share the public link, download the PDF, record what the client said by
// other means, authorize a discount (Gestor), and read every version, the
// client's approval evidence and the timeline.

import { useEffect, useMemo, useState } from "react";
import {
  PROPOSAL_BILLING_PERIODS,
  PROPOSAL_CHANNELS,
  PROPOSAL_OPEN,
  PROPOSAL_STATUSES,
  lineNet,
  proposalNumber,
  proposalStatusLabel,
  proposalTotals,
  type CrmProposalDetail,
  type ProposalContent,
  type ProposalItem,
} from "@/lib/crm-proposal-types";
import { formatBRL, parseMoneyToCents } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_SEGMENT_TRACK, crmSegment } from "./crm-styles";
import { TAG_TONE, useCatalog } from "./crm-catalog-context";
import { centsToInput } from "./crm-fields";
import { dateTime } from "./crm-format";

type ItemDraft = {
  serviceId: string | null;
  name: string;
  description: string;
  quantity: string;
  unitValue: string;
  billing: "mensal" | "unico";
  discount: string;
};
type Draft = {
  title: string;
  intro: string;
  issueDate: string;
  validUntil: string;
  dueDate: string;
  paymentTerms: string;
  billingPeriod: string;
  executionTerm: string;
  notes: string;
  items: ItemDraft[];
};

const toItemDraft = (i: ProposalItem): ItemDraft => ({
  serviceId: i.serviceId,
  name: i.name,
  description: i.description ?? "",
  quantity: String(i.quantity).replace(".", ","),
  unitValue: centsToInput(i.unitCents),
  billing: i.billing,
  discount: i.discountPct !== null ? `${String(i.discountPct).replace(".", ",")}%` : i.discountCents ? centsToInput(i.discountCents) : "",
});
const toDraft = (c: ProposalContent): Draft => ({
  title: c.title,
  intro: c.intro ?? "",
  issueDate: c.issueDate,
  validUntil: c.validUntil,
  dueDate: c.dueDate ?? "",
  paymentTerms: c.paymentTerms ?? "",
  billingPeriod: c.billingPeriod,
  executionTerm: c.executionTerm ?? "",
  notes: c.notes ?? "",
  items: c.items.map(toItemDraft),
});

/** The totals as typed (best effort: what doesn't parse counts as zero; the server validates). */
function draftTotals(items: ItemDraft[]) {
  const money = (v: string) => {
    try {
      return parseMoneyToCents(v) ?? 0;
    } catch {
      return 0;
    }
  };
  return proposalTotals(
    items.map((i) => {
      const quantity = Number(i.quantity.replace(",", ".")) || 0;
      const unitCents = money(i.unitValue);
      const gross = Math.round(quantity * unitCents);
      const d = i.discount.trim();
      const discountCents = d.endsWith("%") ? Math.round((gross * (Number(d.slice(0, -1).replace(",", ".")) || 0)) / 100) : money(d);
      return { quantity, unitCents, discountCents, billing: i.billing };
    }),
  );
}

async function call(url: string, method: string, body?: unknown): Promise<{ ok: boolean; data: Record<string, unknown> | null }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as Record<string, unknown> | null;
  return { ok: !!res?.ok, data };
}

const EVENT_TEXT: Record<string, (p: Record<string, unknown>) => string> = {
  created: () => "Proposta criada",
  edited: (p) => `Rascunho alterado (${(p.changes as unknown[] | undefined)?.length ?? 0} mudança(s))`,
  version: (p) => `Nova versão: ${String(p.reason ?? "")}`,
  sent: (p) => `Enviada (${PROPOSAL_CHANNELS.find((c) => c.id === p.channel)?.label ?? String(p.channel)})`,
  resent: (p) => `Reenviada (${PROPOSAL_CHANNELS.find((c) => c.id === p.channel)?.label ?? String(p.channel)})`,
  viewed: () => "Aberta pelo cliente",
  status: (p) =>
    `${proposalStatusLabel(String(p.to))}${p.via === "cliente" ? ` pelo cliente${p.name ? ` (${String(p.name)})` : ""}` : p.auto ? " (validade passou)" : ""}${p.reason ? `: ${String(p.reason)}` : ""}`,
  discount: (p) => `Desconto de ${String(p.pct)}% autorizado`,
  link_created: () => "Link criado",
  link_renewed: () => "Link renovado (o anterior parou de funcionar)",
  link_revoked: () => "Link desativado",
  pdf: () => "PDF gerado",
};

export function ProposalStatusChip({ status }: { status: string }) {
  const tone = PROPOSAL_STATUSES.find((s) => s.id === status)?.tone ?? "cinza";
  return <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${TAG_TONE[tone]}`}>{proposalStatusLabel(status)}</span>;
}

export default function CrmProposalPanel({
  proposalId,
  currentUserId,
  caps,
  onClose,
  onChanged,
  onOpenContact,
}: {
  proposalId: string;
  currentUserId: string;
  caps: { editPipeline: boolean; actOnAllLeads: boolean; assignAnyOwner: boolean };
  onClose: () => void;
  onChanged?: () => void;
  onOpenContact?: (contactId: string) => void;
}) {
  const { options } = useCatalog();
  const [p, setP] = useState<CrmProposalDetail | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [reason, setReason] = useState("");
  const [tab, setTab] = useState<"proposta" | "versoes" | "historico">("proposta");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [version, setVersion] = useState(0);
  const [act, setAct] = useState<null | "send" | "negociacao" | "aprovar" | "recusar" | "cancelar">(null);
  const [channel, setChannel] = useState("link");
  const [actReason, setActReason] = useState("");
  const [approver, setApprover] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/proposals/${proposalId}/`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { proposal?: CrmProposalDetail; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !body?.proposal) return setError(body?.error ?? "Não foi possível abrir a proposta.");
        setP(body.proposal);
        setDraft(null);
      })
      .catch(() => !cancelled && setError("Não foi possível falar com o CRM agora."));
    return () => {
      cancelled = true;
    };
  }, [proposalId, version]);

  const reload = () => {
    setVersion((v) => v + 1);
    onChanged?.();
  };
  const mayAct = !!p && caps.editPipeline && (caps.actOnAllLeads || p.ownerId === null || p.ownerId === currentUserId);
  const final = p ? p.status === "aprovada" || p.status === "cancelada" : true;
  const editing = draft ?? (p ? toDraft(p.content) : null);
  const totals = useMemo(() => (editing ? draftTotals(editing.items) : null), [editing]);
  const services = options("service");
  const link = p?.link ? `${typeof window !== "undefined" ? window.location.origin : ""}/proposta/${p.link.token}/` : null;

  function edit(patch: Partial<Draft>) {
    if (!editing) return;
    setDraft({ ...editing, ...patch });
  }
  function editItem(n: number, patch: Partial<ItemDraft>) {
    if (!editing) return;
    edit({ items: editing.items.map((it, i) => (i === n ? { ...it, ...patch } : it)) });
  }
  function addService(id: string) {
    if (!editing) return;
    const o = services.find((s) => s.id === id);
    if (!o) return;
    const meta = (o.meta ?? {}) as { referenceCents?: number; billing?: string; scope?: string };
    edit({
      items: [
        ...editing.items,
        {
          serviceId: o.id,
          name: o.label,
          description: meta.scope ?? "",
          quantity: "1",
          unitValue: typeof meta.referenceCents === "number" ? centsToInput(meta.referenceCents) : "",
          billing: meta.billing === "unico" ? "unico" : "mensal",
          discount: "",
        },
      ],
    });
  }

  async function save() {
    if (!draft || !p) return;
    setBusy(true);
    const r = await call(`/api/crm/proposals/${p.id}/`, "PATCH", {
      ...draft,
      dueDate: draft.dueDate || null,
      items: draft.items.map((i) => ({ ...i, quantity: i.quantity, unitValue: i.unitValue, discount: i.discount })),
      ...(p.locked ? { reason } : {}),
    });
    setBusy(false);
    if (!r.ok) return setError(String(r.data?.error ?? "Não foi possível salvar."));
    setError(null);
    setReason("");
    setNotice(r.data?.newVersion ? `Versão ${String(r.data.version)} criada. A anterior continua guardada.` : "Salvo.");
    reload();
  }

  async function runAct() {
    if (!p || !act) return;
    setBusy(true);
    const r =
      act === "send"
        ? await call(`/api/crm/proposals/${p.id}/send/`, "POST", { channel })
        : await call(`/api/crm/proposals/${p.id}/status/`, "POST", { action: act, reason: actReason, approverName: approver || undefined });
    setBusy(false);
    if (!r.ok) return setError(String(r.data?.error ?? "Não foi possível concluir."));
    setError(null);
    setAct(null);
    setActReason("");
    setApprover("");
    if (act === "send" && r.data?.token) {
      const url = `${window.location.origin}/proposta/${String(r.data.token)}/`;
      if (channel === "link") await navigator.clipboard?.writeText(url).catch(() => {});
      setNotice(channel === "link" ? "Envio registrado e link copiado." : "Envio registrado.");
    } else setNotice(null);
    reload();
  }

  async function simple(url: string, method: string, ok: string) {
    setBusy(true);
    const r = await call(url, method);
    setBusy(false);
    if (!r.ok) return setError(String(r.data?.error ?? "Não foi possível concluir."));
    setError(null);
    setNotice(ok);
    reload();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/40 p-0 sm:p-6" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label={p ? `Proposta nº ${proposalNumber(p.number)}` : "Proposta"}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-4xl min-h-screen sm:min-h-0 rounded-none sm:rounded-2xl border border-crm-line bg-crm-raised text-crm-text shadow-[var(--crm-shadow-lg)]"
      >
        <header className="flex items-start gap-3 border-b border-crm-line px-5 py-4">
          <div className="min-w-0 flex-1">
            <p className="text-[11.5px] text-crm-faint">
              {p
                ? `Proposta nº ${proposalNumber(p.number)} · versão ${p.version}${p.sentVersion && p.sentVersion !== p.version ? ` (enviada: ${p.sentVersion})` : ""}`
                : "Proposta"}
            </p>
            <h2 className="text-[17px] font-semibold truncate">{p?.title ?? "Carregando..."}</h2>
            {p && (
              <p className="text-[12.5px] text-crm-dim">
                {onOpenContact ? (
                  <button type="button" onClick={() => onOpenContact(p.contactId)} className="hover:text-crm-accent">
                    {p.contactName}
                  </button>
                ) : (
                  p.contactName
                )}
                {p.companyName ? ` · ${p.companyName}` : ""} · {p.ownerName ?? "sem responsável"} · oportunidade {p.dealTitle}
              </p>
            )}
          </div>
          {p && <ProposalStatusChip status={p.status} />}
          <button type="button" onClick={onClose} aria-label="Fechar proposta" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
            ×
          </button>
        </header>

        {error && (
          <p className={`mx-5 mt-3 ${CRM_ALERT}`} role="alert">
            {error}
          </p>
        )}
        {notice && !error && (
          <p className="mx-5 mt-3 rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green" role="status">
            {notice}
          </p>
        )}

        {p && editing && totals && (
          <>
            {/* Ações */}
            <div className="px-5 pt-4 space-y-3">
              {p.discountPending && (
                <div
                  className="rounded-xl border border-crm-amber/35 bg-crm-amber/[0.07] px-3 py-2.5 text-[12.5px] flex flex-wrap items-center gap-2"
                  role="status"
                >
                  <span className="flex-1">
                    Desconto de {p.discountPct.toLocaleString("pt-BR")}% acima do limite ({p.discountLimitPct.toLocaleString("pt-BR")}%): precisa da autorização
                    de um Gestor antes do envio.
                  </span>
                  {caps.assignAnyOwner && (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => void simple(`/api/crm/proposals/${p.id}/discount/`, "POST", "Desconto autorizado.")}
                      className={CRM_LINK_BTN}
                    >
                      Autorizar desconto
                    </button>
                  )}
                </div>
              )}
              {p.discountAuthorizedByName && !p.discountPending && p.discountPct > p.discountLimitPct && (
                <p className="text-[12px] text-crm-dim">
                  Desconto de {p.discountAuthorizedPct?.toLocaleString("pt-BR")}% autorizado por {p.discountAuthorizedByName}.
                </p>
              )}
              <div className="flex flex-wrap items-center gap-2">
                {mayAct && !final && (p.status === "em_elaboracao" || PROPOSAL_OPEN.includes(p.status)) && !draft && (
                  <button type="button" onClick={() => setAct("send")} className={CRM_BTN_PRIMARY}>
                    {p.sentVersion === p.version ? "Registrar novo envio" : "Registrar envio"}
                  </button>
                )}
                <a href={`/api/crm/proposals/${p.id}/pdf/`} className={CRM_BTN_OUTLINE}>
                  Baixar PDF
                </a>
                {link && (
                  <button
                    type="button"
                    onClick={() => void navigator.clipboard?.writeText(link).then(() => setNotice("Link copiado."))}
                    className={CRM_BTN_OUTLINE}
                  >
                    Copiar link
                  </button>
                )}
                {mayAct && (p.status === "enviada" || p.status === "visualizada") && !draft && (
                  <button type="button" onClick={() => setAct("negociacao")} className={CRM_LINK_BTN}>
                    Em negociação
                  </button>
                )}
                {mayAct && PROPOSAL_OPEN.includes(p.status) && p.sentVersion === p.version && !draft && (
                  <>
                    <button type="button" onClick={() => setAct("aprovar")} className={CRM_LINK_BTN}>
                      Registrar aprovação
                    </button>
                    <button type="button" onClick={() => setAct("recusar")} className={CRM_LINK_BTN}>
                      Registrar recusa
                    </button>
                  </>
                )}
                {mayAct && !final && !draft && (
                  <button type="button" onClick={() => setAct("cancelar")} className="text-[12.5px] text-crm-dim hover:text-crm-red">
                    Cancelar proposta
                  </button>
                )}
              </div>
              {link && (
                <p className="text-[11.5px] text-crm-faint break-all">
                  Link do cliente: <span className="text-crm-dim">{link}</span>
                  {mayAct && (
                    <>
                      {" · "}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void simple(`/api/crm/proposals/${p.id}/link/`, "POST", "Link renovado: o anterior parou de funcionar.")}
                        className="hover:text-crm-accent"
                      >
                        renovar
                      </button>
                      {" · "}
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => void simple(`/api/crm/proposals/${p.id}/link/`, "DELETE", "Link desativado.")}
                        className="hover:text-crm-red"
                      >
                        desativar
                      </button>
                    </>
                  )}
                </p>
              )}
              {act && (
                <div
                  className="rounded-xl border border-crm-line bg-crm-sunken p-3 space-y-2"
                  role="form"
                  aria-label={act === "send" ? "Registrar envio" : "Atualizar situação"}
                >
                  {act === "send" ? (
                    <>
                      <p className="text-[12.5px] text-crm-dim">
                        Como a proposta chegou ao cliente? O CRM não envia nada sozinho: você manda pelo canal escolhido (o link é copiado) e a proposta passa a
                        Enviada.
                      </p>
                      <select value={channel} onChange={(e) => setChannel(e.target.value)} aria-label="Canal de envio" className={CRM_INPUT}>
                        {PROPOSAL_CHANNELS.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                    </>
                  ) : (
                    <>
                      {act === "aprovar" && (
                        <input
                          value={approver}
                          onChange={(e) => setApprover(e.target.value)}
                          placeholder={`Quem aprovou (padrão: ${p.contactName})`}
                          aria-label="Quem aprovou"
                          className={CRM_INPUT}
                        />
                      )}
                      {act !== "negociacao" && (
                        <textarea
                          value={actReason}
                          onChange={(e) => setActReason(e.target.value)}
                          rows={2}
                          aria-label="Motivo"
                          placeholder={
                            act === "cancelar"
                              ? "Motivo do cancelamento"
                              : act === "aprovar"
                                ? "Como o cliente aprovou (ex.: por e-mail em 10/12)"
                                : "Como o cliente recusou e por quê"
                          }
                          className={`${CRM_INPUT} resize-y`}
                        />
                      )}
                    </>
                  )}
                  <div className="flex items-center gap-2">
                    <button type="button" disabled={busy} onClick={() => void runAct()} className={CRM_BTN_PRIMARY}>
                      {act === "send"
                        ? "Registrar envio"
                        : act === "negociacao"
                          ? "Marcar em negociação"
                          : act === "aprovar"
                            ? "Registrar aprovação"
                            : act === "recusar"
                              ? "Registrar recusa"
                              : "Cancelar proposta"}
                    </button>
                    <button type="button" onClick={() => setAct(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
                      Voltar
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className={`${CRM_SEGMENT_TRACK} w-fit mx-5 mt-4`} role="tablist">
              {(["proposta", "versoes", "historico"] as const).map((t) => (
                <button key={t} type="button" role="tab" aria-selected={tab === t} onClick={() => setTab(t)} className={crmSegment(tab === t)}>
                  {t === "proposta" ? "Proposta" : t === "versoes" ? `Versões (${p.versions.length})` : "Histórico"}
                </button>
              ))}
            </div>

            {tab === "proposta" && (
              <fieldset disabled={!mayAct || final} className="px-5 py-4 space-y-4 min-w-0">
                {p.locked && mayAct && !final && (
                  <p className="text-[12px] text-crm-dim rounded-lg bg-crm-sunken px-3 py-2">
                    A versão {p.version} já foi enviada
                    {p.status === "recusada" || p.status === "expirada" ? ` e está ${proposalStatusLabel(p.status).toLowerCase()}` : ""}: alterar cria a versão{" "}
                    {p.version + 1}, com o motivo. A anterior fica guardada.
                  </p>
                )}
                <label className="block">
                  <span className={CRM_LABEL}>Título</span>
                  <input
                    value={editing.title}
                    onChange={(e) => edit({ title: e.target.value })}
                    aria-label="Título da proposta"
                    className={`${CRM_INPUT} mt-1`}
                  />
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  <label className="block">
                    <span className={CRM_LABEL}>Emissão</span>
                    <input
                      type="date"
                      value={editing.issueDate}
                      onChange={(e) => edit({ issueDate: e.target.value })}
                      aria-label="Data de emissão"
                      className={`${CRM_INPUT} mt-1`}
                    />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Válida até</span>
                    <input
                      type="date"
                      value={editing.validUntil}
                      onChange={(e) => edit({ validUntil: e.target.value })}
                      aria-label="Validade"
                      className={`${CRM_INPUT} mt-1`}
                    />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Vencimento</span>
                    <input
                      type="date"
                      value={editing.dueDate}
                      onChange={(e) => edit({ dueDate: e.target.value })}
                      aria-label="Data de vencimento"
                      className={`${CRM_INPUT} mt-1`}
                    />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Cobrança</span>
                    <select
                      value={editing.billingPeriod}
                      onChange={(e) => edit({ billingPeriod: e.target.value })}
                      aria-label="Periodicidade de cobrança"
                      className={`${CRM_INPUT} mt-1`}
                    >
                      {PROPOSAL_BILLING_PERIODS.map((b) => (
                        <option key={b.id} value={b.id}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="block">
                  <span className={CRM_LABEL}>Apresentação</span>
                  <textarea
                    value={editing.intro}
                    onChange={(e) => edit({ intro: e.target.value })}
                    rows={3}
                    aria-label="Apresentação"
                    className={`${CRM_INPUT} mt-1 resize-y`}
                  />
                </label>

                <section aria-label="Serviços da proposta" className="space-y-2">
                  <h3 className={CRM_LABEL}>Serviços</h3>
                  {editing.items.length === 0 && <p className="text-[12.5px] text-crm-dim">Nenhum serviço ainda.</p>}
                  {editing.items.map((it, n) => (
                    <div key={n} className="rounded-xl border border-crm-line bg-crm-card p-3 space-y-2" aria-label={`Serviço ${n + 1}`}>
                      <div className="flex gap-2">
                        <input
                          value={it.name}
                          onChange={(e) => editItem(n, { name: e.target.value })}
                          aria-label={`Nome do serviço ${n + 1}`}
                          className={`${CRM_INPUT} flex-1`}
                        />
                        <button
                          type="button"
                          onClick={() => edit({ items: editing.items.filter((_, i) => i !== n) })}
                          aria-label={`Retirar serviço ${n + 1}`}
                          className="text-[12px] text-crm-dim hover:text-crm-red px-1"
                        >
                          Retirar
                        </button>
                      </div>
                      <textarea
                        value={it.description}
                        onChange={(e) => editItem(n, { description: e.target.value })}
                        rows={2}
                        placeholder="Descrição / escopo"
                        aria-label={`Descrição do serviço ${n + 1}`}
                        className={`${CRM_INPUT} resize-y`}
                      />
                      <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 items-end">
                        <label className="block">
                          <span className={CRM_LABEL}>Qtd.</span>
                          <input
                            value={it.quantity}
                            onChange={(e) => editItem(n, { quantity: e.target.value })}
                            inputMode="decimal"
                            aria-label={`Quantidade do serviço ${n + 1}`}
                            className={`${CRM_INPUT} mt-1`}
                          />
                        </label>
                        <label className="block">
                          <span className={CRM_LABEL}>Valor unit.</span>
                          <input
                            value={it.unitValue}
                            onChange={(e) => editItem(n, { unitValue: e.target.value })}
                            inputMode="decimal"
                            aria-label={`Valor unitário do serviço ${n + 1}`}
                            className={`${CRM_INPUT} mt-1`}
                          />
                        </label>
                        <label className="block">
                          <span className={CRM_LABEL}>Desconto</span>
                          <input
                            value={it.discount}
                            onChange={(e) => editItem(n, { discount: e.target.value })}
                            placeholder="R$ ou %"
                            aria-label={`Desconto do serviço ${n + 1}`}
                            className={`${CRM_INPUT} mt-1`}
                          />
                        </label>
                        <label className="block">
                          <span className={CRM_LABEL}>Cobrança</span>
                          <select
                            value={it.billing}
                            onChange={(e) => editItem(n, { billing: e.target.value as ItemDraft["billing"] })}
                            aria-label={`Cobrança do serviço ${n + 1}`}
                            className={`${CRM_INPUT} mt-1`}
                          >
                            <option value="mensal">Mensal</option>
                            <option value="unico">Único</option>
                          </select>
                        </label>
                        <p className="text-right text-[13px] font-semibold tabular-nums pb-2">
                          {formatBRL(draftTotals([it]).totalCents) || "R$ 0"}
                          {it.billing === "mensal" ? <span className="font-normal text-crm-faint">/mês</span> : null}
                        </p>
                      </div>
                    </div>
                  ))}
                  {mayAct && !final && (
                    <div className="flex flex-wrap items-center gap-2">
                      <select
                        value=""
                        onChange={(e) => e.target.value && addService(e.target.value)}
                        aria-label="Incluir serviço do catálogo"
                        className={`${CRM_INPUT} !w-auto`}
                      >
                        <option value="">+ Serviço do catálogo</option>
                        {services.map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() =>
                          edit({
                            items: [
                              ...editing.items,
                              { serviceId: null, name: "", description: "", quantity: "1", unitValue: "", billing: "unico", discount: "" },
                            ],
                          })
                        }
                        className={CRM_LINK_BTN}
                      >
                        + Serviço personalizado
                      </button>
                    </div>
                  )}
                  <dl className="rounded-xl border border-crm-line bg-crm-sunken px-3 py-2.5 text-[12.5px] space-y-1" aria-label="Totais">
                    {totals.discountCents > 0 && (
                      <div className="flex justify-between">
                        <dt className="text-crm-dim">Descontos</dt>
                        <dd className="tabular-nums">
                          − {formatBRL(totals.discountCents)} ({totals.discountPct.toLocaleString("pt-BR")}%)
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between">
                      <dt className="text-crm-dim">Mensal</dt>
                      <dd className="tabular-nums">{formatBRL(totals.monthlyCents) || "R$ 0"}</dd>
                    </div>
                    <div className="flex justify-between">
                      <dt className="text-crm-dim">Único</dt>
                      <dd className="tabular-nums">{formatBRL(totals.oneTimeCents) || "R$ 0"}</dd>
                    </div>
                    <div className="flex justify-between font-semibold text-[13.5px]">
                      <dt>Total</dt>
                      <dd className="tabular-nums">{formatBRL(totals.totalCents) || "R$ 0"}</dd>
                    </div>
                  </dl>
                </section>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <label className="block">
                    <span className={CRM_LABEL}>Condições de pagamento</span>
                    <textarea
                      value={editing.paymentTerms}
                      onChange={(e) => edit({ paymentTerms: e.target.value })}
                      rows={2}
                      aria-label="Condições de pagamento"
                      className={`${CRM_INPUT} mt-1 resize-y`}
                    />
                  </label>
                  <label className="block">
                    <span className={CRM_LABEL}>Prazo de execução</span>
                    <textarea
                      value={editing.executionTerm}
                      onChange={(e) => edit({ executionTerm: e.target.value })}
                      rows={2}
                      aria-label="Prazo de execução"
                      className={`${CRM_INPUT} mt-1 resize-y`}
                    />
                  </label>
                </div>
                <label className="block">
                  <span className={CRM_LABEL}>Observações comerciais</span>
                  <textarea
                    value={editing.notes}
                    onChange={(e) => edit({ notes: e.target.value })}
                    rows={2}
                    aria-label="Observações comerciais"
                    className={`${CRM_INPUT} mt-1 resize-y`}
                  />
                </label>

                {draft && (
                  <div className="sticky bottom-0 -mx-5 px-5 py-3 border-t border-crm-line bg-crm-raised flex flex-wrap items-center gap-2">
                    {p.locked && (
                      <input
                        value={reason}
                        onChange={(e) => setReason(e.target.value)}
                        placeholder="Motivo da nova versão"
                        aria-label="Motivo da nova versão"
                        className={`${CRM_INPUT} flex-1 min-w-[200px]`}
                      />
                    )}
                    <button type="button" disabled={busy || (p.locked && reason.trim().length < 5)} onClick={() => void save()} className={CRM_BTN_PRIMARY}>
                      {p.locked ? `Salvar como versão ${p.version + 1}` : "Salvar"}
                    </button>
                    <button type="button" onClick={() => setDraft(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
                      Descartar
                    </button>
                  </div>
                )}

                {p.approvals.length > 0 && (
                  <section aria-label="Respostas do cliente" className="space-y-2">
                    <h3 className={CRM_LABEL}>Respostas do cliente</h3>
                    {p.approvals.map((a) => (
                      <div key={a.id} className="rounded-xl border border-crm-line bg-crm-card p-3 text-[12.5px] space-y-0.5">
                        <p className="font-semibold">
                          {a.decision === "aprovada" ? "Aprovada" : "Recusada"} por {a.name} · versão {a.version} · {dateTime(a.createdAt)}
                        </p>
                        <p className="text-crm-dim">
                          {a.via === "cliente" ? "Resposta online pelo link" : `Registrada pela equipe (${a.recordedByName ?? "—"})`}
                          {a.email ? ` · ${a.email}` : ""}
                          {a.document ? ` · documento ${a.document}` : ""}
                        </p>
                        {a.comment && <p className="whitespace-pre-wrap">{a.comment}</p>}
                        {a.via === "cliente" && (
                          <p className="text-[11px] text-crm-faint break-all">
                            IP {a.ip ?? "—"} · {a.userAgent ?? "—"}
                          </p>
                        )}
                        <p className="text-[11px] text-crm-faint break-all">Código do conteúdo: {a.contentHash}</p>
                      </div>
                    ))}
                  </section>
                )}
              </fieldset>
            )}

            {tab === "versoes" && (
              <ul className="px-5 py-4 space-y-2" aria-label="Versões">
                {p.versions.map((v) => (
                  <li key={v.version} className="rounded-xl border border-crm-line bg-crm-card p-3 text-[12.5px] space-y-1" aria-label={`Versão ${v.version}`}>
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold flex-1">
                        Versão {v.version} · {formatBRL(v.content.totals.totalCents) || "R$ 0"}
                      </p>
                      <a href={`/api/crm/proposals/${p.id}/pdf/?version=${v.version}`} className={CRM_LINK_BTN}>
                        PDF
                      </a>
                    </div>
                    <p className="text-crm-dim">
                      {v.createdByName ?? "—"} · {dateTime(v.createdAt)} · {v.sentAt ? `enviada em ${dateTime(v.sentAt)}` : "não enviada"}
                    </p>
                    {v.reason && <p>Motivo: {v.reason}</p>}
                    {v.changes.length > 0 && (
                      <ul className="list-disc pl-5 text-crm-dim">
                        {v.changes.map((c, i) => (
                          <li key={i}>
                            {c.field}: {c.from ?? "—"} → {c.to ?? "—"}
                          </li>
                        ))}
                      </ul>
                    )}
                    <p className="text-[11px] text-crm-faint">{v.content.items.map((i) => `${i.name} (${formatBRL(lineNet(i)) || "R$ 0"})`).join(" · ")}</p>
                  </li>
                ))}
              </ul>
            )}

            {tab === "historico" && (
              <ul className="px-5 py-4 space-y-1.5 text-[12.5px]" aria-label="Histórico da proposta">
                {p.events.map((e) => (
                  <li key={e.id} className="flex gap-2">
                    <span className="text-crm-faint whitespace-nowrap">{dateTime(e.createdAt)}</span>
                    <span className="flex-1">
                      {(EVENT_TEXT[e.kind] ?? (() => e.kind))(e.payload)}
                      {e.version ? ` · v${e.version}` : ""}
                      <span className="text-crm-faint"> · {e.actorName ?? (e.kind === "viewed" || e.payload.via === "cliente" ? "Cliente" : "Sistema")}</span>
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </>
        )}
      </div>
    </div>
  );
}
