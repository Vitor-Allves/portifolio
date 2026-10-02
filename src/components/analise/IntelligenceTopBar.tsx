"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { REFERENCE_TIME_ZONE } from "@/lib/format";
import type { ConsultantInfo } from "@/lib/consultant-whatsapp";
import ConsultantWhatsAppButton from "./ConsultantWhatsAppButton";

type ConnectionState = "ok" | "partial" | "down";

type IntelligenceTopBarProps = {
  sectionLabel: string;
  clientLabel: string | null;
  accountsCount: number;
  lastSyncIso: string;
  connectionState: ConnectionState;
  onOpenMobileMenu: () => void;
  consultant: ConsultantInfo | null;
  periodLabel: string;
  privacyMode: boolean;
  onTogglePrivacyMode: () => void;
};

// Always horário de Brasília, regardless of the viewer's own device
// timezone — matches the PDF report's "Fuso horário de referência" so the
// two never disagree on when the data was last updated.
function formatSyncTime(iso: string): string {
  try {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: REFERENCE_TIME_ZONE,
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
  consultant,
  periodLabel,
  privacyMode,
  onTogglePrivacyMode,
}: IntelligenceTopBarProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/analise/logout/", { method: "POST" }).catch(() => {});
    router.push("/intelligence/login/");
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
            <span title="Horário de Brasília (America/Sao_Paulo)">Atualizado {formatSyncTime(lastSyncIso)} (BRT)</span>
          </div>

          <ConsultantWhatsAppButton
            consultant={consultant}
            clientLabel={clientLabel}
            periodLabel={periodLabel}
            screen="cabeçalho"
            variant="header"
            className="hidden sm:inline-flex"
          />

          <button
            type="button"
            onClick={onTogglePrivacyMode}
            aria-pressed={privacyMode}
            title={privacyMode ? "Mostrar valores" : "Ocultar valores (modo privacidade)"}
            className={`flex h-9 w-9 items-center justify-center rounded-full border transition-colors duration-200 ${
              privacyMode
                ? "border-intel-cyan/40 bg-intel-cyan/[0.14] text-intel-cyan"
                : "border-white/10 text-intel-text-dim hover:border-white/20 hover:text-intel-text"
            }`}
          >
            <span className="sr-only">{privacyMode ? "Mostrar valores" : "Ocultar valores"}</span>
            {privacyMode ? (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M3 3l18 18M10.6 10.6a3 3 0 0 0 4.24 4.24M6.6 6.6C4.4 8.1 2.9 10 2 12c1.6 3.6 5.5 7 10 7 1.7 0 3.3-.4 4.7-1.1M17.4 17.4C19.6 15.9 21.1 14 22 12c-1-2.2-2.7-4.4-4.9-5.9A11.7 11.7 0 0 0 12 5c-.6 0-1.2 0-1.8.1"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <svg width="17" height="17" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                <path
                  d="M2 12c1.6-3.6 5.5-7 10-7s8.4 3.4 10 7c-1.6 3.6-5.5 7-10 7s-8.4-3.4-10-7Z"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinejoin="round"
                />
                <circle cx="12" cy="12" r="3" stroke="currentColor" strokeWidth="1.8" />
              </svg>
            )}
          </button>

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
