"use client";

import Link from "next/link";
import Logo from "@/components/Logo";

export type SectionId = "overview" | "campaigns" | "insights" | "reports" | "integrations";

export const SECTIONS: { id: SectionId; label: string }[] = [
  { id: "overview", label: "Visão geral" },
  { id: "campaigns", label: "Campanhas" },
  { id: "insights", label: "Análises estratégicas" },
  { id: "reports", label: "Relatórios" },
  { id: "integrations", label: "Integrações" },
];

const ICONS: Record<SectionId, React.ReactNode> = {
  overview: <path d="M3 13h4v7H3v-7Zm7-9h4v16h-4V4Zm7 5h4v11h-4V9Z" />,
  campaigns: <path d="M4 4h16v3H4V4Zm0 6.5h16v3H4v-3ZM4 17h10v3H4v-3Z" />,
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
  collapsed: boolean;
  onToggleCollapsed: () => void;
  hiddenSectionIds: Set<string>;
};

function NavButton({
  section,
  isActive,
  collapsed,
  onClick,
}: {
  section: (typeof SECTIONS)[number];
  isActive: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={isActive ? "page" : undefined}
      title={collapsed ? section.label : undefined}
      className={`group relative w-full flex items-center gap-3 rounded-lg py-2.5 text-[13px] tracking-[0.01em] transition-colors duration-200 ${
        collapsed ? "justify-center px-0" : "px-3"
      } ${
        isActive
          ? "bg-white/[0.06] text-intel-text"
          : "text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text"
      }`}
    >
      <span
        aria-hidden="true"
        className={`absolute left-0 top-1/2 -translate-y-1/2 h-4 w-[2.5px] rounded-full bg-intel-cyan transition-opacity duration-200 ${
          isActive ? "opacity-100" : "opacity-0"
        }`}
      />
      <svg
        width="17"
        height="17"
        viewBox="0 0 24 24"
        fill="currentColor"
        aria-hidden="true"
        className={`shrink-0 transition-colors duration-200 ${isActive ? "text-intel-cyan" : ""}`}
      >
        {ICONS[section.id]}
      </svg>
      {!collapsed && <span>{section.label}</span>}
    </button>
  );
}

function SidebarContent({
  active,
  onSelect,
  isAdmin,
  onNavigate,
  collapsed,
  onToggleCollapsed,
  showCollapseToggle,
  visibleSections,
}: {
  active: SectionId;
  onSelect: (section: SectionId) => void;
  isAdmin: boolean;
  onNavigate: () => void;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  showCollapseToggle: boolean;
  visibleSections: typeof SECTIONS;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className={`pt-7 pb-6 border-b border-white/[0.06] ${collapsed ? "px-3" : "px-5"}`}>
        {collapsed ? (
          <img src="/icon.png" alt="Legado" width={34} height={34} className="mx-auto" />
        ) : (
          <>
            <Logo variant="onDark" size="sm" className="!h-11" />
            <p className="mt-2.5 text-[10.5px] tracking-[0.2em] uppercase text-intel-text-dim">
              Intelligence
            </p>
          </>
        )}
      </div>

      <nav className="flex-1 py-4 px-2.5 space-y-0.5" aria-label="Navegação principal">
        {visibleSections.map((section) => (
          <NavButton
            key={section.id}
            section={section}
            isActive={section.id === active}
            collapsed={collapsed}
            onClick={() => {
              onSelect(section.id);
              onNavigate();
            }}
          />
        ))}
      </nav>

      {!collapsed && (
        <div className="px-3 pb-2 flex items-end justify-center gap-1 opacity-90">
          <img
            src="/login/titan-720.webp"
            alt="Titan, mascote analista da Legado Enterprise"
            className="h-40 w-auto object-contain object-bottom"
          />
          <img
            src="/login/legacy-720.webp"
            alt="Legacy, mascote analista da Legado Enterprise"
            className="h-40 w-auto object-contain object-bottom"
          />
        </div>
      )}

      {isAdmin && (
        <div className="px-2.5 pb-2">
          <Link
            href="/analise/admin/"
            title={collapsed ? "Acessos de clientes" : undefined}
            className={`w-full flex items-center gap-3 rounded-lg py-2.5 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-200 ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
              <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.66-8 5v1h16v-1c0-3.34-4.7-5-8-5Z" />
            </svg>
            {!collapsed && <span>Acessos de clientes</span>}
          </Link>
        </div>
      )}

      {showCollapseToggle && (
        <div className="px-2.5 pb-4 pt-1 border-t border-white/[0.06]">
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={`w-full flex items-center gap-3 rounded-lg py-2 text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-200 ${
              collapsed ? "justify-center px-0" : "px-3"
            }`}
          >
            <svg
              width="15"
              height="15"
              viewBox="0 0 24 24"
              fill="none"
              aria-hidden="true"
              className={`shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}
            >
              <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed && <span className="text-[12px]">Recolher</span>}
          </button>
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
  collapsed,
  onToggleCollapsed,
  hiddenSectionIds,
}: IntelligenceSidebarProps) {
  // "overview" is never hideable — always somewhere for a client to land.
  const visibleSections = SECTIONS.filter((s) => s.id === "overview" || !hiddenSectionIds.has(s.id));

  return (
    <>
      <aside
        className={`hidden lg:flex lg:shrink-0 lg:flex-col bg-intel-surface-1 border-r border-white/[0.06] sticky top-0 h-screen transition-[width] duration-200 ${
          collapsed ? "lg:w-[76px]" : "lg:w-60"
        }`}
      >
        <SidebarContent
          active={active}
          onSelect={onSelect}
          isAdmin={isAdmin}
          onNavigate={() => {}}
          collapsed={collapsed}
          onToggleCollapsed={onToggleCollapsed}
          showCollapseToggle
          visibleSections={visibleSections}
        />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-40">
          <button
            type="button"
            aria-label="Fechar menu"
            onClick={onCloseMobile}
            className="absolute inset-0 bg-black/60"
          />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[80vw] bg-intel-surface-1 border-r border-white/[0.06] shadow-2xl">
            <SidebarContent
              active={active}
              onSelect={onSelect}
              isAdmin={isAdmin}
              onNavigate={onCloseMobile}
              collapsed={false}
              onToggleCollapsed={onToggleCollapsed}
              showCollapseToggle={false}
              visibleSections={visibleSections}
            />
          </aside>
        </div>
      )}
    </>
  );
}
