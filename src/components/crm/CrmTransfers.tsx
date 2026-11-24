"use client";

// Solicitação de transferência (evolução v1.0, item 6) on the screens: the
// box on a lead's panel (ask for it, follow the request, approve or refuse
// it) and the Transferências section (the requests one may see; a Gestor
// decides them there too). The server enforces every rule.

import { useEffect, useState } from "react";
import type { CrmContactDetail, CrmTeamMember, CrmTransferInfo } from "@/lib/crm-types";
import type { CrmCapabilities } from "@/lib/crm-permissions";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { dateTime } from "./crm-format";

async function send(url: string, method: "POST" | "PATCH" | "DELETE", body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return null;
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível concluir.";
}

const STATUS_TONE: Record<CrmTransferInfo["status"], string> = {
  pendente: "bg-crm-amber/10 text-crm-amber border-crm-amber/30",
  aprovada: "bg-crm-green/10 text-crm-green border-crm-green/25",
  recusada: "bg-crm-red/10 text-crm-red border-crm-red/25",
  cancelada: "bg-crm-sunken text-crm-dim border-crm-line",
};
const STATUS_LABEL: Record<CrmTransferInfo["status"], string> = { pendente: "Pendente", aprovada: "Aprovada", recusada: "Recusada", cancelada: "Cancelada" };

/** Approve / refuse (a refusal needs the reason). */
function Decide({ t, onDone }: { t: CrmTransferInfo; onDone: (error: string | null) => void }) {
  const [refusing, setRefusing] = useState(false);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go = async (decision: "aprovar" | "recusar") => {
    setBusy(true);
    const err = await send(`/api/crm/transfers/${t.id}/`, "PATCH", { decision, note });
    setBusy(false);
    onDone(err);
  };
  return refusing ? (
    <div className="flex flex-wrap items-center gap-2">
      <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Motivo da recusa" aria-label={`Motivo da recusa — ${t.contactName}`} className={`${CRM_INPUT} !w-auto flex-1 min-w-[160px] !py-1.5`} />
      <button type="button" disabled={busy || !note.trim()} onClick={() => void go("recusar")} className={CRM_BTN_OUTLINE}>
        Recusar
      </button>
      <button type="button" onClick={() => setRefusing(false)} className="text-[12px] text-crm-dim hover:text-crm-text">
        Voltar
      </button>
    </div>
  ) : (
    <div className="flex flex-wrap items-center gap-2">
      <button type="button" disabled={busy} onClick={() => void go("aprovar")} className={CRM_BTN_PRIMARY} aria-label={`Aprovar transferência — ${t.contactName}`}>
        Aprovar
      </button>
      <button type="button" disabled={busy} onClick={() => setRefusing(true)} className={CRM_BTN_OUTLINE} aria-label={`Recusar transferência — ${t.contactName}`}>
        Recusar…
      </button>
    </div>
  );
}

/**
 * On a lead's panel: who it belongs to when the viewer can't work on it, the
 * open request (approve / refuse for a Gestor, cancel for who asked), or the
 * form to ask — for oneself, or to hand one's own lead to a colleague.
 */
export function CrmTransferBox({
  detail,
  currentUserId,
  caps,
  mayAct,
  team,
  onChanged,
}: {
  detail: CrmContactDetail;
  currentUserId: string;
  caps: CrmCapabilities;
  mayAct: boolean;
  team: CrmTeamMember[];
  onChanged: () => void;
}) {
  const [asking, setAsking] = useState<"me" | "other" | null>(null);
  const [reason, setReason] = useState("");
  const [to, setTo] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const t = detail.pendingTransfer ?? null;
  const mine = detail.ownerId === currentUserId;
  // Who may change owners directly doesn't ask; a Marketing-like profile (no funnel) doesn't either.
  const canAsk = !caps.assignAnyOwner && caps.editPipeline;
  if (mayAct && !t && !(canAsk && mine)) return null;

  const submit = async () => {
    setBusy(true);
    const err = await send("/api/crm/transfers/", "POST", { contactId: detail.id, reason, ...(asking === "other" ? { toOwnerId: to } : {}) });
    setBusy(false);
    setError(err);
    if (!err) {
      setAsking(null);
      setReason("");
      onChanged();
    }
  };

  return (
    <section
      aria-label="Responsabilidade do lead"
      className={`rounded-xl border px-3 py-2.5 text-[12.5px] space-y-2 ${!mayAct || t ? "border-crm-amber/35 bg-crm-amber/[0.07]" : "border-crm-line bg-crm-sunken"}`}
    >
      {!mayAct && (
        <p>
          Lead de <strong>{detail.ownerName ?? "outra pessoa"}</strong>. Você pode consultar os dados, as oportunidades e o histórico; só o responsável mexe nele
          {detail.conversationHidden ? " e vê a conversa" : ""}.
        </p>
      )}
      {t ? (
        <div className="space-y-2">
          <p>
            <span className="font-semibold">Transferência pedida</span> por {t.requestedById === currentUserId ? "você" : t.requestedByName} em {dateTime(t.requestedAt)} (
            {t.fromOwnerName ?? "sem responsável"} → {t.toOwnerName}): <span className="italic">{t.reason}</span>
          </p>
          {caps.assignAnyOwner ? (
            <Decide
              t={t}
              onDone={(err) => {
                setError(err);
                if (!err) onChanged();
              }}
            />
          ) : t.requestedById === currentUserId ? (
            <p className="flex flex-wrap items-center gap-3 text-crm-dim">
              Aguardando um Gestor.
              <button
                type="button"
                className={CRM_LINK_BTN}
                onClick={async () => {
                  const err = await send(`/api/crm/transfers/${t.id}/`, "DELETE");
                  setError(err);
                  if (!err) onChanged();
                }}
              >
                Cancelar pedido
              </button>
            </p>
          ) : (
            <p className="text-crm-dim">Um Gestor vai decidir.</p>
          )}
        </div>
      ) : asking ? (
        <div className="space-y-2">
          {asking === "other" && (
            <label className="block">
              <span className={CRM_LABEL}>Passar para</span>
              <select value={to} onChange={(e) => setTo(e.target.value)} aria-label="Passar o lead para" className={`${CRM_INPUT} mt-1`}>
                <option value="">Escolha a pessoa</option>
                {team
                  .filter((m) => m.id !== currentUserId)
                  .map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name}
                    </option>
                  ))}
              </select>
            </label>
          )}
          <label className="block">
            <span className={CRM_LABEL}>Motivo</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              aria-label="Motivo da transferência"
              placeholder={asking === "me" ? "Ex.: o cliente me procurou direto; já atendi a empresa antes" : "Ex.: o lead é da região dela"}
              className={`${CRM_INPUT} mt-1 resize-y`}
            />
          </label>
          <div className="flex items-center gap-2">
            <button type="button" disabled={busy || reason.trim().length < 5 || (asking === "other" && !to)} onClick={() => void submit()} className={CRM_BTN_PRIMARY}>
              Enviar pedido
            </button>
            <button type="button" onClick={() => setAsking(null)} className="text-[12.5px] px-2 text-crm-dim hover:text-crm-text">
              Cancelar
            </button>
            <span className="text-[11.5px] text-crm-faint">Um Gestor aprova ou recusa; tudo fica no histórico.</span>
          </div>
        </div>
      ) : canAsk ? (
        <p className="flex flex-wrap items-center gap-3">
          {!mayAct && (
            <button type="button" onClick={() => setAsking("me")} className={CRM_LINK_BTN}>
              Pedir transferência para mim
            </button>
          )}
          {mine && (
            <button type="button" onClick={() => setAsking("other")} className={`${CRM_LINK_BTN} !text-crm-dim`}>
              Passar este lead para outra pessoa…
            </button>
          )}
        </p>
      ) : null}
      {error && <p className={CRM_ALERT}>{error}</p>}
    </section>
  );
}

/** Transferências: the requests one may see; a Gestor approves or refuses the pending ones here. */
export default function CrmTransfersView({
  currentUserId,
  canDecide,
  version,
  onOpenContact,
  onChanged,
}: {
  currentUserId: string;
  canDecide: boolean;
  version: number;
  onOpenContact: (contactId: string) => void;
  onChanged: () => void;
}) {
  const [status, setStatus] = useState<"pendente" | "todas">("pendente");
  const [list, setList] = useState<CrmTransferInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/transfers/?status=${status}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { transfers?: CrmTransferInfo[]; error?: string } | null;
        if (cancelled) return;
        setList(body?.transfers ?? []);
        setError(res.ok ? null : (body?.error ?? "Não foi possível carregar as transferências."));
      })
      .catch(() => !cancelled && setError("Não foi possível falar com o CRM agora."));
    return () => {
      cancelled = true;
    };
  }, [status, version, tick]);

  return (
    <section aria-label="Transferências" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <select value={status} onChange={(e) => setStatus(e.target.value as "pendente" | "todas")} aria-label="Situação" className={CRM_FILTER}>
          <option value="pendente">Pendentes</option>
          <option value="todas">Todas</option>
        </select>
        <p className="text-[12.5px] text-crm-dim">
          {canDecide ? "Aprove ou recuse os pedidos da equipe. Aprovar passa o lead, as oportunidades abertas e as tarefas pendentes." : "Seus pedidos e os que envolvem os seus leads."}
        </p>
      </div>
      {error && <p className={CRM_ALERT}>{error}</p>}
      {list === null ? (
        <p className="text-[12.5px] text-crm-dim">Carregando...</p>
      ) : list.length === 0 ? (
        <p className="rounded-2xl border border-dashed border-crm-line-strong px-4 py-6 text-center text-[12.5px] text-crm-faint">
          {status === "pendente" ? "Nenhum pedido pendente." : "Nenhum pedido de transferência ainda."}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Pedidos de transferência">
          {list.map((t) => (
            <li key={t.id} className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-4 py-3 space-y-2" aria-label={`Pedido: ${t.contactName}`}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <button type="button" onClick={() => onOpenContact(t.contactId)} className="text-[13.5px] font-semibold text-crm-text hover:text-crm-accent text-left">
                    {t.contactName}
                  </button>
                  {t.company && <span className="text-[12px] text-crm-dim"> · {t.company}</span>}
                  <p className="text-[12.5px] text-crm-dim">
                    {t.fromOwnerName ?? "Sem responsável"} → <strong className="text-crm-text">{t.toOwnerName}</strong> · pedido por{" "}
                    {t.requestedById === currentUserId ? "você" : t.requestedByName} em {dateTime(t.requestedAt)}
                  </p>
                </div>
                <span className={`shrink-0 text-[11px] font-semibold px-2 py-0.5 rounded-full border ${STATUS_TONE[t.status]}`}>{STATUS_LABEL[t.status]}</span>
              </div>
              <p className="text-[12.5px]">
                <span className="text-crm-faint">Motivo:</span> {t.reason}
              </p>
              {t.status !== "pendente" && t.decidedAt && (
                <p className="text-[12px] text-crm-dim">
                  {STATUS_LABEL[t.status]} por {t.decidedByName ?? "—"} em {dateTime(t.decidedAt)}
                  {t.decisionNote ? `: ${t.decisionNote}` : ""}
                </p>
              )}
              {t.status === "pendente" && canDecide && (
                <Decide
                  t={t}
                  onDone={(err) => {
                    setError(err);
                    if (!err) {
                      setTick((x) => x + 1);
                      onChanged();
                    }
                  }}
                />
              )}
              {t.status === "pendente" && !canDecide && t.requestedById === currentUserId && (
                <button
                  type="button"
                  className={CRM_LINK_BTN}
                  onClick={async () => {
                    const err = await send(`/api/crm/transfers/${t.id}/`, "DELETE");
                    setError(err);
                    if (!err) setTick((x) => x + 1);
                  }}
                >
                  Cancelar pedido
                </button>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
