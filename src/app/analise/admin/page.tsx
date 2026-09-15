import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { sessionScopeFromCookieStore } from "@/lib/auth-context";
import { isFullAdmin, STAFF_ROLE_LABELS } from "@/lib/session-scope";
import { listAdAccounts, MetaApiError } from "@/lib/meta-ads";
import { listClientAccess } from "@/lib/client-access";
import { listInternalUsers } from "@/lib/internal-users";
import { DbConfigError } from "@/lib/db";
import AnaliseHeader from "@/components/analise/AnaliseHeader";
import AdminClientsPanel from "@/components/analise/AdminClientsPanel";
import AdminUsersPanel from "@/components/analise/AdminUsersPanel";

export const metadata: Metadata = {
  title: "Usuários e acessos — Legado Intelligence",
  robots: { index: false, follow: false },
};

export default async function AnaliseAdminPage() {
  const scope = await sessionScopeFromCookieStore();
  if (!scope) redirect("/analise/login/");
  if (scope.mustChangePassword) redirect("/analise/trocar-senha/");
  if (!isFullAdmin(scope)) redirect("/analise/");

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
  let internalUsers: Awaited<ReturnType<typeof listInternalUsers>> = [];
  let dbNotConfigured = false;
  try {
    [clients, internalUsers] = await Promise.all([listClientAccess(), listInternalUsers()]);
  } catch (err) {
    if (err instanceof DbConfigError) {
      dbNotConfigured = true;
    } else {
      console.error("[analise/admin] failed to list client access", err);
      accountsError = accountsError ?? "Não foi possível carregar os clientes.";
    }
  }

  return (
    <main className="min-h-screen overflow-x-hidden bg-intel-ambient bg-intel-grid">
      <AnaliseHeader isAdmin clientLabel={`${scope.userName} · ${STAFF_ROLE_LABELS[scope.role]}`} />
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-8">
        <Link
          href="/analise/"
          className="inline-flex items-center gap-1.5 text-[13px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200 mb-6"
        >
          <span aria-hidden="true">←</span> Voltar ao painel
        </Link>
        <h1 className="font-sans text-2xl font-semibold text-intel-text mb-1">Usuários e acessos</h1>
        <p className="text-sm text-intel-text-dim mb-8">
          Crie e administre os acessos da equipe Legado e dos clientes — cada seção tem sua própria listagem, busca e criação.
        </p>

        {dbNotConfigured ? (
          <div className="rounded-2xl border border-white/[0.08] bg-intel-surface-1 p-8 max-w-xl">
            <p className="font-sans text-xl font-semibold text-intel-text mb-2">
              Banco de dados ainda não configurado
            </p>
            <p className="text-sm text-intel-text-dim leading-relaxed">
              Os acessos ficam guardados num banco Postgres, que ainda não
              está conectado a este projeto. Siga o passo a passo em{" "}
              <code className="text-sm bg-white/[0.06] px-1.5 py-0.5 rounded">
                docs/client-access-setup.md
              </code>{" "}
              para conectar um banco (Vercel → Storage → Connect Database) e
              depois recarregue esta página.
            </p>
          </div>
        ) : (
          <>
            <h2 className="font-sans text-xl font-semibold text-intel-text mb-1">Equipe Legado</h2>
            <p className="text-sm text-intel-text-dim mb-6">
              Administradores, gestores, analistas e demais funcionários com acesso à plataforma.
            </p>
            <AdminUsersPanel accounts={accounts} accountsError={accountsError} initialUsers={internalUsers} />

            <h2 className="font-sans text-xl font-semibold text-intel-text mb-1 mt-14">Clientes</h2>
            <p className="text-sm text-intel-text-dim mb-6">
              Empresas atendidas e as pessoas que acessam os dados de cada uma.
            </p>
            <AdminClientsPanel accounts={accounts} accountsError={accountsError} initialClients={clients} />
          </>
        )}
      </div>
    </main>
  );
}
