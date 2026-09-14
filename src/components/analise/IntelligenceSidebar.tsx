"use client";

import Link from "next/link";

export type SectionId = "overview" | "campaigns" | "insights" | "reports" | "integrations";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "campaigns", label: "Campanhas" },
  { id: "insights", label: "Análises com IA" },
  { id: "reports", label: "Relatórios" },
  { id: "integrations", label: "Integrações" },
];

const ICONS: Record<SectionId, React.ReactNode> = {
  overview: (
    <path d="M3 13h4v7H3v-7Zm7-9h4v16h-4V4Zm7 5h4v11h-4V9Z" />
  ),
  campaigns: (
    <path d="M4 4h16v3H4V4Zm0 6.5h16v3H4v-3ZM4 17h10v3H4v-3Z" />
  ),
  insights: (
    <path d="M12 2a7 7 0 0 0-4 12.74V17a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1v-2.26A7 7 0 0 0 12 2Zm-2 18h4a1 1 0 0 1-1 2h-2a1 1 0 0 1-1-2Z" />
  ),
  reports: (
    <path d="M6 2h9l5 5v15H6V2Zm8 1.5V8h4.5L14 3.5ZM8 12h8v1.5H8V12Zm0 3.5h8V17H8v-1.5Zm0 3.5h5v1.5H8V19Z" />
  ),
  integrations: (
    <path d="M8.5 3a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm7 0a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM8.5 14a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Zm7 0a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7Z" />
  ),
};

type IntelligenceSidebarProps = {
  active: SectionId;
  onSelect: (section: SectionId) => void;
  isAdmin: boolean;
  mobileOpen: boolean;
  onCloseMobile: () => void;
};

function SidebarContent({ active, onSelect, isAdmin, onNavigate }: {
  active: SectionId;
  onSelect: (section: SectionId) => void;
  isAdmin: boolean;
  onNavigate: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="px-6 pt-7 pb-6 border-b border-white/10">
        <p className="font-sans text-base font-semibold tracking-tight text-white">Legado Intelligence</p>
        <p className="mt-1 text-[12px] leading-snug text-silver-400">
          Inteligência de marketing e performance
        </p>
      </div>

      <nav className="flex-1 px-3 py-4 space-y-1" aria-label="Navegação principal">
        {SECTIONS.map((section) => {
          const isActive = section.id === active;
          return (
            <button
              key={section.id}
              type="button"
              onClick={() => {
                onSelect(section.id);
                onNavigate();
              }}
              aria-current={isActive ? "page" : undefined}
              className={`w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] tracking-[0.01em] transition-colors duration-150 ${
                isActive
                  ? "bg-white/10 text-white font-medium"
                  : "text-silver-400 hover:bg-white/5 hover:text-white"
              }`}
            >
              <svg
                width="17"
                height="17"
                viewBox="0 0 24 24"
                fill="currentColor"
                aria-hidden="true"
                className="shrink-0"
              >
                {ICONS[section.id]}
              </svg>
              <span>{section.label}</span>
            </button>
          );
        })}
      </nav>

      {isAdmin && (
        <div className="px-3 pb-4">
          <Link
            href="/analise/admin/"
            className="w-full flex items-center gap-3 rounded-lg px-3 py-2.5 text-[13px] text-silver-400 hover:bg-white/5 hover:text-white transition-colors duration-150"
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.66-8 5v1h16v-1c0-3.34-4.7-5-8-5Z" />
            </svg>
            <span>Acessos de clientes</span>
          </Link>
        </div>
      )}
    </div>
  );
}

export default function IntelligenceSidebar({
  active,
  onSelect,
  isAdmin,
  mobileOpen,
  onCloseMobile,
}: IntelligenceSidebarProps) {
  return (
    <>
      <aside className="hidden lg:flex lg:w-64 lg:shrink-0 lg:flex-col bg-navy-950 sticky top-0 h-screen">
        <SidebarContent active={active} onSelect={onSelect} isAdmin={isAdmin} onNavigate={() => {}} />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-navy-950/50"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-navy-950 shadow-2xl">
            <SidebarContent active={active} onSelect={onSelect} isAdmin={isAdmin} onNavigate={onCloseMobile} />
          </aside>
        </div>
      )}
    </>
  );
}
