"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import Logo from "@/components/Logo";

type AnaliseHeaderProps = {
  isAdmin: boolean;
  clientLabel: string | null;
};

export default function AnaliseHeader({ isAdmin, clientLabel }: AnaliseHeaderProps) {
  const router = useRouter();
  const [loggingOut, setLoggingOut] = useState(false);

  async function handleLogout() {
    setLoggingOut(true);
    await fetch("/api/analise/logout/", { method: "POST" }).catch(() => {});
    router.push("/analise/login/");
    router.refresh();
  }

  return (
    <header className="border-b border-white/[0.06] bg-intel-surface-1/80 backdrop-blur-sm">
      <div className="mx-auto max-w-[1400px] px-6 lg:px-10 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Logo variant="onDark" size="sm" className="!h-10" />
          <div>
            <p className="font-sans text-[15px] font-semibold text-intel-text leading-tight">
              Legado Intelligence
            </p>
            <p className="text-xs text-intel-text-dim">
              {clientLabel ?? "Gerenciador de Anúncios — Meta"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-6">
          {isAdmin && (
            <Link
              href="/analise/admin/"
              className="text-[13px] tracking-[0.1em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200"
            >
              Clientes
            </Link>
          )}
          <button
            type="button"
            onClick={handleLogout}
            disabled={loggingOut}
            className="text-[13px] tracking-[0.1em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200 disabled:opacity-60"
          >
            {loggingOut ? "Saindo..." : "Sair"}
          </button>
        </div>
      </div>
    </header>
  );
}
