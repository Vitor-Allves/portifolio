"use client";

// Operação of an active client (evolução v1.0, item 9): the onboarding
// checklist, the deliverables (with responsible, date and situation) and the
// satisfaction history.

import { useEffect, useState } from "react";
import { DELIVERABLE_STATUSES, satisfactionBand, type CrmClientOperation, type CrmDeliverable } from "@/lib/crm-operation-types";
import type { CrmContract, CrmTeamMember } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { useCatalog } from "./crm-catalog-context";
import { brDay } from "./crm-fields";
import { dateTime } from "./crm-format";

async function call(url: string, method: string, body?: unknown): Promise<{ operation?: CrmClientOperation; error?: string }> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  }).catch(() => null);
  const data = (await res?.json().catch(() => null)) as { operation?: CrmClientOperation; error?: string } | null;
  if (!res?.ok) return { error: data?.error ?? "Não foi possível salvar." };
  return data ?? {};
}

type DeliverableDraft = {
  id: string | null;
  title: string;
  description: string;
  service: string;
  contractId: string;
  ownerId: string;
  dueOn: string;
  status: string;
};
const emptyDeliverable: DeliverableDraft = { id: null, title: "", description: "", service: "", contractId: "", ownerId: "", dueOn: "", status: "pendente" };

export default function CrmClientOperation({
  clientId,
  canEdit,
  team,
  contracts,
  onChanged,
}: {
  clientId: string;
  canEdit: boolean;
  team: CrmTeamMember[];
  contracts: CrmContract[];
  onChanged?: () => void;
}) {
  const { options, label } = useCatalog();
  const [op, setOp] = useState<CrmClientOperation | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState<DeliverableDraft | null>(null);
  const [score, setScore] = useState("");
  const [comment, setComment] = useState("");

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/clients/${clientId}/operation/`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { operation?: CrmClientOperation; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !body?.operation) return setError(body?.error ?? "Não foi possível carregar a operação.");
        setOp(body.operation);
      })
      .catch(() => !cancelled && setError("Não foi possível falar com o CRM agora."));
    return () => {
      cancelled = true;
    };
  }, [clientId]);

  async function run(url: string, method: string, body?: unknown): Promise<boolean> {
    const r = await call(url, method, body);
    if (r.error) {
      setError(r.error);
      return false;
    }
    setError(null);
    if (r.operation) setOp(r.operation);
    onChanged?.();
    return true;
  }

  if (!op) return <p className="text-[12.5px] text-crm-faint">{error ?? "Carregando..."}</p>;
  const done = op.onboarding.filter((i) => i.doneAt).length;

  return (
    <div className="space-y-6">
      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}

      <section aria-label="Onboarding" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={CRM_LABEL}>
            Onboarding
            {op.onboarding.length ? (
              <span className="normal-case tracking-normal font-normal text-crm-faint">{` · ${done} de ${op.onboarding.length}`}</span>
            ) : null}
          </h3>
          {canEdit && op.onboarding.length === 0 && (
            <button type="button" onClick={() => void run(`/api/crm/clients/${clientId}/onboarding/`, "POST")} className={CRM_LINK_BTN}>
              + Começar checklist
            </button>
          )}
        </div>
        {op.onboarding.length === 0 ? (
          <p className="text-[12.5px] text-crm-dim">Sem checklist de onboarding. Clientes novos já começam com ele.</p>
        ) : (
          <>
            <div className="h-1.5 rounded-full bg-crm-sunken overflow-hidden" aria-hidden="true">
              <div className="h-full bg-crm-green" style={{ width: `${(done / op.onboarding.length) * 100}%` }} />
            </div>
            <ul className="divide-y divide-crm-line rounded-xl border border-crm-line bg-crm-card">
              {op.onboarding.map((i) => (
                <li key={i.id} className="flex flex-wrap items-center gap-2 px-3 py-2">
                  <label className="flex flex-wrap items-center gap-x-2 min-w-0 flex-1 basis-40 text-[13px]">
                    <input
                      type="checkbox"
                      checked={!!i.doneAt}
                      disabled={!canEdit}
                      onChange={(e) => {
                        // Checked right away; back as it was if the server refuses.
                        const before = op;
                        const checked = e.target.checked;
                        setOp({
                          ...op,
                          onboarding: op.onboarding.map((x) =>
                            x.id === i.id ? { ...x, doneAt: checked ? new Date().toISOString() : null, doneByName: checked ? "você" : null } : x,
                          ),
                        });
                        void run(`/api/crm/clients/${clientId}/onboarding/${i.id}/`, "PATCH", { done: checked }).then((saved) => !saved && setOp(before));
                      }}
                      className="h-4 w-4 accent-[var(--crm-accent)]"
                    />
                    <span className={i.doneAt ? "line-through text-crm-dim" : ""}>{i.label}</span>
                    {i.doneAt && <span className="text-[11px] text-crm-faint">{`${i.doneByName ?? ""} · ${dateTime(i.doneAt)}`}</span>}
                  </label>
                  <select
                    value={i.ownerId ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => void run(`/api/crm/clients/${clientId}/onboarding/${i.id}/`, "PATCH", { ownerId: e.target.value || null })}
                    aria-label={`Responsável — ${i.label}`}
                    className={`${CRM_INPUT} !w-[8.5rem] !py-1 !px-2 text-[12px]`}
                  >
                    <option value="">Sem responsável</option>
                    {team.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                  <input
                    type="date"
                    value={i.dueOn ?? ""}
                    disabled={!canEdit}
                    onChange={(e) => void run(`/api/crm/clients/${clientId}/onboarding/${i.id}/`, "PATCH", { dueOn: e.target.value || null })}
                    aria-label={`Prazo — ${i.label}`}
                    className={`${CRM_INPUT} !w-[8.5rem] !py-1 !px-2 text-[12px]`}
                  />
                </li>
              ))}
            </ul>
          </>
        )}
      </section>

      <section aria-label="Entregáveis" className="space-y-2">
        <div className="flex items-center justify-between gap-2">
          <h3 className={CRM_LABEL}>Entregáveis</h3>
          {canEdit && !draft && (
            <button type="button" onClick={() => setDraft(emptyDeliverable)} className={CRM_LINK_BTN}>
              + Novo entregável
            </button>
          )}
        </div>
        {draft && (
          <div
            className="rounded-xl border border-crm-line bg-crm-sunken p-3 space-y-2"
            role="form"
            aria-label={draft.id ? "Editar entregável" : "Novo entregável"}
          >
            <input
              value={draft.title}
              onChange={(e) => setDraft({ ...draft, title: e.target.value })}
              placeholder="O que será entregue"
              aria-label="Entregável"
              className={CRM_INPUT}
            />
            <textarea
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              rows={2}
              placeholder="Detalhes"
              aria-label="Detalhes do entregável"
              className={`${CRM_INPUT} resize-y`}
            />
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
              <select
                value={draft.service}
                onChange={(e) => setDraft({ ...draft, service: e.target.value })}
                aria-label="Serviço do entregável"
                className={CRM_INPUT}
              >
                <option value="">Serviço</option>
                {options("service", draft.service || null).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              <select
                value={draft.ownerId}
                onChange={(e) => setDraft({ ...draft, ownerId: e.target.value })}
                aria-label="Responsável pelo entregável"
                className={CRM_INPUT}
              >
                <option value="">Responsável</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <input
                type="date"
                value={draft.dueOn}
                onChange={(e) => setDraft({ ...draft, dueOn: e.target.value })}
                aria-label="Prazo do entregável"
                className={CRM_INPUT}
              />
              <select
                value={draft.status}
                onChange={(e) => setDraft({ ...draft, status: e.target.value })}
                aria-label="Situação do entregável"
                className={CRM_INPUT}
              >
                {DELIVERABLE_STATUSES.map((st) => (
                  <option key={st.id} value={st.id}>
                    {st.label}
                  </option>
                ))}
              </select>
            </div>
            {contracts.length > 1 && (
              <select
                value={draft.contractId}
                onChange={(e) => setDraft({ ...draft, contractId: e.target.value })}
                aria-label="Contrato do entregável"
                className={CRM_INPUT}
              >
                <option value="">Sem contrato específico</option>
                {contracts.map((k) => (
                  <option key={k.id} value={k.id}>
                    {`Contrato nº ${String(k.number).padStart(4, "0")}`}
                  </option>
                ))}
              </select>
            )}
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={!draft.title.trim()}
                onClick={async () => {
                  const body = {
                    title: draft.title,
                    description: draft.description,
                    service: draft.service || null,
                    contractId: draft.contractId || null,
                    ownerId: draft.ownerId || null,
                    dueOn: draft.dueOn || null,
                    status: draft.status,
                  };
                  if (
                    await run(
                      draft.id ? `/api/crm/clients/${clientId}/deliverables/${draft.id}/` : `/api/crm/clients/${clientId}/deliverables/`,
                      draft.id ? "PATCH" : "POST",
                      body,
                    )
                  )
                    setDraft(null);
                }}
                className={CRM_BTN_PRIMARY}
              >
                Salvar entregável
              </button>
              <button type="button" onClick={() => setDraft(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
                Cancelar
              </button>
            </div>
          </div>
        )}
        {op.deliverables.length === 0 ? (
          !draft && <p className="text-[12.5px] text-crm-dim">Nenhum entregável cadastrado.</p>
        ) : (
          <ul className="space-y-1.5">
            {op.deliverables.map((d: CrmDeliverable) => (
              <li
                key={d.id}
                className={`rounded-xl border px-3 py-2 ${d.late ? "border-crm-red/30 bg-crm-red/[0.04]" : "border-crm-line bg-crm-card"}`}
                aria-label={`Entregável ${d.title}`}
              >
                <div className="flex flex-wrap items-start gap-2">
                  <span className="min-w-0 flex-1 basis-48">
                    <span className={`block text-[13px] font-medium ${d.status === "entregue" || d.status === "cancelado" ? "text-crm-dim" : ""}`}>
                      {d.title}
                    </span>
                    <span className="block text-[11.5px] text-crm-faint">
                      {[
                        d.service ? label("service", d.service) : null,
                        d.ownerName,
                        d.dueOn ? `prazo ${brDay(d.dueOn)}` : null,
                        d.deliveredAt ? `entregue em ${dateTime(d.deliveredAt)}` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
                    </span>
                  </span>
                  <span className={`text-[11.5px] font-semibold ${d.late ? "text-crm-red" : d.status === "entregue" ? "text-crm-green" : "text-crm-dim"}`}>
                    {d.late ? "Atrasado" : DELIVERABLE_STATUSES.find((x) => x.id === d.status)?.label}
                  </span>
                  {canEdit && (
                    <span className="flex gap-2">
                      {d.status !== "entregue" && d.status !== "cancelado" && (
                        <button
                          type="button"
                          onClick={() => void run(`/api/crm/clients/${clientId}/deliverables/${d.id}/`, "PATCH", { status: "entregue" })}
                          className={CRM_LINK_BTN}
                        >
                          Marcar entregue
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() =>
                          setDraft({
                            id: d.id,
                            title: d.title,
                            description: d.description ?? "",
                            service: d.service ?? "",
                            contractId: d.contractId ?? "",
                            ownerId: d.ownerId ?? "",
                            dueOn: d.dueOn ?? "",
                            status: d.status,
                          })
                        }
                        className="text-[12px] text-crm-dim hover:text-crm-text"
                      >
                        Editar
                      </button>
                    </span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-label="Satisfação" className="space-y-2">
        <h3 className={CRM_LABEL}>
          Satisfação
          {op.satisfactionAvg !== null ? (
            <span className="normal-case tracking-normal font-normal text-crm-faint">{` · média ${op.satisfactionAvg.toLocaleString("pt-BR")} de 10`}</span>
          ) : null}
        </h3>
        {canEdit && (
          <div className="flex flex-wrap items-center gap-2">
            <select value={score} onChange={(e) => setScore(e.target.value)} aria-label="Nota de satisfação (0 a 10)" className={`${CRM_INPUT} !w-auto`}>
              <option value="">Nota (0 a 10)</option>
              {Array.from({ length: 11 }, (_, n) => 10 - n).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <input
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="O que o cliente disse"
              aria-label="Comentário de satisfação"
              className={`${CRM_INPUT} flex-1 min-w-[180px]`}
            />
            <button
              type="button"
              disabled={score === ""}
              onClick={async () => {
                if (await run(`/api/crm/clients/${clientId}/satisfaction/`, "POST", { score: Number(score), comment })) {
                  setScore("");
                  setComment("");
                }
              }}
              className={CRM_BTN_PRIMARY}
            >
              Registrar
            </button>
          </div>
        )}
        {op.satisfaction.length === 0 ? (
          <p className="text-[12.5px] text-crm-dim">Nenhuma avaliação registrada ainda.</p>
        ) : (
          <ul className="space-y-1 text-[12.5px]" aria-label="Histórico de satisfação">
            {op.satisfaction.map((r) => {
              const band = satisfactionBand(r.score);
              return (
                <li key={r.id} className="flex gap-2">
                  <span
                    className={`font-semibold tabular-nums ${band === "promotor" ? "text-crm-green" : band === "neutro" ? "text-crm-amber" : "text-crm-red"}`}
                  >
                    {r.score}
                  </span>
                  <span className="flex-1">
                    {r.comment ?? "—"}
                    <span className="text-crm-faint">{` · ${r.recordedByName ?? "—"} · ${dateTime(r.createdAt)}`}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
