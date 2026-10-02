"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { formatCurrencyBRL, formatInteger } from "@/lib/format";
import { projectedSpend, pacingStatus, PACING_LABEL } from "@/lib/budget-pacing";
import type { BudgetStatusResponse } from "@/app/api/analise/budget-status/route";

type BudgetCardProps = {
  accountIds: Set<string>;
  isAdmin: boolean;
};

const PACING_TONE: Record<string, string> = {
  "no-ritmo": "text-intel-green",
  acima: "text-intel-amber",
  abaixo: "text-intel-amber",
};

/**
 * Always about the CURRENT calendar month to date — independent of
 * whatever period the rest of the dashboard is filtered to, which this
 * card says explicitly so it never reads as disagreeing with the KPIs
 * above it. Re-fetches whenever the live account/client filter changes
 * (accountIds), since that's what decides which client(s) it's about.
 */
export default function BudgetCard({ accountIds, isAdmin }: BudgetCardProps) {
  const [status, setStatus] = useState<BudgetStatusResponse | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const qs = accountIds.size > 0 ? `?accountIds=${[...accountIds].map(encodeURIComponent).join(",")}` : "";
    (async () => {
      try {
        const res = await fetch(`/api/analise/budget-status/${qs}`);
        if (!res.ok) throw new Error("failed");
        const body = (await res.json()) as BudgetStatusResponse;
        if (!cancelled) {
          setStatus(body);
          setError(false);
        }
      } catch {
        if (!cancelled) setError(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [accountIds]);

  if (error || !status || status.kind === "none") return null;

  const withBudget = status.clients.filter((c) => c.budget !== null);
  const withoutBudget = status.clients.filter((c) => c.budget === null);

  // No client in scope has a budget registered at all.
  if (withBudget.length === 0) {
    if (!isAdmin) return null;
    return (
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-5">
        <p className="text-[13px] font-medium text-intel-text mb-1">Orçamento do mês</p>
        <p className="text-[12.5px] text-intel-text-dim mb-3">
          {status.clients.length === 1 ? status.clients[0].label : "Os clientes selecionados"} ainda{" "}
          {status.clients.length === 1 ? "não tem" : "não têm"} orçamento de mídia cadastrado para este mês.
        </p>
        <Link
          href="/intelligence/admin/"
          className="inline-block text-[12px] tracking-[0.06em] uppercase px-3.5 py-2 rounded-full bg-intel-cyan/[0.14] text-intel-cyan hover:bg-intel-cyan/[0.22] transition-colors duration-200"
        >
          Cadastrar orçamento deste mês
        </Link>
      </div>
    );
  }

  const spend = withBudget.reduce((sum, c) => sum + c.spendMonthToDate, 0);
  const budget = withBudget.reduce((sum, c) => sum + (c.budget ?? 0), 0);
  const projected = projectedSpend(spend, status.dayOfMonth, status.daysInMonth);
  const pacing = pacingStatus(projected, budget);
  const usedPct = budget > 0 ? Math.min((spend / budget) * 100, 100) : 0;
  const elapsedPct = (status.dayOfMonth / status.daysInMonth) * 100;

  return (
    <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
        <p className="text-[13px] font-medium text-intel-text">Orçamento do mês</p>
        <span className={`text-[11px] tracking-[0.04em] uppercase font-medium ${PACING_TONE[pacing]}`}>{PACING_LABEL[pacing]}</span>
      </div>
      <p className="text-[11px] text-intel-text-dim/70 mb-3">Sempre sobre o mês atual, independente do período filtrado acima.</p>

      <div className="flex items-baseline justify-between text-[13px] text-intel-text mb-1.5">
        <span className="tabular-nums">{formatCurrencyBRL(spend)} investidos</span>
        <span className="tabular-nums text-intel-text-dim">de {formatCurrencyBRL(budget)}</span>
      </div>

      <div className="relative h-2 rounded-full bg-white/[0.08] overflow-hidden">
        <div
          className="absolute inset-y-0 left-0 rounded-full"
          style={{ width: `${usedPct}%`, background: "linear-gradient(90deg, #D9DEE5, #FFFFFF)" }}
        />
        <div
          className="absolute top-0 bottom-0 w-[2px] bg-intel-text/60"
          style={{ left: `${Math.min(elapsedPct, 100)}%` }}
          title={`Dia ${status.dayOfMonth} de ${status.daysInMonth}`}
        />
      </div>
      <p className="mt-1.5 text-[11px] text-intel-text-dim">
        Dia {status.dayOfMonth} de {status.daysInMonth} · projeção até o fim do mês: {formatCurrencyBRL(projected)}
      </p>

      {withoutBudget.length > 0 && (
        <p className="mt-3 pt-3 border-t border-white/[0.06] text-[11.5px] text-intel-text-dim">
          Sem orçamento cadastrado: {withoutBudget.map((c) => c.label).join(", ")}
        </p>
      )}
      {withBudget.length > 1 && (
        <p className="mt-1 text-[11px] text-intel-text-dim/70">Soma de {formatInteger(withBudget.length)} clientes com orçamento cadastrado.</p>
      )}
    </div>
  );
}
