"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import {
  CRM_TEMPERATURES,
  formatBRL,
  isClosedStage,
  parseMoneyToCents,
  type CrmContactCard,
  type CrmDealCard,
  type CrmQuickReply,
  type CrmStage,
  type CrmTask,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_BTN_PRIMARY, CRM_INPUT, taskKindIcon } from "./crm-styles";
import { CRM_SIDEBAR_COOKIE, type CrmTheme } from "./crm-theme";
import CrmWelcome from "./CrmWelcome";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";
import { TASK_STATE_TONE, relativeTime, shortDate, taskDueLabel, taskState, windowLabel } from "./crm-format";
import CrmSidebar, { CRM_SECTIONS, CrmSectionIcon, type CrmView } from "./CrmSidebar";
import CrmConversationsView from "./CrmConversationsView";
import CrmTeamView from "./CrmTeamView";
import CrmCampaignsView from "./CrmCampaignsView";
import CrmDashboardView from "./CrmDashboardView";
import { crmAccessLabel, type CrmCapabilities, type CrmRole } from "@/lib/crm-permissions";
import CrmContactPanel from "./CrmContactPanel";
import CrmNewContactDialog from "./CrmNewContactDialog";
import CrmContactsView from "./CrmContactsView";
import CrmCompaniesView from "./CrmCompaniesView";
import CrmCompanyPanel from "./CrmCompanyPanel";
import CrmImportDialog from "./CrmImportDialog";
import CrmLostDialog, { type CrmCloseFields } from "./CrmLostDialog";
import CrmStageDialog, { needsStageDialog, type CrmStageFields } from "./CrmStageDialog";
import { TemperatureChip } from "./crm-fields";
import CrmTasksView from "./CrmTasksView";
import CrmSettingsView from "./CrmSettingsView";
import CrmAuditView from "./CrmAuditView";
import { CrmCatalogProvider, TagChips, useCatalog } from "./crm-catalog-context";
import { closeGroupLabel, type CrmCatalog } from "@/lib/crm-catalog";
import CrmAgendaView from "./CrmAgendaView";
import CrmTaskDialog, { type TaskDialogTarget, type TaskDraft } from "./CrmTaskDialog";
import CrmReminderBell from "./CrmReminderBell";
import CrmAutomationsView from "./CrmAutomationsView";
import CrmClientsView from "./CrmClientsView";
import CrmClientPanel, { type ClientTab } from "./CrmClientPanel";
import CrmFollowUpView from "./CrmFollowUpView";
import CrmGoalsView from "./CrmGoalsView";
import CrmReportsView from "./CrmReportsView";
import CrmTransfersView from "./CrmTransfers";

type CrmAppProps = {
  initialDeals: CrmDealCard[];
  /** Pending tasks of the whole team. */
  initialTasks: CrmTask[];
  /** Contacts with unread WhatsApp messages. */
  initialInbox: CrmContactCard[];
  team: CrmTeamMember[];
  initialQuickReplies: CrmQuickReply[];
  whatsappConfigured: boolean;
  templatesConfigured: boolean;
  currentUserId: string;
  currentUserName: string;
  initialTheme: CrmTheme | null;
  initialSidebarCollapsed: boolean;
  /** The CRM profile — the server enforces it; the screens hide what it can't do. */
  role: CrmRole;
  /** What this person may do: the profile plus their individual exceptions (Fase 2). */
  caps: CrmCapabilities;
  showIntelligenceLink: boolean;
  /** An Administrador without 2FA (session from before it became required): asked to sign in again to set it up. */
  totpPending?: boolean;
  /** Personalização: lists and tags. */
  initialCatalog: CrmCatalog;
};

type PanelTab = "conversa" | "negocio" | "detalhes";
type Selection = { contactId: string; dealId?: string | null; tab?: PanelTab };

const BOARD_REFRESH_MS = 10_000;

const BOARD_EDGE = 96;
const BOARD_SCROLL_STEP = 22;

// Wide enough for the Conversas list and the open chat side by side.
const WIDE_QUERY = "(min-width: 1024px)";
function subscribeWide(onChange: () => void) {
  const mq = window.matchMedia(WIDE_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

/** Typed money → centavos for an optimistic update (the server re-validates); unparseable keeps `fallback`. */
function centsOr(value: string, fallback: number | null): number | null {
  try {
    return parseMoneyToCents(value);
  } catch {
    return fallback;
  }
}

/** What an opportunity is worth on the board: a won one by its negotiated value, else the estimate. */
function dealWorth(d: { stage: string; valueCents: number | null; negotiatedCents: number | null }): number | null {
  return d.stage === "ganho" ? (d.negotiatedCents ?? d.valueCents) : d.valueCents;
}

/** Funnel period filter (by the opportunity's entry date). */
const PERIODS = [
  { id: "all", label: "Qualquer data de entrada" },
  { id: "7", label: "Entraram nos últimos 7 dias" },
  { id: "30", label: "Entraram nos últimos 30 dias" },
  { id: "90", label: "Entraram nos últimos 90 dias" },
  { id: "month", label: "Entraram neste mês" },
] as const;
type PeriodId = (typeof PERIODS)[number]["id"];

function periodStart(id: PeriodId, now: number): number | null {
  if (id === "all") return null;
  if (id === "month") {
    // First day of the month in Brasília.
    const ym = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit" }).format(now);
    return Date.parse(`${ym}-01T00:00:00-03:00`);
  }
  return now - Number(id) * 24 * 60 * 60 * 1000;
}

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  return (await res.json()) as T;
}

function DealCard({
  deal,
  selected,
  canDrag,
  now,
  onOpen,
}: {
  deal: CrmDealCard;
  selected: boolean;
  canDrag: boolean;
  now: number;
  onOpen: (deal: CrmDealCard) => void;
}) {
  const { label } = useCatalog();
  const win = windowLabel(deal.lastInboundAt, now);
  const closed = isClosedStage(deal.stage);
  const task = deal.nextTask;
  const state = task ? taskState(task.dueAt, task.allDay, now) : null;
  const worth = dealWorth(deal);
  // The title usually is the company (or the contact) — don't repeat it below.
  const who = [deal.contactName, deal.company].filter((v): v is string => Boolean(v) && v !== deal.title).join(" · ");

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData("text/plain", deal.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(deal);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable={canDrag}
      onDragStart={handleDragStart}
      onClick={() => onOpen(deal)}
      onKeyDown={handleKeyDown}
      aria-label={`Abrir ${deal.title}`}
      className={`cursor-pointer rounded-xl border bg-crm-card px-3 py-2.5 shadow-[var(--crm-shadow)] transition-colors duration-150 focus:outline-none focus-visible:border-crm-accent ${
        selected ? "border-crm-accent ring-1 ring-crm-accent/40" : "border-crm-line hover:border-crm-line-strong"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-crm-text truncate">{deal.title}</p>
          {who && <p className="text-[11.5px] text-crm-dim truncate">{who}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {deal.unreadCount > 0 && (
            <span
              title={`${deal.unreadCount} mensagem(ns) não lida(s)`}
              className="min-w-[18px] h-[18px] px-1 rounded-full bg-crm-accent text-crm-on-accent text-[10.5px] font-semibold flex items-center justify-center"
            >
              {deal.unreadCount}
            </span>
          )}
          <OwnerAvatar name={deal.ownerName} />
        </div>
      </div>

      {(worth !== null || deal.expectedCloseAt || deal.service) && (
        <p className="mt-1 flex flex-wrap items-baseline gap-x-2 text-[12px]">
          {worth !== null && (
            <span className="font-semibold text-crm-text tabular-nums" title={deal.stage === "ganho" && deal.negotiatedCents !== null ? "Valor negociado" : "Valor estimado"}>
              {formatBRL(worth)}
            </span>
          )}
          {deal.stage !== "ganho" && deal.negotiatedCents !== null && (
            <span className="text-crm-dim tabular-nums">negociado {formatBRL(deal.negotiatedCents)}</span>
          )}
          {!closed && (
            <span className="text-crm-dim tabular-nums" title={deal.probabilityOwn ? "Probabilidade de fechamento (definida na oportunidade)" : "Probabilidade de fechamento (da etapa)"}>
              {deal.probability}%
            </span>
          )}
          {deal.service && <span className="text-crm-dim truncate max-w-full">{label("service", deal.service)}</span>}
          {deal.expectedCloseAt && !closed && <span className="text-crm-faint">previsão {shortDate(deal.expectedCloseAt)}</span>}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <TemperatureChip value={deal.temperature} />
        <span className="max-w-full truncate text-[10.5px] px-2 py-0.5 rounded-full bg-crm-sunken border border-crm-line text-crm-dim">
          {label("source", deal.source)}
          {deal.referredBy ? ` · ${deal.referredBy}` : ""}
        </span>
        <TagChips ids={deal.tagIds} max={2} />
      </div>

      {deal.stage === "ganho" && deal.wonReason && (
        <p className="mt-1.5 text-[11.5px] text-crm-green truncate">
          {label("won_reason", deal.wonReason)}
          {deal.wonNote ? ` · ${deal.wonNote}` : ""}
        </p>
      )}

      {deal.stage === "perdido" && deal.lostReason && (
        <p className={`mt-1.5 text-[11.5px] truncate ${deal.closeGroup === "futuro" ? "text-crm-amber" : "text-crm-red"}`}>
          {closeGroupLabel(deal.closeGroup)}: {label("lost_reason", deal.lostReason)}
          {deal.closeGroup === "futuro" && deal.returnOn ? ` · retomar em ${deal.returnOn.split("-").reverse().join("/")}` : ""}
          {deal.lostNote ? ` · ${deal.lostNote}` : ""}
        </p>
      )}

      {deal.lastMessagePreview && <p className="mt-1.5 text-[11.5px] text-crm-dim line-clamp-2 break-words">{deal.lastMessagePreview}</p>}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-crm-faint">{deal.lastMessageAt ? relativeTime(deal.lastMessageAt, now) : "sem mensagens"}</span>
        {win && <span className="text-crm-green font-medium">janela: {win}</span>}
      </div>

      {task && state ? (
        <p className={`mt-1 text-[11.5px] font-medium truncate ${TASK_STATE_TONE[state]}`}>
          <span aria-hidden="true">{taskKindIcon(task.kind)} </span>
          {task.title} · {taskDueLabel(task.dueAt, task.allDay, now)}
        </p>
      ) : (
        !closed && <p className="mt-1 text-[11.5px] text-crm-faint">Sem próxima tarefa</p>
      )}
    </div>
  );
}

export default function CrmApp({ initialCatalog, ...props }: CrmAppProps) {
  return (
    <CrmCatalogProvider initial={initialCatalog}>
      <CrmAppInner {...props} />
    </CrmCatalogProvider>
  );
}

function CrmAppInner({
  initialDeals,
  initialTasks,
  initialInbox,
  team,
  initialQuickReplies,
  whatsappConfigured,
  templatesConfigured,
  currentUserId,
  currentUserName,
  initialTheme,
  initialSidebarCollapsed,
  role,
  caps,
  showIntelligenceLink,
  totpPending = false,
}: Omit<CrmAppProps, "initialCatalog">) {
  const catalog = useCatalog();
  // Without the right to reassign, owner pickers offer only oneself (Comercial) or no one (Marketing).
  const ownerChoices = caps.assignAnyOwner ? team : caps.editPipeline ? team.filter((m) => m.id === currentUserId) : [];
  const [deals, setDeals] = useState(initialDeals);
  const [tasks, setTasks] = useState(initialTasks);
  const [inbox, setInbox] = useState(initialInbox);
  const [quickReplies, setQuickReplies] = useState(initialQuickReplies);
  const [view, setView] = useState<CrmView>("dashboard");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // The conversation open beside the Conversas list (wide screens only).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const isWide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  // Clientes ativos: the client panel (shown when no contact or company panel is on top of it).
  const [clientId, setClientId] = useState<{ id: string; tab?: ClientTab; month?: string } | null>(null);
  // The task form, over whatever is open (new task, or one being edited).
  const [taskTarget, setTaskTarget] = useState<TaskDialogTarget | null>(null);
  const openTask = useCallback((id: string) => setTaskTarget({ id }), []);
  // Bumped when the task form saves, so an open contact panel shows the change.
  const [tasksVersion, setTasksVersion] = useState(0);
  const newTask = useCallback((draft: TaskDraft) => setTaskTarget({ draft }), []);
  const [importOpen, setImportOpen] = useState(false);
  // Bumped after any change so the Agenda/Contatos/Empresas lists refetch.
  const [dataVersion, setDataVersion] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [periodFilter, setPeriodFilter] = useState<PeriodId>("all");
  const [temperatureFilter, setTemperatureFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState<"all" | "due" | "none">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [dropStage, setDropStage] = useState<CrmStage | null>(null);
  const [lostPending, setLostPending] = useState<{ dealId: string; title: string; reopening: boolean } | null>(null);
  const [stagePending, setStagePending] = useState<{ deal: CrmDealCard; stage: CrmStage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [celebration, setCelebration] = useState<{ name: string; mascot: "titanWin" | "legacyWin" } | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const boardRef = useRef<HTMLDivElement | null>(null);

  // "Conquista!" toast when a deal is won — Titan and Legacy take turns.
  const celebrate = useCallback((name: string) => {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
    setCelebration((prev) => ({ name, mascot: prev?.mascot === "titanWin" ? "legacyWin" : "titanWin" }));
    celebrationTimer.current = setTimeout(() => setCelebration(null), 5000);
  }, []);
  useEffect(() => () => {
    if (celebrationTimer.current) clearTimeout(celebrationTimer.current);
  }, []);

  const refresh = useCallback(async () => {
    try {
      const [d, t, i] = await Promise.all([
        getJson<{ deals: CrmDealCard[] }>("/api/crm/deals/"),
        getJson<{ tasks: CrmTask[] }>("/api/crm/tasks/?status=pending&owner=all"),
        getJson<{ contacts: CrmContactCard[] }>("/api/crm/inbox/"),
      ]);
      setDeals(d.deals);
      setTasks(t.tasks);
      setInbox(i.contacts);
      setDataVersion((v) => v + 1);
      setError(null);
    } catch {
      setError("Não foi possível atualizar o quadro agora.");
    }
    setNow(Date.now());
  }, []);

  // New WhatsApp messages land through the webhook, not this page — the
  // board polls so unread counts and new leads show up on their own.
  useEffect(() => {
    const timer = setInterval(() => void refresh(), BOARD_REFRESH_MS);
    return () => clearInterval(timer);
  }, [refresh]);

  const openContact = useCallback((contactId: string, tab?: PanelTab, dealId?: string | null) => {
    setSelected({ contactId, tab, dealId });
  }, []);

  const openClient = useCallback((id: string, opts: { tab?: ClientTab; month?: string } = {}) => {
    setSelected(null);
    setCompanyId(null);
    setClientId({ id, ...opts });
  }, []);

  // The board's columns: the funnel as set in Personalização, plus an archived stage while cards are still in it.
  const columns = useMemo(() => catalog.stages(deals.map((d) => d.stage)), [catalog, deals]);
  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    const since = periodStart(periodFilter, now);
    return deals.filter((d) => {
      if (ownerFilter === "mine" && d.ownerId !== currentUserId) return false;
      if (ownerFilter === "none" && d.ownerId) return false;
      if (!["all", "mine", "none"].includes(ownerFilter) && d.ownerId !== ownerFilter) return false;
      if (sourceFilter !== "all" && d.source !== sourceFilter) return false;
      if (temperatureFilter !== "all" && d.temperature !== temperatureFilter) return false;
      if (since !== null && Date.parse(d.createdAt) < since) return false;
      if (taskFilter === "due") {
        const s = d.nextTask ? taskState(d.nextTask.dueAt, d.nextTask.allDay, now) : "none";
        if (s !== "overdue" && s !== "today") return false;
      }
      if (taskFilter === "none" && (d.nextTask || isClosedStage(d.stage))) return false;
      if (q) {
        const inText = [d.title, d.contactName, d.company ?? "", d.email ?? ""].some((v) => v.toLowerCase().includes(q));
        const inPhone = digits.length >= 3 && (d.phone ?? "").includes(digits);
        if (!inText && !inPhone) return false;
      }
      return true;
    });
  }, [deals, ownerFilter, sourceFilter, temperatureFilter, periodFilter, taskFilter, search, currentUserId, now]);

  const dueCount = useMemo(
    () =>
      tasks.filter((t) => {
        // Who works only on their own leads counts only their own tasks.
        if (!caps.actOnAllLeads && t.ownerId !== currentUserId) return false;
        const s = taskState(t.dueAt, t.allDay, now);
        return s === "overdue" || s === "today";
      }).length,
    [tasks, now, caps.actOnAllLeads, currentUserId]
  );
  const unread = inbox.reduce((sum, c) => sum + c.unreadCount, 0);

  async function patchStage(dealId: string, body: { stage: CrmStage } & Partial<CrmCloseFields> & CrmStageFields) {
    const before = deals;
    const deal = before.find((d) => d.id === dealId);
    const at = new Date().toISOString();
    setDeals((ds) =>
      ds.map((d) =>
        d.id === dealId
          ? {
              ...d,
              stage: body.stage,
              stageChangedAt: at,
              closedAt: isClosedStage(body.stage) ? at : null,
              lostReason: body.lostReason ?? null,
              lostNote: body.lostNote?.trim() || null,
              service: body.service ?? d.service,
              valueCents: body.value !== undefined ? centsOr(body.value, d.valueCents) : d.valueCents,
              negotiatedCents: body.negotiatedValue !== undefined ? centsOr(body.negotiatedValue, d.negotiatedCents) : d.negotiatedCents,
              wonReason: body.wonReason ?? null,
              wonNote: body.wonNote?.trim() || null,
            }
          : d
      )
    );
    const res = await fetch(`/api/crm/deals/${dealId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setDeals(before);
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(data?.error ?? "Não foi possível mover o card.");
      return;
    }
    if (body.stage === "ganho") celebrate(deal?.title ?? "O negócio");
    void refresh();
  }

  function moveTo(dealId: string, stage: CrmStage) {
    const deal = deals.find((d) => d.id === dealId);
    if (!deal || deal.stage === stage) return;
    // Closing always goes through the tabulação (the dialogs ask before the
    // move); reopening asks for the justification; other stages ask for what
    // they require.
    if (stage === "perdido") setLostPending({ dealId, title: deal.title, reopening: isClosedStage(deal.stage) });
    else if (needsStageDialog(deal, stage)) setStagePending({ deal, stage });
    else void patchStage(dealId, { stage });
  }

  function handleDrop(e: DragEvent<HTMLElement>, stage: CrmStage) {
    e.preventDefault();
    setDropStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) moveTo(id, stage);
  }

  const section = CRM_SECTIONS.find((s) => s.id === view) ?? CRM_SECTIONS[0];
  const unreadContacts = inbox.length;

  function toggleSidebar() {
    const next = !sidebarCollapsed;
    setSidebarCollapsed(next);
    document.cookie = `${CRM_SIDEBAR_COOKIE}=${next ? "collapsed" : "open"}; path=/crm; max-age=31536000; samesite=lax`;
  }

  // In Conversas on a wide screen the chat opens beside the list; anywhere
  // else (and on phones) a contact opens in the slide-over panel.
  const conversationsBeside = view === "conversations" && isWide;

  return (
    <div className="min-h-screen bg-crm-bg text-crm-text lg:flex">
      <CrmSidebar
        active={view}
        onSelect={setView}
        badges={{ conversations: unreadContacts, tasks: dueCount }}
        collapsed={sidebarCollapsed}
        onToggleCollapsed={toggleSidebar}
        mobileOpen={mobileNavOpen}
        onCloseMobile={() => setMobileNavOpen(false)}
        currentUserName={currentUserName}
        roleLabel={crmAccessLabel(role)}
        sections={[
          "dashboard",
          "board",
          "conversations",
          "tasks",
          "agenda",
          "contacts",
          "companies",
          ...(caps.editCampaigns ? (["campaigns"] as const) : []),
          ...(caps.viewClients ? (["clients", "followup"] as const) : []),
          "goals",
          ...(caps.editPipeline || caps.assignAnyOwner ? (["transfers"] as const) : []),
          "reports",
          ...(caps.customize ? (["settings"] as const) : []),
          ...(caps.manageAutomations ? (["automations"] as const) : []),
          ...(caps.manageTeam ? (["team", "audit"] as const) : []),
        ]}
        whatsappConfigured={whatsappConfigured}
        initialTheme={initialTheme}
        showIntelligenceLink={showIntelligenceLink}
      />

      <div className="flex-1 min-w-0">
        <header className="sticky top-0 z-20 bg-crm-bg/90 backdrop-blur border-b border-crm-line">
          <div className="px-4 sm:px-6 py-3 flex items-center gap-3">
            <button
              type="button"
              onClick={() => setMobileNavOpen(true)}
              aria-label="Abrir menu"
              className="lg:hidden h-9 w-9 shrink-0 inline-flex items-center justify-center rounded-xl bg-crm-header text-crm-header-text"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            </button>
            <span className="hidden sm:inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-crm-accent/[0.1] text-crm-accent">
              <CrmSectionIcon id={view} />
            </span>
            <div className="min-w-0">
              <h1 className="crm-display text-[19px] leading-tight">{section.label}</h1>
              <p className="hidden sm:block text-[12.5px] text-crm-dim truncate">{section.description}</p>
            </div>
            <div className="ml-auto flex items-center gap-2 shrink-0">
              <CrmReminderBell
                version={dataVersion}
                onOpenTask={openTask}
                onOpenContact={(id) => openContact(id)}
                onOpenClient={caps.viewClients ? (id) => openClient(id) : undefined}
                onShowTasks={() => setView("tasks")}
              />
              <button type="button" onClick={() => setNewOpen(true)} aria-label="Novo contato" className={`${CRM_BTN_PRIMARY} shrink-0 gap-1`}>
                <span aria-hidden="true">+</span>
                <span className="hidden sm:inline">Novo contato</span>
              </button>
            </div>
          </div>
        </header>

      <div className="px-4 sm:px-6 py-5 space-y-4">
        {totpPending && (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-crm-amber/35 bg-crm-amber/[0.08] px-4 py-2.5 text-[12.5px]" role="alert">
            <span className="text-crm-text">
              <strong>Ative o 2FA.</strong> Administradores do CRM entram com código do aplicativo autenticador. Saia e entre de novo para cadastrar.
            </span>
            <button
              type="button"
              onClick={async () => {
                await fetch("/api/analise/logout/", { method: "POST" }).catch(() => {});
                window.location.href = "/intelligence/login/?from=/crm/";
              }}
              className="ml-auto text-[12.5px] font-semibold text-crm-amber hover:opacity-80"
            >
              Sair e ativar agora
            </button>
          </div>
        )}
        {view === "dashboard" && <CrmWelcome userName={currentUserName} deals={deals} tasks={tasks} unread={unread} now={now} />}

        {view === "board" && (
          <div className="flex flex-wrap items-center gap-2">
            <>
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar negócio, contato ou telefone"
                aria-label="Buscar no funil"
                className={`${CRM_INPUT} !w-64 max-w-full !rounded-full !py-1.5`}
              />

              <select
                value={ownerFilter}
                onChange={(e) => setOwnerFilter(e.target.value)}
                aria-label="Filtrar por responsável"
                className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`}
              >
                <option value="all">Todos os responsáveis</option>
                <option value="mine">Meus negócios</option>
                <option value="none">Sem responsável</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>

              <select
                value={sourceFilter}
                onChange={(e) => setSourceFilter(e.target.value)}
                aria-label="Filtrar por origem"
                className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`}
              >
                <option value="all">Todas as origens</option>
                {catalog.options("source").map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>

              <select
                value={temperatureFilter}
                onChange={(e) => setTemperatureFilter(e.target.value)}
                aria-label="Filtrar por temperatura"
                className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`}
              >
                <option value="all">Todas as temperaturas</option>
                {CRM_TEMPERATURES.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.label}
                  </option>
                ))}
              </select>

              <select
                value={periodFilter}
                onChange={(e) => setPeriodFilter(e.target.value as PeriodId)}
                aria-label="Filtrar por período"
                className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`}
              >
                {PERIODS.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.label}
                  </option>
                ))}
              </select>

              <select
                value={taskFilter}
                onChange={(e) => setTaskFilter(e.target.value as "all" | "due" | "none")}
                aria-label="Filtrar por próxima tarefa"
                className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5 ${taskFilter !== "all" ? "!border-crm-amber/60 !text-crm-amber" : ""}`}
              >
                <option value="all">Qualquer próxima tarefa</option>
                <option value="due">Tarefa para hoje ou atrasada</option>
                <option value="none">Sem próxima tarefa</option>
              </select>
            </>
          </div>
        )}

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-crm-red/30 bg-crm-red/[0.07] px-4 py-2.5 text-[12.5px] text-crm-red" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dispensar aviso" className="text-crm-red/70 hover:text-crm-red">
              ×
            </button>
          </div>
        )}

        {view === "dashboard" ? (
          <CrmDashboardView
            team={team}
            currentUserId={currentUserId}
            seeAll={caps.seeTeamProductivity}
            version={dataVersion}
            now={now}
            canExport={caps.exportReports}
            onOpenGoals={() => setView("goals")}
            onOpenContact={(id) => openContact(id, "negocio")}
            onOpenClient={caps.viewClients ? (id) => openClient(id) : undefined}
            onOpenTask={openTask}
          />
        ) : view === "conversations" ? (
          <CrmConversationsView
            team={team}
            version={dataVersion}
            now={now}
            currentUserId={currentUserId}
            selectedId={conversationsBeside ? conversationId : selected?.contactId ?? null}
            onOpen={(id) => (conversationsBeside ? setConversationId(id) : openContact(id, "conversa"))}
            whatsappConfigured={whatsappConfigured}
            panel={
              conversationsBeside && conversationId ? (
                <CrmContactPanel
                  key={conversationId}
                  embedded
                  contactId={conversationId}
                  currentUserId={currentUserId}
                  caps={caps}
                  team={team}
                  quickReplies={quickReplies}
                  onQuickRepliesChange={setQuickReplies}
                  whatsappConfigured={whatsappConfigured}
                  templatesConfigured={templatesConfigured}
                  onClose={() => setConversationId(null)}
                  onChanged={() => void refresh()}
                  onWon={celebrate}
                  onOpenTask={openTask}
                  onNewTask={newTask}
                  tasksVersion={tasksVersion}
                  onOpenClient={openClient}
                />
              ) : null
            }
          />
        ) : view === "contacts" ? (
          <CrmContactsView
            team={team}
            version={dataVersion}
            onOpenContact={(id) => openContact(id)}
            onImport={caps.importContacts ? () => setImportOpen(true) : undefined}
            canExport={caps.exportContacts}
            canAssign={caps.assignAnyOwner}
            onNew={() => setNewOpen(true)}
          />
        ) : view === "campaigns" && caps.editCampaigns ? (
          <CrmCampaignsView team={team} canSend={caps.sendCampaigns} templatesConfigured={templatesConfigured} onOpenContact={(id) => openContact(id, "conversa")} />
        ) : view === "clients" && caps.viewClients ? (
          <CrmClientsView
            team={team}
            caps={caps}
            currentUserId={currentUserId}
            version={dataVersion}
            onOpenClient={openClient}
            onOpenContact={(id) => openContact(id, "detalhes")}
          />
        ) : view === "followup" && caps.viewClients ? (
          <CrmFollowUpView version={dataVersion} onOpenClient={(id, month) => openClient(id, { tab: "acompanhamento", month })} />
        ) : view === "goals" ? (
          <CrmGoalsView
            currentUserId={currentUserId}
            seeAll={caps.seeTeamProductivity}
            canEdit={caps.manageGoals}
            canExport={caps.exportReports}
            version={dataVersion}
            now={now}
          />
        ) : view === "transfers" ? (
          <CrmTransfersView
            currentUserId={currentUserId}
            canDecide={caps.assignAnyOwner}
            version={dataVersion}
            onOpenContact={(id) => openContact(id)}
            onChanged={() => {
              setDataVersion((v) => v + 1);
              void refresh();
            }}
          />
        ) : view === "reports" ? (
          <CrmReportsView
            team={team}
            currentUserId={currentUserId}
            seeAll={caps.seeTeamProductivity}
            canExport={caps.exportReports}
            version={dataVersion}
            now={now}
            onOpenContact={(id) => openContact(id, "negocio")}
          />
        ) : view === "settings" && caps.customize ? (
          <CrmSettingsView />
        ) : view === "automations" && caps.manageAutomations ? (
          <CrmAutomationsView team={team} onOpenContact={(id) => openContact(id)} />
        ) : view === "audit" && caps.manageTeam ? (
          <CrmAuditView team={team} onOpenContact={(id) => openContact(id)} />
        ) : view === "team" && caps.manageTeam ? (
          <CrmTeamView currentUserId={currentUserId} onChanged={() => void refresh()} />
        ) : view === "companies" ? (
          <CrmCompaniesView team={team} version={dataVersion} onOpenCompany={setCompanyId} />
        ) : view === "tasks" ? (
          <CrmTasksView
            tasks={tasks}
            inbox={inbox}
            team={team}
            currentUserId={currentUserId}
            now={now}
            canComplete={caps.editPipeline}
            onlyOwn={!caps.actOnAllLeads}
            version={dataVersion}
            onOpenContact={(id, tab) => openContact(id, tab)}
            onOpenTask={openTask}
            onNewTask={newTask}
            onChanged={() => void refresh()}
          />
        ) : view === "agenda" ? (
          <CrmAgendaView
            team={team}
            version={dataVersion}
            now={now}
            canCreate={caps.editPipeline}
            onOpenTask={openTask}
            onNewTask={newTask}
            onOpenContact={(id, dealId) => openContact(id, "negocio", dealId)}
            onOpenCompany={(id) => (setSelected(null), setCompanyId(id))}
          />
        ) : (
          <>
            {deals.length === 0 && (
              <div className="flex items-end gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 max-w-xl overflow-hidden">
                <div className="pb-5">
                  <p className="crm-display text-[17px] mb-1">Vamos começar?</p>
                  <p className="text-[12.5px] text-crm-dim leading-relaxed">
                    Adicione o primeiro lead em <strong className="text-crm-text">+ Novo contato</strong>. Quem mandar mensagem para o
                    número de prospecção também aparece aqui sozinho, na coluna Novo lead.
                  </p>
                </div>
                <Mascot name="legacyHello" decorative className="h-28 w-auto shrink-0" />
              </div>
            )}
            <div
              ref={boardRef}
              className="flex gap-3 overflow-x-auto pb-4 items-start"
              onDragOver={(e) => {
                // Dragging a card near the board's edge scrolls it, so the
                // columns off screen (Venda fechada, Venda perdida) can still take the drop.
                const el = boardRef.current;
                if (!el) return;
                const r = el.getBoundingClientRect();
                if (e.clientX > r.right - BOARD_EDGE) el.scrollLeft += BOARD_SCROLL_STEP;
                else if (e.clientX < r.left + BOARD_EDGE) el.scrollLeft -= BOARD_SCROLL_STEP;
              }}
            >
              {columns.map((stage) => {
                const items = visible.filter((d) => d.stage === stage.id);
                const total = items.reduce((sum, d) => sum + (dealWorth(d) ?? 0), 0);
                return (
                  <section
                    key={stage.id}
                    aria-label={stage.label}
                    onDragOver={(e) => {
                      e.preventDefault();
                      e.dataTransfer.dropEffect = "move";
                      if (dropStage !== stage.id) setDropStage(stage.id);
                    }}
                    onDragLeave={(e) => {
                      if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setDropStage(null);
                    }}
                    onDrop={(e) => handleDrop(e, stage.id)}
                    className={`w-[248px] shrink-0 rounded-2xl border transition-colors duration-150 ${
                      dropStage === stage.id ? "border-crm-accent bg-crm-accent/[0.06]" : "border-transparent bg-crm-column"
                    }`}
                  >
                    <header className="px-3.5 pt-3 pb-2">
                      <div className="flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-[12.5px] font-semibold text-crm-text">
                          <span className={`h-2 w-2 rounded-full ${catalog.stageDot(stage.id)}`} aria-hidden="true" />
                          {stage.label}
                          {stage.archived && <span className="text-[10.5px] font-normal text-crm-faint">(arquivada)</span>}
                        </h2>
                        <span className="flex items-center gap-1.5">
                          {!isClosedStage(stage.id) && (
                            <span className="text-[10.5px] text-crm-faint tabular-nums" title={`Probabilidade de fechamento em ${stage.label}`}>
                              {stage.probability}%
                            </span>
                          )}
                          <span className="text-[11px] font-medium text-crm-dim tabular-nums rounded-full bg-crm-card border border-crm-line px-2 py-0.5">{items.length}</span>
                        </span>
                      </div>
                      <p className="mt-0.5 pl-4 h-4 text-[11.5px] text-crm-dim tabular-nums" aria-label={`Total em ${stage.label}`}>
                        {total > 0 ? formatBRL(total) : ""}
                        {isClosedStage(stage.id) && items.length > 0 ? <span className="text-crm-faint">{total > 0 ? " · " : ""}últimos 30 dias</span> : null}
                      </p>
                    </header>
                    <div className="px-2.5 pb-3 space-y-2 min-h-[96px]">
                      {items.map((d) => (
                        <DealCard
                          key={d.id}
                          deal={d}
                          selected={selected?.contactId === d.contactId && (!selected.dealId || selected.dealId === d.id)}
                          canDrag={caps.editPipeline && (caps.actOnAllLeads || !d.ownerId || d.ownerId === currentUserId)}
                          now={now}
                          onOpen={(deal) => openContact(deal.contactId, undefined, deal.id)}
                        />
                      ))}
                      {items.length === 0 && (
                        <p className="rounded-xl border border-dashed border-crm-line-strong/70 px-3 py-6 text-center text-[11.5px] text-crm-faint">
                          {caps.editPipeline ? "Arraste um card para cá" : "Nenhuma oportunidade"}
                        </p>
                      )}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        )}
      </div>
      </div>

      {companyId && !selected && (
        <CrmCompanyPanel
          key={companyId}
          companyId={companyId}
          team={team}
          currentUserId={currentUserId}
          caps={caps}
          version={dataVersion}
          onClose={() => setCompanyId(null)}
          onOpenContact={(id) => openContact(id)}
          onOpenTask={openTask}
          onNewTask={newTask}
          onChanged={() => setDataVersion((v) => v + 1)}
          onOpenClient={openClient}
        />
      )}

      {clientId && !selected && !companyId && (
        <CrmClientPanel
          key={`${clientId.id}|${clientId.tab ?? ""}|${clientId.month ?? ""}`}
          clientId={clientId.id}
          initialTab={clientId.tab}
          initialMonth={clientId.month}
          team={team}
          currentUserId={currentUserId}
          caps={caps}
          onClose={() => setClientId(null)}
          onOpenContact={(id) => openContact(id)}
          onOpenCompany={(id) => setCompanyId(id)}
          onChanged={() => setDataVersion((v) => v + 1)}
        />
      )}

      {taskTarget && (
        <CrmTaskDialog
          key={"id" in taskTarget ? taskTarget.id : "new"}
          target={taskTarget}
          team={ownerChoices}
          canEdit={caps.editPipeline}
          defaultOwnerId={caps.editPipeline ? currentUserId : ""}
          onClose={() => setTaskTarget(null)}
          onSaved={() => {
            setTasksVersion((v) => v + 1);
            void refresh();
          }}
          onOpenContact={(id, dealId) => {
            setTaskTarget(null);
            openContact(id, "negocio", dealId);
          }}
          onOpenCompany={(id) => {
            setTaskTarget(null);
            setSelected(null);
            setCompanyId(id);
          }}
        />
      )}

      <CrmImportDialog
        open={importOpen}
        team={team}
        currentUserId={currentUserId}
        onClose={() => setImportOpen(false)}
        onImported={() => void refresh()}
      />

      {selected && (
        <CrmContactPanel
          key={`${selected.contactId}|${selected.dealId ?? ""}|${selected.tab ?? ""}`}
          contactId={selected.contactId}
          initialDealId={selected.dealId ?? null}
          initialTab={selected.tab}
          currentUserId={currentUserId}
          caps={caps}
          team={team}
          quickReplies={quickReplies}
          onQuickRepliesChange={setQuickReplies}
          whatsappConfigured={whatsappConfigured}
          templatesConfigured={templatesConfigured}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh()}
          onWon={celebrate}
          onOpenTask={openTask}
          onNewTask={newTask}
          tasksVersion={tasksVersion}
          onOpenClient={openClient}
        />
      )}

      {lostPending && (
        <CrmLostDialog
          dealTitle={lostPending.title}
          reopening={lostPending.reopening}
          onCancel={() => setLostPending(null)}
          onConfirm={(fields) => {
            const { dealId } = lostPending;
            setLostPending(null);
            void patchStage(dealId, { stage: "perdido", ...fields });
          }}
        />
      )}

      {stagePending && (
        <CrmStageDialog
          deal={stagePending.deal}
          stage={stagePending.stage}
          canCustomize={caps.customize}
          onCancel={() => setStagePending(null)}
          onConfirm={(fields) => {
            const { deal, stage } = stagePending;
            setStagePending(null);
            void patchStage(deal.id, { stage, ...fields });
          }}
        />
      )}

      {celebration && (
        <div
          role="status"
          className="crm-toast-in fixed bottom-5 right-5 z-[60] flex items-end gap-3 rounded-2xl border border-crm-silver/50 bg-crm-raised pl-2 pr-5 pt-2 shadow-[var(--crm-shadow-lg)] max-w-[calc(100vw-40px)]"
        >
          <Mascot name={celebration.mascot} decorative className="h-24 w-auto shrink-0" />
          <div className="pb-4 min-w-0">
            <p className="crm-display text-[18px] text-crm-accent">Conquista!</p>
            <p className="text-[12.5px] text-crm-text">
              Negócio ganho: <strong>{celebration.name}</strong>. Parabéns, time!
            </p>
          </div>
          <button type="button" onClick={() => setCelebration(null)} aria-label="Fechar aviso" className="absolute top-2 right-2.5 text-crm-faint hover:text-crm-text text-[16px] leading-none">
            ×
          </button>
        </div>
      )}

      <CrmNewContactDialog
        open={newOpen}
        team={ownerChoices}
        currentUserId={currentUserId}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          setNewOpen(false);
          void refresh();
          openContact(id);
        }}
        canAuthorizeParallel={caps.assignAnyOwner}
        onOpenExisting={(d) => {
          setNewOpen(false);
          if (d.kind === "company") setCompanyId(d.id);
          else if (d.kind === "contact") openContact(d.id);
        }}
      />
    </div>
  );
}
