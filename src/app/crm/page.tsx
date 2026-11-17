import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionScopeFromCookieStore } from "@/lib/auth-context";
import { DbConfigError } from "@/lib/db";
import { listQuickReplies, listTeam, listUnreadContacts } from "@/lib/crm";
import { listBoardDeals } from "@/lib/crm-deals";
import { listTasks } from "@/lib/crm-tasks";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import { crmSessionFor, visibleTo, type CrmSession } from "@/lib/crm-access";
import CrmApp from "@/components/crm/CrmApp";
import { CRM_SIDEBAR_COOKIE, CRM_THEME_COOKIE, parseCrmTheme } from "@/components/crm/crm-theme";

export const metadata: Metadata = {
  title: "CRM · Legado",
  robots: { index: false, follow: false },
};

async function loadBoard(session: CrmSession) {
  const mine = visibleTo(session);
  const [deals, tasks, inbox, team, quickReplies] = await Promise.all([
    listBoardDeals(mine),
    listTasks({ status: "pending", owner: "all", visibleTo: mine }),
    listUnreadContacts(mine),
    listTeam(),
    listQuickReplies(),
  ]);
  return { deals, tasks, inbox, team, quickReplies };
}

export default async function CrmPage() {
  const scope = await sessionScopeFromCookieStore();
  if (!scope) redirect("/intelligence/login/?from=/crm/");
  if (scope.mustChangePassword) redirect("/intelligence/trocar-senha/");
  // Internal team only — a client login goes back to its own dashboard.
  if (scope.kind !== "staff") redirect("/intelligence/");

  let loaded: Awaited<ReturnType<typeof loadBoard>> | null = null;
  let session: CrmSession | null = null;
  let loadError: unknown = null;
  try {
    session = await crmSessionFor(scope.userId, scope.userName, scope.role);
    if (session) loaded = await loadBoard(session);
  } catch (err) {
    loadError = err;
  }

  if (!loadError && !session) {
    return (
      <main className="min-h-screen flex items-center justify-center px-6">
        <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-8 max-w-md">
          <p className="font-sans text-lg font-semibold text-crm-text mb-2">Sem acesso ao CRM</p>
          <p className="text-sm text-crm-dim leading-relaxed mb-5">
            Seu perfil não tem acesso ao CRM. Se precisar usar, peça a um administrador para liberar em CRM → Equipe.
          </p>
          <Link href="/intelligence/" className="text-[13px] font-semibold text-crm-accent hover:opacity-80">
            ← Voltar ao Intelligence
          </Link>
        </div>
      </main>
    );
  }

  if (loaded && session) {
    const cookieStore = await cookies();
    const theme = parseCrmTheme(cookieStore.get(CRM_THEME_COOKIE)?.value);
    const sidebarCollapsed = cookieStore.get(CRM_SIDEBAR_COOKIE)?.value === "collapsed";
    return (
      <CrmApp
        initialDeals={loaded.deals}
        initialTasks={loaded.tasks}
        initialInbox={loaded.inbox}
        team={loaded.team}
        initialQuickReplies={loaded.quickReplies}
        whatsappConfigured={isWhatsAppConfigured()}
        templatesConfigured={Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID)}
        currentUserId={scope.userId}
        currentUserName={scope.userName}
        initialTheme={theme}
        initialSidebarCollapsed={sidebarCollapsed}
        role={session.role}
      />
    );
  }

  if (!(loadError instanceof DbConfigError)) console.error("[crm] failed to load", loadError);
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-8 max-w-md">
        <p className="font-sans text-lg font-semibold text-crm-text mb-2">Não foi possível abrir o CRM</p>
        <p className="text-sm text-crm-dim leading-relaxed mb-5">
          {loadError instanceof DbConfigError
            ? "O banco de dados ainda não está conectado a este projeto."
            : "Falha ao carregar os contatos. Tente atualizar a página em instantes."}
        </p>
        <Link href="/intelligence/" className="text-[13px] font-semibold text-crm-accent hover:opacity-80">
          ← Voltar ao Intelligence
        </Link>
      </div>
    </main>
  );
}
