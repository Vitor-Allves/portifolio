"use client";

import { useEffect, useState } from "react";
import { monthLabel, monthTitle, type CrmFollowUpRow } from "@/lib/crm-types";
import { CRM_ALERT, CRM_SEGMENT_TRACK, crmSegment } from "./crm-styles";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";
import { dateTime, todaySp } from "./crm-format";
import { ClientStatusChip } from "./crm-client-ui";

/** "2026-11" ± n months. */
export function shiftMonth(month: string, n: number): string {
  const [y, m] = month.split("-").map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

type Show = "pendentes" | "atualizados" | "todos";

/**
 * Acompanhamento de clientes: for a month, every client that was current
 * then and whether its acompanhamento was registered — pending ones first.
 * A click opens the client on that month.
 */
export default function CrmFollowUpView({
  version,
  onOpenClient,
}: {
  version: number;
  onOpenClient: (clientId: string, month: string) => void;
}) {
  const { label } = useCatalog();
  const thisMonth = todaySp().slice(0, 7);
  const [month, setMonth] = useState(thisMonth);
  const [show, setShow] = useState<Show>("todos");
  const [result, setResult] = useState<{ key: string; rows: CrmFollowUpRow[] | null; error: string | null } | null>(null);
  const key = `${month}#${version}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/clients/followup/?month=${key.split("#")[0]}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as { rows?: CrmFollowUpRow[]; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !body?.rows) setResult({ key, rows: null, error: body?.error ?? "Não foi possível carregar o acompanhamento." });
        else setResult({ key, rows: body.rows, error: null });
      })
      .catch(() => !cancelled && setResult({ key, rows: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const rows = result?.rows ?? [];
  const done = rows.filter((r) => r.report).length;
  const visible = rows.filter((r) => (show === "pendentes" ? !r.report : show === "atualizados" ? !!r.report : true));
  const loading = result?.key !== key;

  return (
    <section aria-label="Acompanhamento de clientes" className="space-y-3 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1" role="group" aria-label="Mês de referência">
          <button type="button" onClick={() => setMonth((m) => shiftMonth(m, -1))} aria-label="Mês anterior" className="h-8 w-8 rounded-full border border-crm-line hover:bg-crm-hover">
            ‹
          </button>
          <span className="min-w-[11rem] text-center text-[14px] font-semibold" aria-live="polite">
            {monthTitle(month)}
          </span>
          <button
            type="button"
            disabled={month >= thisMonth}
            onClick={() => setMonth((m) => shiftMonth(m, 1))}
            aria-label="Próximo mês"
            className="h-8 w-8 rounded-full border border-crm-line hover:bg-crm-hover disabled:opacity-40"
          >
            ›
          </button>
        </div>
        <div className={CRM_SEGMENT_TRACK} role="group" aria-label="Mostrar">
          {(
            [
              ["todos", "Todos"],
              ["pendentes", "Pendentes"],
              ["atualizados", "Atualizados"],
            ] as [Show, string][]
          ).map(([id, text]) => (
            <button key={id} type="button" aria-pressed={show === id} onClick={() => setShow(id)} className={crmSegment(show === id)}>
              {text}
            </button>
          ))}
        </div>
      </div>

      {result?.rows && rows.length > 0 && (
        <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4" role="region" aria-label="Resumo do mês">
          <p className="text-[13px]">
            <strong className="crm-display text-[22px] mr-1 tabular-nums">{done}</strong> de {rows.length} {rows.length === 1 ? "cliente" : "clientes"} com o acompanhamento de{" "}
            {monthLabel(month)} registrado
          </p>
          <div className="mt-2 h-2 rounded-full bg-crm-sunken overflow-hidden" role="progressbar" aria-label="Clientes atualizados" aria-valuemin={0} aria-valuemax={rows.length} aria-valuenow={done}>
            <div className="h-full rounded-full bg-crm-green" style={{ width: `${rows.length ? (done / rows.length) * 100 : 0}%` }} />
          </div>
        </div>
      )}

      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}
      {!result && <p className="text-[12.5px] text-crm-dim">Carregando...</p>}

      {result?.rows && rows.length === 0 ? (
        <div className="flex items-end justify-between gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 overflow-hidden">
          <div className="pb-6">
            <p className="crm-display text-[17px] mb-1">Nenhum cliente neste mês</p>
            <p className="text-[12.5px] text-crm-dim">Os clientes ativos aparecem aqui para registrar o acompanhamento de cada mês.</p>
          </div>
          <Mascot name="titanWin" decorative className="h-28 w-auto shrink-0" />
        </div>
      ) : (
        <ul className={`space-y-2 transition-opacity ${loading ? "opacity-60" : ""}`} aria-label="Clientes do mês">
          {visible.map((r) => (
            <li key={r.clientId}>
              <button
                type="button"
                onClick={() => onOpenClient(r.clientId, month)}
                className="w-full text-left rounded-xl border border-crm-line bg-crm-card px-4 py-3 shadow-[var(--crm-shadow)] hover:border-crm-line-strong transition-colors"
              >
                <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <span className="font-semibold text-[14px] min-w-0 truncate">{r.companyName}</span>
                  <ClientStatusChip value={r.status} />
                  {r.ownerName && (
                    <span className="inline-flex items-center gap-1 text-[11.5px] text-crm-dim">
                      <OwnerAvatar name={r.ownerName} />
                      {r.ownerName}
                    </span>
                  )}
                  <span className={`ml-auto text-[12px] font-semibold ${r.report ? "text-crm-green" : "text-crm-amber"}`}>
                    {r.report ? "Atualizado" : "Pendente"}
                  </span>
                </span>
                <span className="mt-1 block text-[12px] text-crm-dim">
                  {r.report
                    ? `Por ${r.report.updatedByName ?? "—"} em ${dateTime(r.report.updatedAt)}${r.report.ownerName ? ` · responsável: ${r.report.ownerName}` : ""}`
                    : r.services.length
                      ? `Serviços: ${r.services.map((s) => label("service", s)).join(", ")}`
                      : "Sem contrato vigente"}
                </span>
                {r.report?.attention && <span className="mt-0.5 block text-[12px] text-crm-amber truncate">Atenção: {r.report.attention}</span>}
              </button>
            </li>
          ))}
          {visible.length === 0 && rows.length > 0 && (
            <li className="text-[12.5px] text-crm-dim">{show === "pendentes" ? "Todos os clientes já têm o acompanhamento do mês." : "Nenhum acompanhamento registrado neste mês ainda."}</li>
          )}
        </ul>
      )}
    </section>
  );
}
