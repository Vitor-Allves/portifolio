import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { resolveAllowedAccountIds } from "@/lib/session-scope";
import { listClientAccess } from "@/lib/client-access";
import { getClientBudgetsForClients } from "@/lib/client-budgets";
import { getDashboardData } from "@/lib/meta-ads";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";
// Fans out to Meta the same way the main dashboard fetch does — see the
// comment on src/app/intelligence/page.tsx for why this needs the raised
// function budget.
export const maxDuration = 60;

export type BudgetStatusClient = { clientAccessId: string; label: string; budget: number | null; spendMonthToDate: number };

export type BudgetStatusResponse =
  | { kind: "none" }
  | { kind: "status"; dayOfMonth: number; daysInMonth: number; clients: BudgetStatusClient[] };

function currentYearMonth(untilIso: string): { year: number; month: number; dayOfMonth: number; daysInMonth: number } {
  const [y, m, d] = untilIso.split("-").map(Number);
  const daysInMonth = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { year: y, month: m, dayOfMonth: d, daysInMonth };
}

/**
 * Always about the CURRENT month to date, regardless of whatever period the
 * dashboard itself is filtered to (see BudgetCard.tsx) — scoped to
 * whichever client(s) the caller's account-filter selection resolves to.
 * A client session always resolves to exactly its own one company; a
 * staff/admin session resolves by intersecting ?accountIds= against every
 * registered client's own account list, then uses each matched client's
 * FULL account set for spend (a client's budget is company-wide, not
 * per-individual ad account).
 */
export async function GET(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    if (scope.kind === "client") {
      const data = await getDashboardData({ kind: "preset", preset: "this_month" }, scope.accountIds);
      const { dayOfMonth, daysInMonth, year, month } = currentYearMonth(data.resolvedRange.until);
      const spend = data.campaigns.reduce((sum, c) => sum + c.spend, 0);
      const budgets = await getClientBudgetsForClients([scope.clientAccessId], year, month);
      const response: BudgetStatusResponse = {
        kind: "status",
        dayOfMonth,
        daysInMonth,
        clients: [{ clientAccessId: scope.clientAccessId, label: scope.label, budget: budgets.get(scope.clientAccessId) ?? null, spendMonthToDate: spend }],
      };
      return NextResponse.json(response);
    }

    // Staff/admin: resolve which registered clients the current account
    // filter selection touches. An empty/missing param (or a full admin
    // with no restriction at all) means "everything this session can see".
    const requestedParam = req.nextUrl.searchParams.get("accountIds");
    const requested = requestedParam ? requestedParam.split(",").filter(Boolean) : null;
    const allowed = resolveAllowedAccountIds(scope); // null = unrestricted (full admin)
    const selectedSet = requested ? new Set(requested) : allowed ? new Set(allowed) : null; // null = no restriction at all

    const allClients = await listClientAccess();
    const relevantClients = allClients.filter((c) => (selectedSet ? c.accountIds.some((id) => selectedSet.has(id)) : true));
    if (relevantClients.length === 0) {
      return NextResponse.json({ kind: "none" } satisfies BudgetStatusResponse);
    }

    const unionAccountIds = [...new Set(relevantClients.flatMap((c) => c.accountIds))];
    const data = await getDashboardData({ kind: "preset", preset: "this_month" }, unionAccountIds);
    const { dayOfMonth, daysInMonth, year, month } = currentYearMonth(data.resolvedRange.until);

    const spendByAccount = new Map<string, number>();
    for (const c of data.campaigns) spendByAccount.set(c.accountId, (spendByAccount.get(c.accountId) ?? 0) + c.spend);

    const budgets = await getClientBudgetsForClients(
      relevantClients.map((c) => c.id),
      year,
      month
    );

    const clients: BudgetStatusClient[] = relevantClients.map((c) => ({
      clientAccessId: c.id,
      label: c.label,
      budget: budgets.get(c.id) ?? null,
      spendMonthToDate: c.accountIds.reduce((sum, id) => sum + (spendByAccount.get(id) ?? 0), 0),
    }));

    const response: BudgetStatusResponse = { kind: "status", dayOfMonth, daysInMonth, clients };
    return NextResponse.json(response);
  } catch (err) {
    if (err instanceof DbConfigError) {
      // No budgets can exist without a database — same as "no budget registered" for every client in scope.
      return NextResponse.json({ kind: "none" } satisfies BudgetStatusResponse);
    }
    console.error("[api/analise/budget-status] GET", err);
    return NextResponse.json({ error: "Não foi possível apurar o orçamento do mês." }, { status: 500 });
  }
}
