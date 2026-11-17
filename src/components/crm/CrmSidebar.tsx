"use client";

import Link from "next/link";
import type { CrmTheme } from "./crm-theme";
import CrmThemeToggle from "./CrmThemeToggle";
import { LegadoLockup, Mascot, type MascotName } from "./crm-brand";
import { initials } from "./crm-format";

export type CrmView = "board" | "conversations" | "tasks" | "agenda" | "contacts" | "companies";

/** Every CRM section: the menu label, a one-line hint, what the page is for, and a practical tip. */
export const CRM_SECTIONS: { id: CrmView; label: string; hint: string; description: string; tip: string; mascot: MascotName }[] = [
  {
    id: "board",
    label: "Funil",
    hint: "Oportunidades por etapa",
    description: "Cada card é uma oportunidade de negócio. Arraste entre as colunas para avançar; o topo de cada coluna mostra a quantidade e o valor.",
    tip: "Arraste o card para mudar a etapa. Para marcar como perdido, o CRM pergunta o motivo.",
    mascot: "titanWelcome",
  },
  {
    id: "conversations",
    label: "Conversas",
    hint: "Mensagens do WhatsApp",
    description: "Todas as conversas do WhatsApp, da mais recente para a mais antiga, com a etapa de cada lead no funil.",
    tip: "Depois da última mensagem do lead você tem 24h para responder livremente. Fora disso, só com modelo aprovado.",
    mascot: "legacyHello",
  },
  {
    id: "tasks",
    label: "Tarefas",
    hint: "O que fazer hoje",
    description: "Tarefas atrasadas, de hoje e dos próximos dias, e as mensagens esperando resposta.",
    tip: "Clique no quadradinho para concluir. Ligações e reuniões feitas se registram no painel do contato.",
    mascot: "titanWin",
  },
  {
    id: "agenda",
    label: "Agenda",
    hint: "A semana da equipe",
    description: "Ligações, reuniões e tarefas de cada dia da semana, de toda a equipe ou de uma pessoa.",
    tip: "Use as setas para ver outras semanas. O que já foi feito aparece riscado.",
    mascot: "legacyWin",
  },
  {
    id: "contacts",
    label: "Contatos",
    hint: "Base, importação e exportação",
    description: "A base completa de leads e clientes: busque, filtre, importe planilhas e exporte.",
    tip: "Importe planilhas .xlsx ou .csv. Telefone ou e-mail repetido é barrado antes de gravar.",
    mascot: "titanDoubt",
  },
  {
    id: "companies",
    label: "Empresas",
    hint: "Cadastro de empresas",
    description: "As empresas atendidas e prospectadas, com seus contatos, oportunidades e conquistas.",
    tip: "Contatos com o mesmo nome de empresa ficam juntos aqui, mesmo escritos de jeitos diferentes.",
    mascot: "legacyDoubt",
  },
];

const ICONS: Record<CrmView, React.ReactNode> = {
  board: <path d="M3 4h5v16H3V4Zm6.5 0h5v10h-5V4ZM16 4h5v7h-5V4Z" />,
  conversations: (
    <path d="M4 3.5h16a1.5 1.5 0 0 1 1.5 1.5v10.5A1.5 1.5 0 0 1 20 17H9.2l-4.4 3.7A.5.5 0 0 1 4 20.3V17a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4 3.5Zm3 4.5v1.8h10V8H7Zm0 3.8v1.8h7v-1.8H7Z" />
  ),
  tasks: <path d="M3.5 4.5h5v5h-5v-5Zm7 1.5h10v2h-10V6Zm-7 4.5h5v5h-5v-5Zm7 1.5h10v2h-10v-2Zm-7 4.5h5v5h-5v-5Zm7 1.5h10v2h-10v-2Z" />,
  agenda: (
    <path d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2ZM5 9v10h14V9H5Zm2 2h3v3H7v-3Z" />
  ),
  contacts: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.66-8 5v1h16v-1c0-3.34-4.7-5-8-5Z" />,
  companies: (
    <path d="M4 21V3h10v4h6v14h-7v-4h-2v4H4Zm3-15v2h2V6H7Zm0 4v2h2v-2H7Zm0 4v2h2v-2H7Zm4-8v2h2V6h-2Zm0 4v2h2v-2h-2Zm0 4v2h2v-2h-2Zm5-4v2h2v-2h-2Zm0 4v2h2v-2h-2Z" />
  ),
};

export function CrmSectionIcon({ id, size = 18 }: { id: CrmView; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" fillRule="evenodd" aria-hidden="true" className="shrink-0">
      {ICONS[id]}
    </svg>
  );
}

type SidebarProps = {
  active: CrmView;
  onSelect: (view: CrmView) => void;
  /** Number shown next to a section (unread conversations, tasks due…). */
  badges: Partial<Record<CrmView, number>>;
  collapsed: boolean;
  onToggleCollapsed: () => void;
  mobileOpen: boolean;
  onCloseMobile: () => void;
  currentUserName: string;
  whatsappConfigured: boolean;
  initialTheme: CrmTheme | null;
};

// The active item uses the same silver pill as the Intelligence menu.
const ACTIVE_PILL = { background: "linear-gradient(135deg, #FFFFFF 0%, #EEF1F5 38%, #D9DEE5 100%)", color: "#1F3A63" };

function SidebarContent({
  active,
  onSelect,
  badges,
  collapsed,
  onToggleCollapsed,
  showCollapseToggle,
  currentUserName,
  whatsappConfigured,
  initialTheme,
}: Omit<SidebarProps, "mobileOpen" | "onCloseMobile"> & { showCollapseToggle: boolean }) {
  const section = CRM_SECTIONS.find((s) => s.id === active) ?? CRM_SECTIONS[0];
  return (
    <div className="flex h-full flex-col">
      <div className={`pt-6 pb-5 border-b border-white/[0.08] ${collapsed ? "px-3 flex justify-center" : "px-5"}`}>
        <Link href="/intelligence/" title="Voltar ao Legado Intelligence" className="inline-flex opacity-95 hover:opacity-100 transition-opacity">
          <LegadoLockup markOnly={collapsed} />
        </Link>
        {!collapsed && (
          <p className="mt-3 flex items-baseline gap-2">
            <span className="crm-display text-[15px] tracking-[0.1em] text-crm-header-text">CRM</span>
            <span className="text-[11.5px] text-crm-header-dim">Prospecção e vendas</span>
          </p>
        )}
      </div>

      <nav className="flex-1 overflow-y-auto py-4 px-2.5 space-y-1" aria-label="Seções do CRM">
        {CRM_SECTIONS.map((s) => {
          const isActive = s.id === active;
          const badge = badges[s.id] ?? 0;
          return (
            <button
              key={s.id}
              type="button"
              onClick={() => onSelect(s.id)}
              aria-current={isActive ? "page" : undefined}
              title={collapsed ? `${s.label} · ${s.hint}` : undefined}
              className={`relative w-full flex items-center gap-3 rounded-xl text-left transition-colors duration-200 ${
                collapsed ? "justify-center px-0 py-2.5" : "px-3 py-2"
              } ${isActive ? "shadow-[0_8px_22px_-6px_rgba(0,0,0,0.35)]" : "text-crm-header-dim hover:bg-white/[0.06] hover:text-crm-header-text"}`}
              style={isActive ? ACTIVE_PILL : undefined}
            >
              <CrmSectionIcon id={s.id} />
              {!collapsed && (
                <span className="min-w-0 flex-1">
                  <span className={`block text-[13.5px] ${isActive ? "font-semibold" : "font-medium"}`}>{s.label}</span>
                  <span className={`block text-[11px] leading-snug truncate ${isActive ? "text-[#1F3A63]/70" : "text-crm-header-dim/80"}`}>{s.hint}</span>
                </span>
              )}
              {badge > 0 && (
                <span
                  className={`${collapsed ? "absolute top-1 right-2.5" : ""} min-w-[20px] h-5 px-1.5 rounded-full text-[10.5px] font-semibold flex items-center justify-center tabular-nums ${
                    isActive ? "bg-[#1F3A63] text-white" : "bg-white text-[#1F3A63]"
                  }`}
                  aria-label={`${badge} pendente${badge === 1 ? "" : "s"}`}
                >
                  {badge > 99 ? "99+" : badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-3 pb-3">
          <div className="flex items-end gap-2 rounded-xl border border-white/[0.12] bg-white/[0.04] pl-1 pr-3 pt-2 overflow-hidden">
            <Mascot name={section.mascot} decorative className="h-16 w-auto shrink-0 -mb-px" />
            <p className="pb-2.5 text-[11px] leading-snug text-crm-header-dim">
              <span className="block text-[10px] font-semibold tracking-[0.12em] uppercase text-crm-header-text/80 mb-0.5">Dica</span>
              {section.tip}
            </p>
          </div>
        </div>
      )}

      <div className={`border-t border-white/[0.08] py-3 space-y-2 ${collapsed ? "px-2" : "px-4"}`}>
        <p
          className={`flex items-center gap-2 text-[11.5px] text-crm-header-dim ${collapsed ? "justify-center" : ""}`}
          title={whatsappConfigured ? "WhatsApp conectado" : "WhatsApp ainda não conectado"}
        >
          <span className={`h-2 w-2 rounded-full shrink-0 ${whatsappConfigured ? "bg-emerald-400" : "bg-amber-400"}`} aria-hidden="true" />
          {!collapsed && (whatsappConfigured ? "WhatsApp conectado" : "WhatsApp não conectado")}
          {collapsed && <span className="sr-only">{whatsappConfigured ? "WhatsApp conectado" : "WhatsApp não conectado"}</span>}
        </p>
        <div className={`flex items-center gap-2 ${collapsed ? "flex-col" : ""}`}>
          <span
            title={currentUserName}
            className="h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold text-crm-header-text"
          >
            {initials(currentUserName)}
          </span>
          {!collapsed && <span className="min-w-0 flex-1 truncate text-[12.5px] text-crm-header-text">{currentUserName}</span>}
          <CrmThemeToggle initialTheme={initialTheme} />
        </div>
        {!collapsed && (
          <Link
            href="/intelligence/"
            className="inline-flex items-center gap-1.5 text-[12px] text-crm-header-dim hover:text-crm-header-text transition-colors duration-200"
          >
            Voltar ao Intelligence
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
              <path d="M7 17 17 7M8 7h9v9" />
            </svg>
          </Link>
        )}
        {showCollapseToggle && (
          <button
            type="button"
            onClick={onToggleCollapsed}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className={`w-full flex items-center gap-2 rounded-lg py-1.5 text-crm-header-dim hover:text-crm-header-text transition-colors duration-200 ${
              collapsed ? "justify-center" : ""
            }`}
          >
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" aria-hidden="true" className={`shrink-0 transition-transform duration-200 ${collapsed ? "rotate-180" : ""}`}>
              <path d="M15 6L9 12L15 18" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
            {!collapsed && <span className="text-[12px]">Recolher menu</span>}
          </button>
        )}
      </div>
    </div>
  );
}

/** Left menu: fixed on desktop (collapsible to icons), a drawer on phones. */
export default function CrmSidebar(props: SidebarProps) {
  const { mobileOpen, onCloseMobile, onSelect, ...rest } = props;
  return (
    <>
      <aside
        className={`hidden lg:flex lg:flex-col shrink-0 sticky top-0 h-dvh bg-crm-header text-crm-header-text border-r border-white/[0.06] transition-[width] duration-200 ${
          props.collapsed ? "w-[76px]" : "w-64"
        }`}
      >
        <SidebarContent {...rest} onSelect={onSelect} showCollapseToggle />
      </aside>

      {mobileOpen && (
        <div className="lg:hidden fixed inset-0 z-50">
          <button type="button" aria-label="Fechar menu" onClick={onCloseMobile} className="absolute inset-0 bg-black/55" />
          <aside className="absolute inset-y-0 left-0 w-72 max-w-[82vw] bg-crm-header text-crm-header-text shadow-2xl">
            <SidebarContent
              {...rest}
              collapsed={false}
              showCollapseToggle={false}
              onSelect={(view) => {
                onSelect(view);
                onCloseMobile();
              }}
            />
          </aside>
        </div>
      )}
    </>
  );
}
