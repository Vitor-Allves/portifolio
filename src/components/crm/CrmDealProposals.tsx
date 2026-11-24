"use client";

// The proposals of one opportunity, inside the lead's "Negócio e tarefas":
// the list (number, situation, total) and "+ Nova proposta" (from a template
// or from the opportunity's service and value).

import { useEffect, useState } from "react";
import { proposalNumber, type CrmProposalSummary, type CrmProposalTemplate } from "@/lib/crm-proposal-types";
import { formatBRL } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN } from "./crm-styles";
import { ProposalStatusChip } from "./CrmProposalPanel";
import { brDay } from "./crm-fields";

export default function CrmDealProposals({
  dealId,
  closed,
  canCreate,
  onOpen,
}: {
  dealId: string;
  closed: boolean;
  canCreate: boolean;
  onOpen: (id: string) => void;
}) {
  const [rows, setRows] = useState<CrmProposalSummary[] | null>(null);
  const [templates, setTemplates] = useState<CrmProposalTemplate[] | null>(null);
  const [creating, setCreating] = useState(false);
  const [templateId, setTemplateId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/proposals/?dealId=${encodeURIComponent(dealId)}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { rows?: CrmProposalSummary[] } | null;
        if (!cancelled) setRows(body?.rows ?? []);
      })
      .catch(() => !cancelled && setRows([]));
    return () => {
      cancelled = true;
    };
  }, [dealId]);

  async function startCreating() {
    setCreating(true);
    if (templates === null) {
      const res = await fetch("/api/crm/proposal-templates/").catch(() => null);
      const body = (await res?.json().catch(() => null)) as { templates?: CrmProposalTemplate[] } | null;
      setTemplates(body?.templates ?? []);
    }
  }

  async function create() {
    setBusy(true);
    const res = await fetch("/api/crm/proposals/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ dealId, templateId: templateId || null }),
    }).catch(() => null);
    setBusy(false);
    const body = (await res?.json().catch(() => null)) as { id?: string; error?: string } | null;
    if (!res?.ok || !body?.id) return setError(body?.error ?? "Não foi possível criar a proposta.");
    setError(null);
    setCreating(false);
    onOpen(body.id);
  }

  return (
    <section aria-label="Propostas da oportunidade" className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <h4 className={CRM_LABEL}>Propostas</h4>
        {canCreate && !closed && !creating && (
          <button type="button" onClick={() => void startCreating()} className={CRM_LINK_BTN}>
            + Nova proposta
          </button>
        )}
      </div>
      {error && <p className={CRM_ALERT}>{error}</p>}
      {creating && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-crm-line bg-crm-sunken p-2.5">
          <select value={templateId} onChange={(e) => setTemplateId(e.target.value)} aria-label="Modelo de proposta" className={`${CRM_INPUT} !w-auto flex-1`}>
            <option value="">Sem modelo (serviço e valor da oportunidade)</option>
            {(templates ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.name}
              </option>
            ))}
          </select>
          <button type="button" disabled={busy} onClick={() => void create()} className={CRM_BTN_PRIMARY}>
            Criar proposta
          </button>
          <button type="button" onClick={() => setCreating(false)} className="text-[12.5px] px-1 text-crm-dim hover:text-crm-text">
            Cancelar
          </button>
        </div>
      )}
      {rows === null ? null : rows.length === 0 ? (
        !creating && <p className="text-[12px] text-crm-dim">Nenhuma proposta para esta oportunidade.</p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((p) => (
            <li key={p.id}>
              <button
                type="button"
                onClick={() => onOpen(p.id)}
                className="w-full flex items-center gap-2 rounded-xl border border-crm-line bg-crm-card px-3 py-2 text-left hover:border-crm-accent/40"
              >
                <span className="text-[12px] tabular-nums text-crm-faint">nº {proposalNumber(p.number)}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-[13px] font-medium truncate">{p.title}</span>
                  <span className="block text-[11px] text-crm-faint">
                    v{p.version} · válida até {brDay(p.validUntil)}
                  </span>
                </span>
                <span className="text-[12.5px] tabular-nums">{formatBRL(p.totalCents) || "R$ 0"}</span>
                <ProposalStatusChip status={p.status} />
              </button>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
