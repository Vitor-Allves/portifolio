import type { Metadata } from "next";
import Link from "next/link";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sessionScopeFromCookieStore } from "@/lib/auth-context";
import { DbConfigError } from "@/lib/db";
import { listContacts, listQuickReplies, listTeam } from "@/lib/crm";
import { isWhatsAppConfigured } from "@/lib/whatsapp";
import CrmApp from "@/components/crm/CrmApp";
import { CRM_THEME_COOKIE, parseCrmTheme } from "@/components/crm/crm-theme";

export const metadata: Metadata = {
  title: "CRM · Legado",
  robots: { index: false, follow: false },
};

async function loadBoard() {
  const [contacts, team, quickReplies] = await Promise.all([listContacts(), listTeam(), listQuickReplies()]);
  return { contacts, team, quickReplies };
}

export default async function CrmPage() {
  const scope = await sessionScopeFromCookieStore();
  if (!scope) redirect("/intelligence/login/?from=/crm/");
  if (scope.mustChangePassword) redirect("/intelligence/trocar-senha/");
  // Internal team only — a client login goes back to its own dashboard.
  if (scope.kind !== "staff") redirect("/intelligence/");

  let loaded: Awaited<ReturnType<typeof loadBoard>> | null = null;
  let loadError: unknown = null;
  try {
    loaded = await loadBoard();
  } catch (err) {
    loadError = err;
  }

  if (loaded) {
    const theme = parseCrmTheme((await cookies()).get(CRM_THEME_COOKIE)?.value);
    return (
      <CrmApp
        initialContacts={loaded.contacts}
        team={loaded.team}
        initialQuickReplies={loaded.quickReplies}
        whatsappConfigured={isWhatsAppConfigured()}
        templatesConfigured={Boolean(process.env.WHATSAPP_BUSINESS_ACCOUNT_ID)}
        currentUserId={scope.userId}
        currentUserName={scope.userName}
        initialTheme={theme}
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
