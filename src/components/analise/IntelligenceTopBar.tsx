"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type IntelligenceTopBarProps = {
  clientLabel: string | null;
  accountsCount: number;
  lastSyncIso: string;
  onOpenMobileMenu: () => void;
};

function formatSyncTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

export default function IntelligenceTopBar({
  clientLabel,
  accountsCount,
  lastSyncIso,
  onOpenMobileMenu,
}: IntelligenceTopBarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/analise/logout/", { method: "POST" }).catch(() => {});
    router.push("/analise/login/");
    router.refresh();
  }

  const accountLabel =
    clientLabel ?? (accountsCount === 1 ? "1 conta de anúncios" : `${accountsCount} contas de anúncios`);

  return (
    <header className="border-b border-navy-700/10 bg-white">
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu"
            className="lg:hidden shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border border-navy-700/15 text-navy-700"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <p className="text-[13px] font-medium text-navy-950 truncate">{accountLabel}</p>
            <p className="text-[11px] text-navy-500 truncate">
              Dados via Meta Business Manager · sincronizado em {formatSyncTime(lastSyncIso)}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={handleLogout}
          disabled={loggingOut}
          className="shrink-0 text-[12px] tracking-[0.08em] uppercase text-navy-600 hover:text-navy-950 transition-colors disabled:opacity-60"
        >
          {loggingOut ? "Saindo..." : "Sair"}
        </button>
      </div>
    </header>
  );
}
