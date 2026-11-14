"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type DragEvent, type KeyboardEvent } from "react";
import Link from "next/link";
import {
  CRM_SOURCES,
  CRM_STAGES,
  sourceLabel,
  type CrmContactCard,
  type CrmQuickReply,
  type CrmStage,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CRM_INPUT, CRM_SEGMENT_TRACK, STAGE_DOT, crmSegment } from "./crm-styles";
import type { CrmTheme } from "./crm-theme";
import CrmThemeToggle from "./CrmThemeToggle";
import CrmWelcome from "./CrmWelcome";
import { LegadoLockup, Mascot } from "./crm-brand";
import { followUpState, initials, relativeTime, shortDate, spDate, windowLabel, type FollowUpState } from "./crm-format";
import CrmContactPanel from "./CrmContactPanel";
import CrmNewContactDialog from "./CrmNewContactDialog";

type CrmAppProps = {
  initialContacts: CrmContactCard[];
  team: CrmTeamMember[];
  initialQuickReplies: CrmQuickReply[];
  whatsappConfigured: boolean;
  templatesConfigured: boolean;
  currentUserId: string;
  currentUserName: string;
  initialTheme: CrmTheme | null;
};

const BOARD_REFRESH_MS = 10_000;

async function fetchContacts(): Promise<CrmContactCard[]> {
  const res = await fetch("/api/crm/contacts/");
  if (!res.ok) throw new Error("fetch failed");
  return ((await res.json()) as { contacts: CrmContactCard[] }).contacts;
}

export function OwnerAvatar({ name }: { name: string | null }) {
  if (!name) {
    return (
      <span
        title="Sem responsável"
        className="h-6 w-6 shrink-0 rounded-full border border-dashed border-crm-line-strong text-[10px] text-crm-faint flex items-center justify-center"
      >
        ?
      </span>
    );
  }
  return (
    <span
      title={`Responsável: ${name}`}
      className="h-6 w-6 shrink-0 rounded-full bg-crm-ink text-[10px] font-semibold text-crm-on-ink flex items-center justify-center"
    >
      {initials(name)}
    </span>
  );
}

const FOLLOW_UP_TONE: Record<FollowUpState, string> = {
  overdue: "text-crm-red",
  today: "text-crm-amber",
  upcoming: "text-crm-text",
  none: "text-crm-dim",
};

function ContactCard({
  contact,
  selected,
  now,
  today,
  onOpen,
}: {
  contact: CrmContactCard;
  selected: boolean;
  now: number;
  today: string;
  onOpen: (id: string) => void;
}) {
  const win = windowLabel(contact.lastInboundAt, now);
  const fu = followUpState(contact.nextActionAt, today);

  function handleDragStart(e: DragEvent<HTMLDivElement>) {
    e.dataTransfer.setData("text/plain", contact.id);
    e.dataTransfer.effectAllowed = "move";
  }

  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      onOpen(contact.id);
    }
  }

  return (
    <div
      role="button"
      tabIndex={0}
      draggable
      onDragStart={handleDragStart}
      onClick={() => onOpen(contact.id)}
      onKeyDown={handleKeyDown}
      aria-label={`Abrir ${contact.name}`}
      className={`cursor-pointer rounded-xl border bg-crm-card px-3 py-2.5 shadow-[var(--crm-shadow)] transition-colors duration-150 focus:outline-none focus-visible:border-crm-accent ${
        selected ? "border-crm-accent ring-1 ring-crm-accent/40" : "border-crm-line hover:border-crm-line-strong"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-crm-text truncate">{contact.name}</p>
          {contact.company && <p className="text-[11.5px] text-crm-dim truncate">{contact.company}</p>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          {contact.unreadCount > 0 && (
            <span
              title={`${contact.unreadCount} mensagem(ns) não lida(s)`}
              className="min-w-[18px] h-[18px] px-1 rounded-full bg-crm-accent text-crm-on-accent text-[10.5px] font-semibold flex items-center justify-center"
            >
              {contact.unreadCount}
            </span>
          )}
          <OwnerAvatar name={contact.ownerName} />
        </div>
      </div>

      <div className="mt-1.5 flex flex-wrap gap-1.5">
        <span className="max-w-full truncate text-[10.5px] px-2 py-0.5 rounded-full bg-crm-sunken border border-crm-line text-crm-dim">
          {sourceLabel(contact.source)}
          {contact.referredBy ? ` · ${contact.referredBy}` : ""}
        </span>
      </div>

      {contact.lastMessagePreview && (
        <p className="mt-1.5 text-[11.5px] text-crm-dim line-clamp-2 break-words">{contact.lastMessagePreview}</p>
      )}

      <div className="mt-2 flex items-center justify-between gap-2 text-[11px]">
        <span className="text-crm-faint">{contact.lastMessageAt ? relativeTime(contact.lastMessageAt, now) : "sem mensagens"}</span>
        {win && <span className="text-crm-green font-medium">janela: {win}</span>}
      </div>

      {(contact.nextAction || contact.nextActionAt) && (
        <p className={`mt-1 text-[11.5px] font-medium truncate ${FOLLOW_UP_TONE[fu]}`}>
          {fu === "overdue" ? "Atrasado: " : ""}
          {contact.nextAction ?? "Próxima ação"}
          {contact.nextActionAt ? ` · ${shortDate(contact.nextActionAt)}` : ""}
        </p>
      )}
    </div>
  );
}

export default function CrmApp({
  initialContacts,
  team,
  initialQuickReplies,
  whatsappConfigured,
  templatesConfigured,
  currentUserId,
  currentUserName,
  initialTheme,
}: CrmAppProps) {
  const [contacts, setContacts] = useState(initialContacts);
  const [quickReplies, setQuickReplies] = useState(initialQuickReplies);
  const [view, setView] = useState<"board" | "today">("board");
  const [ownerFilter, setOwnerFilter] = useState("all");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [followUpOnly, setFollowUpOnly] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [dropStage, setDropStage] = useState<CrmStage | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [celebration, setCelebration] = useState<{ name: string; mascot: "titanWin" | "legacyWin" } | null>(null);
  const celebrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      setContacts(await fetchContacts());
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

  const today = spDate(now);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const digits = q.replace(/\D/g, "");
    return contacts.filter((c) => {
      if (ownerFilter === "mine" && c.ownerId !== currentUserId) return false;
      if (ownerFilter === "none" && c.ownerId) return false;
      if (!["all", "mine", "none"].includes(ownerFilter) && c.ownerId !== ownerFilter) return false;
      if (sourceFilter !== "all" && c.source !== sourceFilter) return false;
      if (followUpOnly) {
        const s = followUpState(c.nextActionAt, today);
        if (s !== "overdue" && s !== "today") return false;
      }
      if (q) {
        const inText = c.name.toLowerCase().includes(q) || (c.company ?? "").toLowerCase().includes(q);
        const inPhone = digits.length >= 3 && c.phone.includes(digits);
        if (!inText && !inPhone) return false;
      }
      return true;
    });
  }, [contacts, ownerFilter, sourceFilter, followUpOnly, search, currentUserId, today]);

  const dueContacts = useMemo(
    () =>
      contacts
        .filter((c) => {
          const s = followUpState(c.nextActionAt, today);
          return (s === "overdue" || s === "today") && c.stage !== "ganho" && c.stage !== "perdido";
        })
        .sort((a, b) => Date.parse(a.nextActionAt!) - Date.parse(b.nextActionAt!)),
    [contacts, today]
  );

  async function moveTo(id: string, stage: CrmStage) {
    const before = contacts;
    if (before.find((c) => c.id === id)?.stage === stage) return;
    setContacts((cs) => cs.map((c) => (c.id === id ? { ...c, stage, stageChangedAt: new Date().toISOString() } : c)));
    const res = await fetch(`/api/crm/contacts/${id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ stage }),
    });
    if (!res.ok) {
      setContacts(before);
      const body = (await res.json().catch(() => null)) as { error?: string } | null;
      setError(body?.error ?? "Não foi possível mover o card.");
      return;
    }
    if (stage === "ganho") celebrate(before.find((c) => c.id === id)?.name ?? "O lead");
  }

  function handleDrop(e: DragEvent<HTMLElement>, stage: CrmStage) {
    e.preventDefault();
    setDropStage(null);
    const id = e.dataTransfer.getData("text/plain");
    if (id) void moveTo(id, stage);
  }

  return (
    <div className="min-h-screen bg-crm-bg text-crm-text">
      <header className="sticky top-0 z-20 bg-crm-header text-crm-header-text">
        <div className="h-14 px-4 sm:px-6 flex items-center gap-3 sm:gap-4">
          <Link href="/intelligence/" title="Voltar ao Legado Intelligence" className="shrink-0 opacity-95 hover:opacity-100 transition-opacity">
            <LegadoLockup />
          </Link>
          <span className="h-6 w-px bg-white/15" aria-hidden="true" />
          <h1 className="flex items-baseline gap-2 min-w-0">
            <span className="crm-display text-[17px] tracking-[0.08em]">CRM</span>
            <span className="hidden sm:inline text-[12.5px] text-crm-header-dim truncate">Prospecção</span>
          </h1>
          {!whatsappConfigured && (
            <span className="hidden lg:inline text-[11px] px-2.5 py-1 rounded-full bg-amber-400/15 text-amber-300 border border-amber-400/25">
              WhatsApp ainda não conectado
            </span>
          )}
          <div className="ml-auto flex items-center gap-2">
            <Link
              href="/intelligence/"
              className="hidden md:inline-flex items-center gap-1.5 text-[12px] text-crm-header-dim hover:text-crm-header-text px-2.5 py-1.5 rounded-full transition-colors duration-200"
            >
              Intelligence
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
                <path d="M7 17 17 7M8 7h9v9" />
              </svg>
            </Link>
            <span
              title={currentUserName}
              className="hidden sm:inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 border border-white/15 text-[11px] font-semibold"
            >
              {initials(currentUserName)}
            </span>
            <CrmThemeToggle initialTheme={initialTheme} />
            <button
              type="button"
              onClick={() => setNewOpen(true)}
              aria-label="Novo contato"
              className="inline-flex items-center gap-1 bg-white text-black text-[12.5px] font-semibold px-3.5 sm:px-4 py-2 rounded-full hover:bg-zinc-200 transition-colors duration-200"
            >
              <span aria-hidden="true">+</span>
              <span className="hidden sm:inline">Novo contato</span>
            </button>
          </div>
        </div>
        <div className="crm-gold-rule h-px opacity-80" aria-hidden="true" />
      </header>

      <div className="px-4 sm:px-6 py-5 space-y-4">
        <CrmWelcome userName={currentUserName} contacts={contacts} now={now} />

        {!whatsappConfigured && (
          <p className="text-[12.5px] text-crm-dim max-w-3xl">
            Os contatos, o funil e o histórico já funcionam. Enviar e receber mensagens começa quando o número de prospecção for
            conectado (passo a passo em <code className="bg-crm-card border border-crm-line px-1.5 py-0.5 rounded">docs/whatsapp-crm-setup.md</code>).
          </p>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <div className={CRM_SEGMENT_TRACK} role="tablist" aria-label="Visualização">
            <button
              type="button"
              role="tab"
              aria-selected={view === "board"}
              onClick={() => setView("board")}
              className={crmSegment(view === "board")}
            >
              Quadro
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={view === "today"}
              onClick={() => setView("today")}
              className={crmSegment(view === "today")}
            >
              Hoje{dueContacts.length > 0 ? ` · ${dueContacts.length}` : ""}
            </button>
          </div>

          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar nome, empresa ou telefone"
            aria-label="Buscar contatos"
            className={`${CRM_INPUT} !w-64 max-w-full !rounded-full !py-1.5`}
          />

          <select
            value={ownerFilter}
            onChange={(e) => setOwnerFilter(e.target.value)}
            aria-label="Filtrar por responsável"
            className={`${CRM_INPUT} !w-auto !rounded-full !py-1.5`}
          >
            <option value="all">Todos os responsáveis</option>
            <option value="mine">Meus contatos</option>
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

          <button
            type="button"
            aria-pressed={followUpOnly}
            onClick={() => setFollowUpOnly((v) => !v)}
            className={`text-[12.5px] px-3.5 py-1.5 rounded-full border transition-colors duration-200 ${
              followUpOnly ? "bg-crm-amber/[0.12] border-crm-amber/50 text-crm-amber font-medium" : "bg-crm-card border-crm-line text-crm-dim hover:text-crm-text hover:border-crm-line-strong"
            }`}
          >
            Precisa de follow-up
          </button>
        </div>

        {error && (
          <div className="flex items-center justify-between gap-3 rounded-xl border border-crm-red/30 bg-crm-red/[0.07] px-4 py-2.5 text-[12.5px] text-crm-red" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError(null)} aria-label="Dispensar aviso" className="text-crm-red/70 hover:text-crm-red">
              ×
            </button>
          </div>
        )}

        {view === "board" ? (
          <>
            {contacts.length === 0 && (
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
            <div className="flex gap-3 overflow-x-auto pb-4 items-start">
              {CRM_STAGES.map((stage) => {
                const items = visible.filter((c) => c.stage === stage.id);
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
                    <header className="px-3.5 pt-3 pb-2 flex items-center justify-between">
                      <h2 className="flex items-center gap-2 text-[12.5px] font-semibold text-crm-text">
                        <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage.id]}`} aria-hidden="true" />
                        {stage.label}
                      </h2>
                      <span className="text-[11px] font-medium text-crm-dim tabular-nums rounded-full bg-crm-card border border-crm-line px-2 py-0.5">{items.length}</span>
                    </header>
                    <div className="px-2.5 pb-3 space-y-2 min-h-[96px]">
                      {items.map((c) => (
                        <ContactCard key={c.id} contact={c} selected={c.id === selectedId} now={now} today={today} onOpen={setSelectedId} />
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
        ) : (
          <section aria-label="Follow-ups de hoje" className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] max-w-3xl">
            <header className="px-5 pt-4 pb-3 border-b border-crm-line">
              <h2 className="text-[14px] font-semibold">Hoje</h2>
              <p className="text-[12px] text-crm-dim mt-0.5">Próximas ações marcadas para hoje e as atrasadas, da mais antiga para a mais nova.</p>
            </header>
            {dueContacts.length === 0 ? (
              <div className="flex items-end justify-between gap-4 px-5 pt-5 overflow-hidden">
                <div className="pb-6">
                  <p className="crm-display text-[17px] mb-1">Tudo em dia</p>
                  <p className="text-[12.5px] text-crm-dim">Nenhum follow-up para hoje. Marque a próxima ação de cada lead no painel do contato.</p>
                </div>
                <Mascot name="titanWin" decorative className="h-28 w-auto shrink-0" />
              </div>
            ) : (
              <ul>
                {dueContacts.map((c) => {
                  const fu = followUpState(c.nextActionAt, today);
                  return (
                    <li key={c.id} className="border-b border-crm-line last:border-0">
                      <button
                        type="button"
                        onClick={() => setSelectedId(c.id)}
                        className="w-full text-left px-5 py-3 flex items-center gap-3 hover:bg-crm-hover transition-colors duration-150"
                      >
                        <OwnerAvatar name={c.ownerName} />
                        <span className="min-w-0 flex-1">
                          <span className="block text-[13px] font-semibold truncate">
                            {c.name}
                            {c.company ? <span className="font-normal text-crm-dim"> · {c.company}</span> : null}
                          </span>
                          <span className="block text-[12px] text-crm-dim truncate">{c.nextAction ?? "Próxima ação"}</span>
                        </span>
                        <span className={`text-[12px] font-medium shrink-0 ${FOLLOW_UP_TONE[fu]}`}>
                          {fu === "overdue" ? `Atrasado · ${shortDate(c.nextActionAt!)}` : "Hoje"}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        )}
      </div>

      {selectedId && (
        <CrmContactPanel
          key={selectedId}
          contactId={selectedId}
          team={team}
          quickReplies={quickReplies}
          onQuickRepliesChange={setQuickReplies}
          whatsappConfigured={whatsappConfigured}
          templatesConfigured={templatesConfigured}
          onClose={() => setSelectedId(null)}
          onChanged={() => void refresh()}
          onWon={celebrate}
        />
      )}

      {celebration && (
        <div
          role="status"
          className="crm-toast-in fixed bottom-5 right-5 z-[60] flex items-end gap-3 rounded-2xl border border-crm-gold/40 bg-crm-raised pl-2 pr-5 pt-2 shadow-[var(--crm-shadow-lg)] max-w-[calc(100vw-40px)]"
        >
          <Mascot name={celebration.mascot} decorative className="h-24 w-auto shrink-0" />
          <div className="pb-4 min-w-0">
            <p className="crm-display text-[18px] text-crm-gold">Conquista!</p>
            <p className="text-[12.5px] text-crm-text">
              <strong>{celebration.name}</strong> virou cliente. Parabéns, time!
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
          setSelectedId(id);
        }}
      />
    </div>
  );
}
