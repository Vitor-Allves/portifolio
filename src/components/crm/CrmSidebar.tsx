"use client";

import Link from "next/link";
import type { CrmTheme } from "./crm-theme";
import CrmThemeToggle from "./CrmThemeToggle";
import { LegadoLockup, Mascot, type MascotName } from "./crm-brand";
import { initials } from "./crm-format";

export type CrmView =
  | "dashboard"
  | "board"
  | "conversations"
  | "tasks"
  | "agenda"
  | "contacts"
  | "companies"
  | "campaigns"
  | "clients"
  | "followup"
  | "goals"
  | "reports"
  | "settings"
  | "automations"
  | "team"
  | "audit";

/** Menu groups (especificação v1.0): a group shows only when it has a section this profile can open. */
export const CRM_GROUPS = [
  { id: "visao", label: "Visão geral" },
  { id: "comercial", label: "Comercial" },
  { id: "operacao", label: "Operação" },
  { id: "gestao", label: "Gestão" },
  { id: "admin", label: "Administração" },
] as const;

export type CrmGroup = (typeof CRM_GROUPS)[number]["id"];

/** Every CRM section: the menu label, a one-line hint, what the page is for, and a practical tip. */
export const CRM_SECTIONS: { id: CrmView; group: CrmGroup; label: string; hint: string; description: string; tip: string; mascot: MascotName }[] = [
  {
    group: "visao",
    id: "dashboard",
    label: "Painel",
    hint: "Como estamos",
    description: "Os números do período comparados com o período anterior, o funil agora e o resultado de cada pessoa.",
    tip: "Troque o período no topo. As setas comparam com o mesmo número de dias logo antes.",
    mascot: "titanWelcome",
  },
  {
    group: "comercial",
    id: "contacts",
    label: "Contatos",
    hint: "Base, importação e exportação",
    description: "A base completa de leads e clientes: busque, filtre, importe planilhas e exporte.",
    tip: "Importe planilhas .xlsx ou .csv. Telefone ou e-mail repetido é barrado antes de gravar.",
    mascot: "titanDoubt",
  },
  {
    group: "comercial",
    id: "companies",
    label: "Empresas",
    hint: "Cadastro de empresas",
    description: "As empresas atendidas e prospectadas, com seus contatos, oportunidades e conquistas.",
    tip: "Contatos com o mesmo nome de empresa ficam juntos aqui, mesmo escritos de jeitos diferentes.",
    mascot: "legacyDoubt",
  },
  {
    group: "comercial",
    id: "board",
    label: "Funil de vendas",
    hint: "Oportunidades por etapa",
    description: "Cada card é uma oportunidade de negócio. Arraste entre as colunas para avançar; o topo de cada coluna mostra a quantidade e o valor.",
    tip: "Arraste o card para mudar a etapa. Para encerrar, o CRM pede a tabulação: o resultado ou o motivo, e uma observação; reabrir pede a justificativa.",
    mascot: "titanWelcome",
  },
  {
    group: "comercial",
    id: "conversations",
    label: "Conversas",
    hint: "Mensagens do WhatsApp",
    description: "Todas as conversas do WhatsApp, da mais recente para a mais antiga, com a etapa de cada lead no funil.",
    tip: "Depois da última mensagem do lead você tem 24h para responder livremente. Fora disso, só com modelo aprovado.",
    mascot: "legacyHello",
  },
  {
    group: "comercial",
    id: "campaigns",
    label: "Campanhas",
    hint: "Mensagens para uma lista",
    description: "Um modelo aprovado do WhatsApp enviado para um público filtrado, só para quem aceitou contato, com o resultado de cada envio.",
    tip: "Quem responder SAIR é descadastrado na hora e não recebe as próximas. A Meta cobra cada mensagem de modelo enviada.",
    mascot: "legacyHello",
  },
  {
    group: "operacao",
    id: "clients",
    label: "Clientes ativos",
    hint: "Contratos e serviços",
    description: "As empresas que contrataram a Legado: responsável, serviços, contratos com vigência e valor, e o histórico do relacionamento.",
    tip: "Uma oportunidade ganha vira cliente pelo botão Tornar cliente. Use o filtro de contrato para ver o que vence nos próximos 30 ou 60 dias.",
    mascot: "legacyWin",
  },
  {
    group: "operacao",
    id: "tasks",
    label: "Tarefas",
    hint: "O que fazer hoje",
    description: "Tarefas atrasadas, de hoje e dos próximos dias, e as mensagens esperando resposta.",
    tip: "Clique no quadradinho para concluir. Ligações e reuniões feitas se registram no painel do contato.",
    mascot: "titanWin",
  },
  {
    group: "operacao",
    id: "agenda",
    label: "Agenda",
    hint: "Dia, semana e mês",
    description: "Reuniões, ligações e tarefas por dia, semana ou mês, de toda a equipe ou de uma pessoa, na cor de cada tipo.",
    tip: "Use as setas para ver outras semanas. O que já foi feito aparece riscado.",
    mascot: "legacyWin",
  },
  {
    group: "operacao",
    id: "followup",
    label: "Acompanhamento de clientes",
    hint: "Atualização do mês",
    description: "O acompanhamento mensal de cada cliente: serviços realizados, atividades, resultados, pontos de atenção e próximas ações. Quem ainda não foi atualizado aparece primeiro.",
    tip: "Troque o mês nas setas. Clique no cliente para registrar ou ver o acompanhamento daquele mês.",
    mascot: "titanWin",
  },
  {
    group: "gestao",
    id: "goals",
    label: "Metas e produtividade",
    hint: "Metas do mês e quem fez o quê",
    description: "As metas do mês da equipe e de cada pessoa, com o quanto já foi feito, e a produtividade de cada um no período: leads, reuniões, propostas, ganhos, tarefas, conversas e tempo de resposta.",
    tip: "A marca na barra mostra o ritmo esperado até hoje. Administrador e Gestor definem as metas; dá para copiar as do mês anterior.",
    mascot: "titanWin",
  },
  {
    group: "gestao",
    id: "reports",
    label: "Relatórios",
    hint: "Tabulação e resultados",
    description: "Relatórios com filtros por período, vendedor, origem, serviço e motivo, na tela e para baixar em planilha ou PDF.",
    tip: "Clique num grupo da tabulação para filtrar por ele. Baixar em planilha ou PDF fica registrado na auditoria.",
    mascot: "titanDoubt",
  },
  {
    group: "admin",
    id: "settings",
    label: "Personalização",
    hint: "Listas e etiquetas",
    description: "As listas do CRM (etapas do funil, origens, segmentos, serviços, motivos, tipos de tarefa) e as etiquetas, com cores. Nada é apagado: o que sai vai para Arquivadas.",
    tip: "Uma opção nova aparece na hora nos formulários e filtros. Renomear um segmento renomeia nas empresas e contatos que o usam.",
    mascot: "titanDoubt",
  },
  {
    group: "admin",
    id: "automations",
    label: "Automações",
    hint: "Tarefas e avisos sozinhos",
    description: "Regras que criam tarefas, lembretes e avisos sozinhas: ligue, pause, ajuste prazos e responsáveis e veja cada execução. Nenhuma automação envia mensagem.",
    tip: "Todas começam desligadas. Comece pelas de evento (novo lead, proposta enviada); as de verificação diária rodam no horário agendado ou em Rodar agora.",
    mascot: "titanWelcome",
  },
  {
    group: "admin",
    id: "team",
    label: "Usuários e permissões",
    hint: "Perfis de acesso",
    description: "Quem usa o CRM e o que cada pessoa pode fazer. Cada troca de perfil fica registrada na auditoria.",
    tip: "Comercial vê só os próprios leads e os sem responsável. Marketing cadastra, importa e monta campanhas, mas não mexe no funil.",
    mascot: "titanWelcome",
  },
  {
    group: "admin",
    id: "audit",
    label: "Auditoria",
    hint: "Quem fez o quê",
    description: "Ações administrativas (perfis, permissões, acessos, importações, exportações, campanhas, carteiras) e mudanças comerciais nos registros, com quem fez e quando.",
    tip: "Filtre por pessoa e período. Clique no contato para abrir o histórico completo dele.",
    mascot: "titanDoubt",
  },
];

const ICONS: Record<CrmView, React.ReactNode> = {
  automations: <path d="M13 2 4 14h6l-1 8 9-12h-6l1-8Z" />,
  audit: <path d="M12 2 4 5v6c0 5 3.4 9.4 8 11 4.6-1.6 8-6 8-11V5l-8-3Zm-1 13.6-3.3-3.3 1.4-1.4 1.9 1.9 4.9-4.9 1.4 1.4-6.3 6.3Z" />,
  dashboard: <path d="M4 13h4v7H4v-7Zm6-9h4v16h-4V4Zm6 6h4v10h-4V10Z" />,
  goals: (
    <path d="M12 2a10 10 0 1 0 10 10h-2a8 8 0 1 1-8-8V2Zm0 4a6 6 0 1 0 6 6h-2a4 4 0 1 1-4-4V6Zm0 4a2 2 0 1 0 2 2h-2v-2Zm3.6-6.4L13 6.2V11h4.8l2.6-2.6L18 8V6l-2.4-2.4Z" />
  ),
  board: <path d="M3 4h5v16H3V4Zm6.5 0h5v10h-5V4ZM16 4h5v7h-5V4Z" />,
  reports: <path d="M6 2h9l5 5v14a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1Zm8 1.5V8h4.5L14 3.5ZM8 12v6h2v-6H8Zm3.5 2v4h2v-4h-2Zm3.5-3v7h2v-7h-2Z" />,
  conversations: (
    <path d="M4 3.5h16a1.5 1.5 0 0 1 1.5 1.5v10.5A1.5 1.5 0 0 1 20 17H9.2l-4.4 3.7A.5.5 0 0 1 4 20.3V17a1.5 1.5 0 0 1-1.5-1.5V5A1.5 1.5 0 0 1 4 3.5Zm3 4.5v1.8h10V8H7Zm0 3.8v1.8h7v-1.8H7Z" />
  ),
  tasks: <path d="M3.5 4.5h5v5h-5v-5Zm7 1.5h10v2h-10V6Zm-7 4.5h5v5h-5v-5Zm7 1.5h10v2h-10v-2Zm-7 4.5h5v5h-5v-5Zm7 1.5h10v2h-10v-2Z" />,
  agenda: (
    <path d="M7 2h2v2h6V2h2v2h3a1 1 0 0 1 1 1v15a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1h3V2ZM5 9v10h14V9H5Zm2 2h3v3H7v-3Z" />
  ),
  contacts: <path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm0 2c-3.3 0-8 1.66-8 5v1h16v-1c0-3.34-4.7-5-8-5Z" />,
  followup: (
    <path d="M4 3h16a1 1 0 0 1 1 1v16a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1Zm2 13v2h2v-2H6Zm4 0v2h2v-5h-2v3Zm4-2v4h2v-8h-2v4Zm-8-8v2h12V6H6Z" />
  ),
  clients: (
    <path d="M9 3h6a2 2 0 0 1 2 2v1h3a2 2 0 0 1 2 2v4.5h-8.5V11h-3v1.5H2V8a2 2 0 0 1 2-2h3V5a2 2 0 0 1 2-2Zm0 3h6V5H9v1ZM2 14h8.5v1.5h3V14H22v5a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2v-5Z" />
  ),
  campaigns: <path d="M18 4.5v15l-6.5-3.6H8.6l1.2 4.6H7.3L6 15.9H5a2 2 0 0 1-2-2V10a2 2 0 0 1 2-2h6.5L18 4.5ZM20 9.5a2.5 2.5 0 0 1 0 5v-5Z" />,
  settings: (
    <path d="M10.3 2h3.4l.5 2.6c.6.2 1.2.5 1.7.9l2.5-.9 1.7 2.9-2 1.7c.1.6.1 1.3 0 1.9l2 1.7-1.7 2.9-2.5-.9c-.5.4-1.1.7-1.7.9l-.5 2.6h-3.4l-.5-2.6c-.6-.2-1.2-.5-1.7-.9l-2.5.9-1.7-2.9 2-1.7a5.6 5.6 0 0 1 0-1.9l-2-1.7 1.7-2.9 2.5.9c.5-.4 1.1-.7 1.7-.9L10.3 2ZM12 9a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z" />
  ),
  team: (
    <path d="M9 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Zm7.5 0a3 3 0 1 0 0-6 3 3 0 0 0 0 6ZM2 19c0-3 3.1-5 7-5s7 2 7 5v1H2v-1Zm15.5 1v-1c0-1.6-.6-3-1.7-4 3.2.1 6.2 1.6 6.2 4v1h-4.5Z" />
  ),
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
  /** Shown under the name, e.g. "Comercial". */
  roleLabel: string;
  /** Sections this profile may open (Equipe is for Administrador only). */
  sections: CrmView[];
  whatsappConfigured: boolean;
  initialTheme: CrmTheme | null;
  /** false for a CRM-only login, which has nothing in the Intelligence. */
  showIntelligenceLink?: boolean;
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
  roleLabel,
  sections,
  whatsappConfigured,
  initialTheme,
  showIntelligenceLink = true,
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

      <nav className="flex-1 overflow-y-auto py-2 px-2.5 space-y-1" aria-label="Seções do CRM">
        {CRM_GROUPS.map((g) => {
          const items = CRM_SECTIONS.filter((s) => s.group === g.id && sections.includes(s.id));
          if (items.length === 0) return null;
          return (
            <div key={g.id} role="group" aria-label={g.label} className="space-y-1">
              {collapsed ? (
                <div className="mx-3 my-2 border-t border-white/[0.12]" aria-hidden="true" />
              ) : (
                <p className="px-3 pt-2.5 pb-0.5 text-[10px] font-semibold tracking-[0.14em] uppercase text-crm-header-dim/70">{g.label}</p>
              )}
              {items.map((s) => {
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
            </div>
          );
        })}
      </nav>

      {!collapsed && (
        <div className="px-3 pb-3 [@media(max-height:960px)]:hidden">
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
          {!collapsed && (
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[12.5px] text-crm-header-text">{currentUserName}</span>
              <span className="block truncate text-[10.5px] text-crm-header-dim">{roleLabel}</span>
            </span>
          )}
          <CrmThemeToggle initialTheme={initialTheme} />
        </div>
        {!collapsed && showIntelligenceLink && (
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
