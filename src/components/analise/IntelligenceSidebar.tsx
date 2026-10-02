"use client";

import { useState } from "react";
import Link from "next/link";

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
      className={`group relative w-full flex items-center gap-3 rounded-full py-2.5 text-[13px] tracking-[0.01em] transition-colors duration-200 ${
        collapsed ? "justify-center px-0" : "px-3.5"
      } ${
        isActive
          ? "font-medium shadow-[0_8px_22px_-6px_rgba(0,0,0,0.28)]"
          : "text-intel-text-dim hover:bg-white/[0.05] hover:text-intel-text"
      }`}
      style={
        isActive
          ? { background: "linear-gradient(135deg, #FFFFFF 0%, #EEF1F5 38%, #D9DEE5 100%)", color: "#1F3A63" }
          : undefined
      }
    >
      <svg width="17" height="17" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true" className="shrink-0">
        {ICONS[section.id]}
      </svg>
      {!collapsed && <span>{section.label}</span>}
    </button>
  );
}

const SIDEBAR_TIPS = [
  "Combine contas e campanhas no filtro: eles somam, não se substituem.",
  "Ative a comparação para ver o que mudou em relação ao período anterior.",
  "O PDF sai exatamente com os filtros da tela.",
];

const TIP_AVATARS: { src: string; alt: string }[] = [
  { src: "/mascots/titan-boasvindas.webp", alt: "Titan, mascote da Legado" },
  { src: "/mascots/legacy-ola.webp", alt: "Legacy, mascote da Legado" },
];

/** Picked once per mount ("a cada abertura" — each time the sidebar opens, not a running rotation within one session) rather than on every render. */
function SidebarTipCard() {
  const [avatar] = useState(() => TIP_AVATARS[Math.floor(Math.random() * TIP_AVATARS.length)]);
  const [tip] = useState(() => SIDEBAR_TIPS[Math.floor(Math.random() * SIDEBAR_TIPS.length)]);

  return (
    <div className="px-2.5 pb-2.5">
      <div
        className="flex items-center gap-2.5 rounded-xl border px-3 py-2.5"
        style={{ borderColor: "rgba(191,195,201,0.24)", background: "rgba(255,255,255,0.04)" }}
      >
        <img
          src={avatar.src}
          alt={avatar.alt}
          className="h-8 w-8 shrink-0 rounded-full object-cover border border-white/10"
          style={{ objectPosition: "50% 15%" }}
        />
        <p className="text-[11px] leading-snug text-intel-text-dim">{tip}</p>
      </div>
    </div>
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
      <div className={`pt-7 pb-6 border-b border-white/[0.08] flex justify-center ${collapsed ? "px-3" : "px-5"}`}>
        {collapsed ? (
          <img src="/icon.png" alt="Legado" width={34} height={34} />
        ) : (
          <img
            src="/brand/logo-legado-intelligence-branco.png"
            alt="Legado Intelligence"
            className="h-[70px] w-auto object-contain"
          />
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

      {!collapsed && <SidebarTipCard />}

      {isAdmin && (
        <div className="px-2.5 pb-2">
          <Link
            href="/intelligence/admin/"
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
        className={`hidden lg:flex lg:shrink-0 lg:flex-col backdrop-blur-md border-r sticky top-0 h-screen transition-[width] duration-200 ${
          collapsed ? "lg:w-[76px]" : "lg:w-60"
        }`}
        style={{
          background: "linear-gradient(180deg, rgba(8,16,32,0.55) 0%, rgba(8,16,32,0.35) 100%)",
          borderColor: "rgba(191,195,201,0.24)",
        }}
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
          <aside
            className="absolute inset-y-0 left-0 w-72 max-w-[80vw] backdrop-blur-md border-r shadow-2xl"
            style={{
              background: "linear-gradient(180deg, rgba(8,16,32,0.9) 0%, rgba(8,16,32,0.8) 100%)",
              borderColor: "rgba(191,195,201,0.24)",
            }}
          >
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
