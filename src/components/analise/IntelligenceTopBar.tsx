"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type ConnectionState = "ok" | "partial" | "down";

type IntelligenceTopBarProps = {
  sectionLabel: string;
  clientLabel: string | null;
  accountsCount: number;
  lastSyncIso: string;
  connectionState: ConnectionState;
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

const CONNECTION_COPY: Record<ConnectionState, { label: string; dot: string }> = {
  ok: { label: "Conectado", dot: "bg-intel-green" },
  partial: { label: "Parcial", dot: "bg-amber-400" },
  down: { label: "Indisponível", dot: "bg-intel-red" },
};

export default function IntelligenceTopBar({
  sectionLabel,
  clientLabel,
  accountsCount,
  lastSyncIso,
  connectionState,
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

  const accountContext =
    clientLabel ?? (accountsCount === 1 ? "1 conta de anúncios" : `${accountsCount} contas de anúncios`);
  const connection = CONNECTION_COPY[connectionState];

  return (
    <header className="bg-intel-surface-1/80 backdrop-blur-sm border-b border-white/[0.06]">
      <div className="px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3 min-w-0">
          <button
            type="button"
            onClick={onOpenMobileMenu}
            aria-label="Abrir menu"
            className="lg:hidden shrink-0 flex h-9 w-9 items-center justify-center rounded-lg border border-white/10 text-intel-text-dim"
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path d="M3 6h18M3 12h18M3 18h18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <div className="min-w-0">
            <h1 className="font-sans text-[17px] font-semibold text-intel-text leading-tight truncate">
              {sectionLabel}
            </h1>
            <p className="text-[12px] text-intel-text-dim truncate mt-0.5">{accountContext}</p>
          </div>
        </div>

        <div className="flex items-center gap-4 sm:gap-5 shrink-0">
          <div className="hidden sm:flex items-center gap-2 text-[11px] text-intel-text-dim">
            <span className={`h-1.5 w-1.5 rounded-full ${connection.dot}`} aria-hidden="true" />
            <span>{connection.label}</span>
            <span className="text-white/15">·</span>
            <span>Sync {formatSyncTime(lastSyncIso)}</span>
          </div>

          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-[12px] tracking-[0.08em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200 disabled:opacity-60"
          >
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </div>
    </header>
  );
}
