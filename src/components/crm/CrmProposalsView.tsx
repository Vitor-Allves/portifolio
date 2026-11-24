"use client";

// Propostas (evolução v1.0, item 3): every proposal this person may see, with
// its situation, value and validity; filters by situation, salesperson and a
// search (number, title, client, company). Opening one shows the proposal.

import { useEffect, useState } from "react";
import { PROPOSAL_STATUSES, proposalNumber, type CrmProposalSummary } from "@/lib/crm-proposal-types";
import { formatBRL, type CrmTeamMember } from "@/lib/crm-types";
import { CRM_ALERT, CRM_FILTER, CRM_TD, CRM_TH } from "./crm-styles";
import { brDay } from "./crm-fields";
import { dateTime } from "./crm-format";
import { ProposalStatusChip } from "./CrmProposalPanel";

export default function CrmProposalsView({
  team,
  seeAll,
  version,
  onOpen,
}: {
  team: CrmTeamMember[];
  /** Whether the salesperson filter makes sense (sees everyone's). */
  seeAll: boolean;
  /** Bumped when something changed elsewhere. */
  version: number;
  onOpen: (id: string) => void;
}) {
  const [status, setStatus] = useState("");
  const [owner, setOwner] = useState("");
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ key: string; rows: CrmProposalSummary[]; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const key = new URLSearchParams({
    ...(status ? { status } : {}),
    ...(owner ? { owner } : {}),
    ...(q.trim() ? { q: q.trim() } : {}),
    v: String(version),
  }).toString();

  useEffect(() => {
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/crm/proposals/?${key}`)
        .then(async (res) => {
          const body = (await res.json().catch(() => null)) as { rows?: CrmProposalSummary[]; total?: number; error?: string } | null;
          if (cancelled) return;
          if (!res.ok) return setError(body?.error ?? "Não foi possível carregar as propostas.");
          setError(null);
          setData({ key, rows: body?.rows ?? [], total: body?.total ?? 0 });
        })
        .catch(() => !cancelled && setError("Não foi possível falar com o CRM agora."));
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [key]);

  return (
    <section aria-label="Propostas" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Buscar nº, título, cliente ou empresa"
          aria-label="Buscar propostas"
          className={`${CRM_FILTER} min-w-[220px] flex-1 sm:flex-none`}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação da proposta" className={CRM_FILTER}>
          <option value="">Todas as situações</option>
          {PROPOSAL_STATUSES.map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {seeAll && (
          <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável comercial" className={CRM_FILTER}>
            <option value="">Todos os responsáveis</option>
            <option value="mine">Minhas</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        )}
        {data && <span className="text-[12px] text-crm-faint">{data.total === 1 ? "1 proposta" : `${data.total} propostas`}</span>}
      </div>
      {error && <p className={CRM_ALERT}>{error}</p>}
      {!data ? (
        <p className="text-[12.5px] text-crm-faint">Carregando...</p>
      ) : data.rows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-crm-line px-4 py-8 text-center text-[13px] text-crm-dim">
          Nenhuma proposta {status || owner || q ? "com esses filtros" : "ainda"}. Para fazer uma, abra a oportunidade (Negócio e tarefas) e use &quot;+ Nova
          proposta&quot;.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-crm-line bg-crm-card">
          <table className="w-full text-[13px]">
            <thead className="border-b border-crm-line">
              <tr>
                <th className={CRM_TH}>Nº</th>
                <th className={CRM_TH}>Proposta</th>
                <th className={CRM_TH}>Responsável</th>
                <th className={CRM_TH}>Situação</th>
                <th className={`${CRM_TH} text-right`}>Total</th>
                <th className={CRM_TH}>Validade</th>
                <th className={CRM_TH}>Atualizada</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crm-line">
              {data.rows.map((p) => (
                <tr
                  key={p.id}
                  onClick={() => onOpen(p.id)}
                  className="cursor-pointer hover:bg-crm-hover transition-colors"
                  aria-label={`Proposta nº ${proposalNumber(p.number)}`}
                >
                  <td className={`${CRM_TD} tabular-nums text-crm-dim`}>{proposalNumber(p.number)}</td>
                  <td className={CRM_TD}>
                    <p className="font-medium text-crm-text">{p.title}</p>
                    <p className="text-[11.5px] text-crm-faint">
                      {p.contactName}
                      {p.companyName ? ` · ${p.companyName}` : ""} · v{p.version}
                    </p>
                  </td>
                  <td className={`${CRM_TD} text-crm-dim`}>{p.ownerName ?? "—"}</td>
                  <td className={CRM_TD}>
                    <span className="flex flex-wrap gap-1">
                      <ProposalStatusChip status={p.status} />
                      {p.discountPending && (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border bg-crm-amber/10 text-crm-amber border-crm-amber/30">
                          Desconto a autorizar
                        </span>
                      )}
                    </span>
                  </td>
                  <td className={`${CRM_TD} text-right tabular-nums whitespace-nowrap`}>
                    {formatBRL(p.totalCents) || "R$ 0"}
                    {p.monthlyCents > 0 && <span className="block text-[11px] text-crm-faint">{formatBRL(p.monthlyCents)}/mês</span>}
                  </td>
                  <td className={`${CRM_TD} whitespace-nowrap text-crm-dim`}>{brDay(p.validUntil)}</td>
                  <td className={`${CRM_TD} whitespace-nowrap text-crm-faint`}>{dateTime(p.updatedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
