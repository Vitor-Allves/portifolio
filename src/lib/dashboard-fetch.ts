"use client";

// Client-side fetch for /api/meta-ads/campaigns, shared by the live
// dashboard's own period switcher (Dashboard.tsx) and the isolated
// report-template generation flow (ReportsPanel.tsx) — both need the exact
// same request shape, and a report generated for a given period should
// never silently diverge from what switching the dashboard to that period
// would show.

import type { AccountReach, DateRange, DashboardData, Period } from "./meta-ads-types";

export class DashboardFetchError extends Error {}

export async function fetchDashboardData(period: Period, compare: boolean): Promise<DashboardData> {
  const params = new URLSearchParams();
  if (period.kind === "preset") {
    params.set("date_preset", period.preset);
  } else {
    params.set("since", period.range.since);
    params.set("until", period.range.until);
  }
  if (compare) params.set("compare", "1");

  const res = await fetch(`/api/meta-ads/campaigns/?${params.toString()}`);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new DashboardFetchError(body?.error ?? "Não foi possível carregar os dados.");
  }
  return (await res.json()) as DashboardData;
}

export type ScopedReachResult = {
  resolvedRange: DateRange;
  currentReach: AccountReach[];
  comparisonRange: DateRange | null;
  previousReach: AccountReach[] | null;
  /** Account ids requested but missing from `currentReach` — their own call failed; never silently read as reach 0. */
  failedAccountIds: string[];
};

/**
 * Meta's own deduplicated reach for an exact campaign-id subset per
 * account — called whenever campaign/ad set/objective/status filters have
 * narrowed the view away from "every campaign in this account". Never a
 * substitute for the plain whole-account reach already in the main
 * dashboard payload; only meaningful once a filter has actually narrowed
 * the scope.
 */
export async function fetchScopedReach(
  period: Period,
  compare: boolean,
  campaignIdsByAccount: Record<string, string[]>
): Promise<ScopedReachResult> {
  const res = await fetch("/api/meta-ads/reach/", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ period, compare, campaignIdsByAccount }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new DashboardFetchError(body?.error ?? "Não foi possível calcular o alcance para este filtro.");
  }
  return (await res.json()) as ScopedReachResult;
}
