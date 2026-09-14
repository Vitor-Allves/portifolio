import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { listAdAccounts, MetaApiError } from "@/lib/meta-ads";
import { listClientAccess } from "@/lib/client-access";
import { DbConfigError } from "@/lib/db";
import AnaliseHeader from "@/components/analise/AnaliseHeader";
import AdminClientsPanel from "@/components/analise/AdminClientsPanel";

export const metadata: Metadata = {
  title: "Clientes — Análise de Campanhas",
  robots: { index: false, follow: false },
};

export default async function AnaliseAdminPage() {
  const token = (await cookies()).get(ANALISE_SESSION_COOKIE)?.value;
  const scope = verifySessionToken(token);
  if (!scope) redirect("/analise/login");
  if (scope.kind !== "admin") redirect("/analise");

  let accounts: Awaited<ReturnType<typeof listAdAccounts>> = [];
  let accountsError: string | null = null;
  try {
    accounts = await listAdAccounts();
  } catch (err) {
    console.error("[analise/admin] failed to list ad accounts", err);
    accountsError =
      err instanceof MetaApiError
        ? err.message
        : "Não foi possível carregar as contas de anúncio da Meta.";
  }

  let clients: Awaited<ReturnType<typeof listClientAccess>> = [];
  let dbNotConfigured = false;
  try {
    clients = await listClientAccess();
  } catch (err) {
    if (err instanceof DbConfigError) {
      dbNotConfigured = true;
    } else {
      console.error("[analise/admin] failed to list client access", err);
      accountsError = accountsError ?? "Não foi possível carregar os clientes.";
    }
  }

  return (
    <main className="min-h-screen bg-ice-50">
      <AnaliseHeader isAdmin clientLabel={null} />
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-8">
        <Link
          href="/analise/"
          className="inline-flex items-center gap-1.5 text-[13px] tracking-[0.06em] uppercase text-navy-500 hover:text-navy-950 transition-colors mb-6"
        >
          <span aria-hidden="true">←</span> Voltar ao painel
        </Link>
        <h1 className="font-serif text-2xl text-navy-950 mb-1">Acessos de clientes</h1>
        <p className="text-sm text-navy-500 mb-8">
          Crie um login separado para cada cliente ver apenas as próprias campanhas.
        </p>

        {dbNotConfigured ? (
          <div className="rounded-2xl border border-navy-700/15 bg-white p-8 max-w-xl">
            <p className="font-serif text-xl text-navy-950 mb-2">
              Banco de dados ainda não configurado
            </p>
            <p className="text-sm text-navy-700/80 leading-relaxed">
              Os acessos de clientes ficam guardados num banco Postgres, que
              ainda não está conectado a este projeto. Siga o passo a passo em{" "}
              <code className="text-sm bg-silver-100 px-1.5 py-0.5 rounded">
                docs/client-access-setup.md
              </code>{" "}
              para conectar um banco (Vercel → Storage → Connect Database) e
              depois recarregue esta página.
            </p>
          </div>
        ) : (
          <AdminClientsPanel
            accounts={accounts}
            accountsError={accountsError}
            initialClients={clients}
          />
        )}
      </div>
    </main>
  );
}
