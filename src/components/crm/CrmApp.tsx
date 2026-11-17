"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type DragEvent, type KeyboardEvent } from "react";
import {
  CRM_SOURCES,
  CRM_STAGES,
  formatBRL,
  isClosedStage,
  lostReasonLabel,
  sourceLabel,
  type CrmContactCard,
  type CrmDealCard,
  type CrmLostReason,
  type CrmQuickReply,
  type CrmStage,
  type CrmTask,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_BTN_PRIMARY, CRM_INPUT, STAGE_DOT, TASK_KIND_ICON } from "./crm-styles";
import { CRM_SIDEBAR_COOKIE, type CrmTheme } from "./crm-theme";
import CrmWelcome from "./CrmWelcome";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";
import { TASK_STATE_TONE, relativeTime, shortDate, taskDueLabel, taskState, windowLabel } from "./crm-format";
import CrmSidebar, { CRM_SECTIONS, CrmSectionIcon, type CrmView } from "./CrmSidebar";
import CrmConversationsView from "./CrmConversationsView";
import CrmContactPanel from "./CrmContactPanel";
import CrmNewContactDialog from "./CrmNewContactDialog";
import CrmContactsView from "./CrmContactsView";
import CrmCompaniesView from "./CrmCompaniesView";
import CrmCompanyPanel from "./CrmCompanyPanel";
import CrmImportDialog from "./CrmImportDialog";
import CrmLostDialog from "./CrmLostDialog";
import CrmTasksView from "./CrmTasksView";
import CrmAgendaView from "./CrmAgendaView";

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

async function getJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("fetch failed");
  return (await res.json()) as T;
}

function DealCard({
  deal,
  selected,
  now,
  onOpen,
}: {
  deal: CrmDealCard;
  selected: boolean;
  now: number;
  onOpen: (deal: CrmDealCard) => void;
}) {
  const win = windowLabel(deal.lastInboundAt, now);
  const closed = isClosedStage(deal.stage);
  const task = deal.nextTask;
  const state = task ? taskState(task.dueAt, task.allDay, now) : null;
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
      draggable
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

      {(deal.valueCents !== null || deal.expectedCloseAt) && (
        <p className="mt-1 flex items-baseline gap-2 text-[12px]">
          {deal.valueCents !== null && <span className="font-semibold text-crm-text tabular-nums">{formatBRL(deal.valueCents)}</span>}
          {deal.expectedCloseAt && !closed && <span className="text-crm-faint">previsão {shortDate(deal.expectedCloseAt)}</span>}
        </p>
      )}

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="max-w-full truncate text-[10.5px] px-2 py-0.5 rounded-full bg-crm-sunken border border-crm-line text-crm-dim">
          {sourceLabel(deal.source)}
          {deal.referredBy ? ` · ${deal.referredBy}` : ""}
        </span>
      </div>

      {deal.stage === "perdido" && deal.lostReason && (
        <p className="mt-1.5 text-[11.5px] text-crm-red truncate">
          {lostReasonLabel(deal.lostReason)}
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
          <span aria-hidden="true">{TASK_KIND_ICON[task.kind]} </span>
          {task.title} · {taskDueLabel(task.dueAt, task.allDay, now)}
        </p>
      ) : (
        !closed && <p className="mt-1 text-[11.5px] text-crm-faint">Sem próxima tarefa</p>
      )}
    </div>
  );
}

export default function CrmApp({
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
}: CrmAppProps) {
  const [deals, setDeals] = useState(initialDeals);
  const [tasks, setTasks] = useState(initialTasks);
  const [inbox, setInbox] = useState(initialInbox);
  const [quickReplies, setQuickReplies] = useState(initialQuickReplies);
  const [view, setView] = useState<CrmView>("board");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(initialSidebarCollapsed);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  // The conversation open beside the Conversas list (wide screens only).
  const [conversationId, setConversationId] = useState<string | null>(null);
  const isWide = useSyncExternalStore(subscribeWide, () => window.matchMedia(WIDE_QUERY).matches, () => false);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  // Bumped after any change so the Agenda/Contatos/Empresas lists refetch.
  const [dataVersion, setDataVersion] = useState(0);
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [taskFilter, setTaskFilter] = useState<"all" | "due" | "none">("all");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Selection | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [dropStage, setDropStage] = useState<CrmStage | null>(null);
  const [lostPending, setLostPending] = useState<{ dealId: string; title: string } | null>(null);
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

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return deals.filter((d) => {
      if (ownerFilter === "mine" && d.ownerId !== currentUserId) return false;
      if (ownerFilter === "none" && d.ownerId) return false;
      if (!["all", "mine", "none"].includes(ownerFilter) && d.ownerId !== ownerFilter) return false;
      if (sourceFilter !== "all" && d.source !== sourceFilter) return false;
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
  }, [deals, ownerFilter, sourceFilter, taskFilter, search, currentUserId, now]);

  const dueCount = useMemo(
    () =>
      tasks.filter((t) => {
        const s = taskState(t.dueAt, t.allDay, now);
        return s === "overdue" || s === "today";
      }).length,
    [tasks, now]
  );
  const unread = inbox.reduce((sum, c) => sum + c.unreadCount, 0);

  async function patchStage(dealId: string, body: { stage: CrmStage; lostReason?: CrmLostReason; lostNote?: string }) {
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
    // Losing a deal always records why — the dialog asks before the move.
    if (stage === "perdido") setLostPending({ dealId, title: deal.title });
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
        whatsappConfigured={whatsappConfigured}
        initialTheme={initialTheme}
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
            <button type="button" onClick={() => setNewOpen(true)} aria-label="Novo contato" className={`${CRM_BTN_PRIMARY} ml-auto shrink-0 gap-1`}>
              <span aria-hidden="true">+</span>
              <span className="hidden sm:inline">Novo contato</span>
            </button>
          </div>
        </header>

      <div className="px-4 sm:px-6 py-5 space-y-4">
        {view === "board" && <CrmWelcome userName={currentUserName} deals={deals} tasks={tasks} unread={unread} now={now} />}

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
                {CRM_SOURCES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
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

        {view === "conversations" ? (
          <CrmConversationsView
            team={team}
            version={dataVersion}
            now={now}
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
                  team={team}
                  quickReplies={quickReplies}
                  onQuickRepliesChange={setQuickReplies}
                  whatsappConfigured={whatsappConfigured}
                  templatesConfigured={templatesConfigured}
                  onClose={() => setConversationId(null)}
                  onChanged={() => void refresh()}
                  onWon={celebrate}
                />
              ) : null
            }
          />
        ) : view === "contacts" ? (
          <CrmContactsView
            team={team}
            version={dataVersion}
            onOpenContact={(id) => openContact(id)}
            onImport={() => setImportOpen(true)}
            onNew={() => setNewOpen(true)}
          />
        ) : view === "companies" ? (
          <CrmCompaniesView version={dataVersion} onOpenCompany={setCompanyId} />
        ) : view === "tasks" ? (
          <CrmTasksView
            tasks={tasks}
            inbox={inbox}
            team={team}
            currentUserId={currentUserId}
            now={now}
            onOpenContact={(id, tab) => openContact(id, tab)}
            onChanged={() => void refresh()}
          />
        ) : view === "agenda" ? (
          <CrmAgendaView team={team} version={dataVersion} now={now} onOpenContact={(id, tab) => openContact(id, tab)} />
        ) : (
          <>
            {deals.length === 0 && (
              <div className="flex items-end gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 max-w-xl overflow-hidden">
                <div className="pb-5">
                  <p className="crm-display text-[17px] mb-1">Vamos começar?</p>
                  <p className="text-[12.5px] text-crm-dim leading-relaxed">
                    Adicione o primeiro lead em <strong className="text-crm-text">+ Novo contato</strong>. Quem mandar mensagem para o
                    número de prospecção também aparece aqui sozinho, na coluna Novo.
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
                // columns off screen (Ganho, Perdido) can still take the drop.
                const el = boardRef.current;
                if (!el) return;
                const r = el.getBoundingClientRect();
                if (e.clientX > r.right - BOARD_EDGE) el.scrollLeft += BOARD_SCROLL_STEP;
                else if (e.clientX < r.left + BOARD_EDGE) el.scrollLeft -= BOARD_SCROLL_STEP;
              }}
            >
              {CRM_STAGES.map((stage) => {
                const items = visible.filter((d) => d.stage === stage.id);
                const total = items.reduce((sum, d) => sum + (d.valueCents ?? 0), 0);
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
                    className={`w-[272px] shrink-0 rounded-2xl border transition-colors duration-150 ${
                      dropStage === stage.id ? "border-crm-accent bg-crm-accent/[0.06]" : "border-transparent bg-crm-column"
                    }`}
                  >
                    <header className="px-3.5 pt-3 pb-2">
                      <div className="flex items-center justify-between">
                        <h2 className="flex items-center gap-2 text-[12.5px] font-semibold text-crm-text">
                          <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage.id]}`} aria-hidden="true" />
                          {stage.label}
                        </h2>
                        <span className="text-[11px] font-medium text-crm-dim tabular-nums rounded-full bg-crm-card border border-crm-line px-2 py-0.5">{items.length}</span>
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
                          now={now}
                          onOpen={(deal) => openContact(deal.contactId, undefined, deal.id)}
                        />
                      ))}
                      {items.length === 0 && (
                        <p className="rounded-xl border border-dashed border-crm-line-strong/70 px-3 py-6 text-center text-[11.5px] text-crm-faint">
                          Arraste um card para cá
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
          onClose={() => setCompanyId(null)}
          onOpenContact={(id) => openContact(id)}
          onChanged={() => setDataVersion((v) => v + 1)}
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
          team={team}
          quickReplies={quickReplies}
          onQuickRepliesChange={setQuickReplies}
          whatsappConfigured={whatsappConfigured}
          templatesConfigured={templatesConfigured}
          onClose={() => setSelected(null)}
          onChanged={() => void refresh()}
          onWon={celebrate}
        />
      )}

      {lostPending && (
        <CrmLostDialog
          dealTitle={lostPending.title}
          onCancel={() => setLostPending(null)}
          onConfirm={(lostReason, lostNote) => {
            const { dealId } = lostPending;
            setLostPending(null);
            void patchStage(dealId, { stage: "perdido", lostReason, lostNote });
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
        team={team}
        currentUserId={currentUserId}
        onClose={() => setNewOpen(false)}
        onCreated={(id) => {
          setNewOpen(false);
          void refresh();
          openContact(id);
        }}
      />
    </div>
  );
}
