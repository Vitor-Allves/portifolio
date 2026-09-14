"use client";

// Client-side fetch for /api/meta-ads/campaigns, shared by the live
// dashboard's own period switcher (Dashboard.tsx) and the isolated
// report-template generation flow (ReportsPanel.tsx) — both need the exact
// same request shape, and a report generated for a given period should
// never silently diverge from what switching the dashboard to that period
// would show.

import type { DashboardData, Period } from "./meta-ads-types";

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
