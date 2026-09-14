import type { Metadata } from "next";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { getDashboardData, MetaConfigError, MetaApiError, type Period } from "@/lib/meta-ads";
import Dashboard from "@/components/analise/Dashboard";
import NotConfigured from "@/components/analise/NotConfigured";
import AnaliseHeader from "@/components/analise/AnaliseHeader";

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
  const clientLabel = scope.kind === "client" ? scope.label : null;

  let data: Awaited<ReturnType<typeof getDashboardData>> | null = null;
  let loadError: unknown = null;
  try {
    data = await getDashboardData(DEFAULT_PERIOD, allowedAccountIds);
  } catch (err) {
    console.error("[analise] failed to load dashboard data", err);
    loadError = err;
  }

  return (
    <main className="min-h-screen bg-ice-50">
      <AnaliseHeader isAdmin={scope.kind === "admin"} clientLabel={clientLabel} />
      {data ? (
        <Dashboard initialData={data} />
      ) : (
        <NotConfigured
          reason={loadError instanceof MetaConfigError ? "config" : "api"}
          detail={loadError instanceof MetaApiError ? loadError.message : undefined}
        />
      )}
    </main>
  );
}
