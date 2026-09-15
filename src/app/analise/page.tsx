import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { isFullAdmin } from "@/lib/session-scope";
import { getDashboardData, MetaConfigError, MetaApiError, type Period } from "@/lib/meta-ads";
import Dashboard from "@/components/analise/Dashboard";
import NotConfigured from "@/components/analise/NotConfigured";

export const metadata: Metadata = {
  title: "Análise de Campanhas",
  robots: { index: false, follow: false },
};

const DEFAULT_PERIOD: Period = { kind: "preset", preset: "last_30d" };

export default async function AnalisePage() {
  // Defense in depth: middleware already gates this route, but a page-level
  // check keeps it safe even if the middleware matcher is ever changed.
  const token = (await cookies()).get(ANALISE_SESSION_COOKIE)?.value;
  const scope = verifySessionToken(token);
  if (!scope) {
    redirect("/analise/login");
  }

  const allowedAccountIds = scope.kind === "client" ? scope.accountIds : undefined;
  const clientPermissions = scope.kind === "client" ? scope.permissions : null;
  // Internal Legado viewer (admin or analyst) — distinct from isFullAdmin,
  // which gates the admin *panel* specifically. Used only to decide how
  // much technical/infra detail a viewer is shown, never data access.
  const isInternal = scope.kind === "admin";
  // Header subtitle: a client's business name, or — for a named internal
  // login — who's signed in. The legacy shared admin password has no
  // identity to show, so it falls back to the header's own default text.
  const viewerLabel =
    scope.kind === "client"
      ? scope.label
      : scope.userName
        ? `${scope.userName} · ${scope.role === "admin" ? "Administrador" : "Analista"}`
        : null;
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
