import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessionScopeFromCookieStore } from "@/lib/auth-context";
import { isFullAdmin, resolveAllowedAccountIds, STAFF_ROLE_LABELS } from "@/lib/session-scope";
import { getDashboardData, MetaConfigError, MetaApiError, type Period } from "@/lib/meta-ads";
import Dashboard from "@/components/analise/Dashboard";
import NotConfigured from "@/components/analise/NotConfigured";

export const metadata: Metadata = {
  title: "Análise de Campanhas",
  robots: { index: false, follow: false },
};

// This page fetches every selected account's campaigns/insights from the
// Meta Graph API synchronously before rendering — inherently variable
// latency that grows with the number of linked accounts, and was hitting
// the platform's default 10s function budget as 504s in production
// (GET /analise/, "Task timed out after 10 seconds"). Raised here rather
// than optimizing the fetch itself: the account fan-out is already fully
// parallelized (Promise.allSettled per account in meta-ads.ts), so the
// remaining latency is Meta's own response time, not something this code
// controls.
export const maxDuration = 60;

const DEFAULT_PERIOD: Period = { kind: "preset", preset: "last_30d" };

export default async function AnalisePage() {
  // Defense in depth: middleware already gates this route, but a page-level
  // check — the authoritative, DB-backed one — keeps it safe even if the
  // middleware matcher is ever changed, and is what actually enforces
  // role/company/permission changes on every load.
  const scope = await sessionScopeFromCookieStore();
  if (!scope) {
    redirect("/analise/login/");
  }
  if (scope.mustChangePassword) {
    redirect("/analise/trocar-senha/");
  }

  const allowedAccountIds = resolveAllowedAccountIds(scope) ?? undefined;
  const clientPermissions = scope.permissions;
  // Internal Legado viewer — distinct from isFullAdmin, which gates the
  // admin panel specifically. Used only to decide how much technical/infra
  // detail a viewer is shown, never data access.
  const isInternal = scope.kind === "staff";
  const viewerLabel = scope.kind === "client" ? scope.label : `${scope.userName} · ${STAFF_ROLE_LABELS[scope.role]}`;
  const dbConfigured = Boolean(process.env.DATABASE_URL || process.env.POSTGRES_URL);

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await getDashboardData(DEFAULT_PERIOD, allowedAccountIds);
  } catch (err) {
    console.error("[analise] failed to load dashboard data", err);
    loadError = err;
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-ice-50">
        <NotConfigured
          reason={loadError instanceof MetaConfigError ? "config" : "api"}
          detail={loadError instanceof MetaApiError ? loadError.message : undefined}
          isInternal={isInternal}
        />
      </main>
    );
  }

  return (
    <Dashboard
      initialData={data}
      isAdmin={isFullAdmin(scope)}
      isInternal={isInternal}
      clientLabel={viewerLabel}
      clientPermissions={clientPermissions}
      dbConfigured={dbConfigured}
    />
  );
}
