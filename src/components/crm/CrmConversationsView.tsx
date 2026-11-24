"use client";

import { useEffect, useState, type ReactNode } from "react";
import { CRM_STAGES, stageLabel, type CrmConversation, type CrmResponseStats, type CrmStage, type CrmTeamMember } from "@/lib/crm-types";
import { CRM_FILTER, CRM_INPUT, CRM_LINK_BTN, CRM_SEGMENT_TRACK, STAGE_DOT, crmSegment } from "./crm-styles";
import { chatTime, initials, minutesLabel, windowLabel } from "./crm-format";
import { TagChip, useCatalog } from "./crm-catalog-context";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";

const PAGE = 60;
const MAX_ROWS = 200;

type Result = { key: string; rows: CrmConversation[]; hasMore: boolean; unreadTotal: number };

export function StageTag({ stage }: { stage: CrmStage }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-crm-line bg-crm-sunken px-2 py-0.5 text-[10.5px] font-medium text-crm-dim whitespace-nowrap">
      <span className={`h-1.5 w-1.5 rounded-full ${STAGE_DOT[stage]}`} aria-hidden="true" />
      {stageLabel(stage)}
    </span>
  );
}

/** "12 min", "3 h", "2 d" — how long something has been waiting. */
export function waitLabel(sinceIso: string, now: number): string {
  const min = Math.max(0, Math.floor((now - Date.parse(sinceIso)) / 60_000));
  if (min < 60) return `${min} min`;
  if (min < 48 * 60) return `${Math.floor(min / 60)} h`;
  return `${Math.floor(min / 1440)} d`;
}

/** Minutes as "45 min" / "2 h 10 min". */
function ConversationRow({ c, selected, now, currentUserId, onOpen }: { c: CrmConversation; selected: boolean; now: number; currentUserId: string; onOpen: () => void }) {
  const { tag } = useCatalog();
  const unread = c.unreadCount > 0;
  const waitingMin = c.waitingSince ? (now - Date.parse(c.waitingSince)) / 60_000 : 0;
  const attendanceTags = c.tagIds.map((id) => tag(id)).filter((t) => t && t.category === "atendimento");
  // The last message was ours when nothing came in after it.
  const ours = Boolean(c.lastMessageAt) && (!c.lastInboundAt || Date.parse(c.lastMessageAt!) > Date.parse(c.lastInboundAt));
  const win = windowLabel(c.lastInboundAt, now);
  return (
    <button
      type="button"
      onClick={onOpen}
      aria-current={selected ? "true" : undefined}
      className={`w-full text-left flex gap-3 px-4 py-3 transition-colors duration-150 ${
        selected ? "bg-crm-accent/[0.08]" : "hover:bg-crm-hover"
      }`}
    >
      <span className="relative h-10 w-10 shrink-0 rounded-full bg-crm-navy text-white text-[12.5px] font-semibold flex items-center justify-center ring-2 ring-crm-silver/50">
        {initials(c.name)}
        {win && <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-crm-green ring-2 ring-crm-card" title={`Janela de 24h aberta (${win})`} />}
      </span>
      <span className="min-w-0 flex-1">
        <span className="flex items-baseline gap-2">
          <span className={`truncate text-[13.5px] ${unread ? "font-bold" : "font-semibold"} text-crm-text`}>{c.name}</span>
          {c.company && <span className="truncate text-[12px] text-crm-dim">· {c.company}</span>}
          <span className={`ml-auto shrink-0 text-[11px] tabular-nums ${unread ? "text-crm-accent font-semibold" : "text-crm-faint"}`}>
            {c.lastMessageAt ? chatTime(c.lastMessageAt, now) : ""}
          </span>
        </span>
        <span className="mt-0.5 flex items-center gap-2">
          <span className={`truncate text-[12.5px] ${unread ? "text-crm-text font-medium" : "text-crm-dim"}`}>
            {ours && <span className="text-crm-faint">Você: </span>}
            {c.lastMessagePreview ?? ""}
          </span>
          {unread && (
            <span className="ml-auto shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-crm-accent text-crm-on-accent text-[10.5px] font-semibold flex items-center justify-center" aria-label={`${c.unreadCount} não lida(s)`}>
              {c.unreadCount}
            </span>
          )}
        </span>
        <span className="mt-1.5 flex flex-wrap items-center gap-1">
          {c.dealStages.length > 0 ? (
            c.dealStages.map((st) => <StageTag key={st} stage={st} />)
          ) : (
            <span className="rounded-full border border-dashed border-crm-line px-2 py-0.5 text-[10.5px] text-crm-faint">Fora do funil</span>
          )}
          {c.optedOutAt && (
            <span className="rounded-full border border-crm-red/25 bg-crm-red/10 px-2 py-0.5 text-[10.5px] font-semibold text-crm-red">Descadastrado</span>
          )}
          {attendanceTags.map((t) => (
            <TagChip key={t!.id} tag={t!} small />
          ))}
          {c.waitingSince && (
            <span
              className={`rounded-full border px-2 py-0.5 text-[10.5px] font-semibold ${
                waitingMin >= 240 ? "border-crm-red/25 bg-crm-red/10 text-crm-red" : waitingMin >= 30 ? "border-crm-amber/30 bg-crm-amber/10 text-crm-amber" : "border-crm-line text-crm-dim"
              }`}
              title="Tempo desde a primeira mensagem do contato ainda sem resposta"
            >
              Aguardando · {waitLabel(c.waitingSince, now)}
            </span>
          )}
          <span className="ml-auto flex items-center gap-1.5">
            {c.attendantId && (
              <span className="text-[10.5px] text-crm-dim whitespace-nowrap" title="Quem está atendendo a conversa">
                Atende: {c.attendantId === currentUserId ? "você" : c.attendantName}
              </span>
            )}
            <OwnerAvatar name={c.ownerName} />
          </span>
        </span>
      </span>
    </button>
  );
}

/**
 * Every WhatsApp conversation, newest first, tagged with the funnel stages of
 * its opportunities. On desktop the chosen conversation opens beside the list
 * (`panel`); on phones the parent opens it as a slide-over.
 */
export default function CrmConversationsView({
  team,
  version,
  now,
  currentUserId,
  selectedId,
  onOpen,
  panel,
  whatsappConfigured,
}: {
  team: CrmTeamMember[];
  currentUserId: string;
  version: number;
  now: number;
  selectedId: string | null;
  onOpen: (contactId: string) => void;
  /** The open conversation, shown beside the list on wide screens. */
  panel: ReactNode;
  whatsappConfigured: boolean;
}) {
  const [search, setSearch] = useState("");
  const [query, setQuery] = useState("");
  const { tagGroups } = useCatalog();
  const [show, setShow] = useState<"all" | "unread" | "waiting">("all");
  const unreadOnly = show === "unread";
  const [stage, setStage] = useState("");
  const [owner, setOwner] = useState("all");
  const [attendant, setAttendant] = useState("all");
  const [tagFilter, setTagFilter] = useState("");
  const [statsDays, setStatsDays] = useState<7 | 30>(7);
  const [stats, setStats] = useState<CrmResponseStats | null>(null);
  const [statsOpen, setStatsOpen] = useState(false);
  const [limit, setLimit] = useState(PAGE);
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState(false);

  // Typing settles for a moment before the list refetches.
  useEffect(() => {
    const t = setTimeout(() => setQuery(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);

  // Tempo de resposta (the strip above the list).
  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/conversations/stats/?days=${statsDays}`)
      .then(async (res) => {
        if (res.ok && !cancelled) setStats((await res.json()) as CrmResponseStats);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [statsDays, version]);

  const filterKey = JSON.stringify([query, show, stage, owner, attendant, tagFilter]);
  useEffect(() => {
    let cancelled = false;
    const qs = new URLSearchParams({ owner, limit: String(limit) });
    if (query) qs.set("q", query);
    if (show === "unread") qs.set("unread", "1");
    if (show === "waiting") qs.set("waiting", "1");
    if (stage) qs.set("stage", stage);
    if (attendant !== "all") qs.set("attendant", attendant);
    if (tagFilter) qs.set("tag", tagFilter);
    fetch(`/api/crm/conversations/?${qs}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("fetch failed");
        const data = (await res.json()) as { rows: CrmConversation[]; next: string | null; unreadTotal: number };
        if (!cancelled) {
          setResult({ key: filterKey, rows: data.rows, hasMore: Boolean(data.next), unreadTotal: data.unreadTotal });
          setError(false);
        }
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [filterKey, owner, limit, query, show, stage, attendant, tagFilter, version]);

  // A new filter starts again from the first page.
  function changeFilter(apply: () => void) {
    apply();
    setLimit(PAGE);
  }

  const rows = result?.rows ?? [];
  const loading = !result || result.key !== filterKey;
  const filtered = Boolean(query || show !== "all" || stage || owner !== "all" || attendant !== "all" || tagFilter);

  return (
    <section aria-label="Conversas" className="space-y-3">
      {!whatsappConfigured && (
        <p className="text-[12.5px] text-crm-dim max-w-3xl">
          O número de prospecção ainda não está conectado: as conversas aparecem aqui assim que o WhatsApp for ligado ao CRM (passo a passo em{" "}
          <code className="bg-crm-card border border-crm-line px-1.5 py-0.5 rounded">docs/whatsapp-crm-setup.md</code>).
        </p>
      )}
      {stats && (
        <section aria-label="Tempo de resposta" className="rounded-xl border border-crm-line bg-crm-card px-4 py-2.5 text-[12.5px] shadow-[var(--crm-shadow)]">
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
            <span>
              <span className="text-crm-dim">Resposta média ({stats.days} dias):</span> <strong>{minutesLabel(stats.team.avgMinutes)}</strong>
              <span className="text-crm-faint"> · {stats.team.answered} respondidas</span>
            </span>
            <span>
              <span className="text-crm-dim">Aguardando resposta agora:</span>{" "}
              <strong className={stats.waitingNow > 0 ? "text-crm-amber" : ""}>{stats.waitingNow}</strong>
            </span>
            <span className="ml-auto flex items-center gap-2">
              <span className={CRM_SEGMENT_TRACK} role="group" aria-label="Período do tempo de resposta">
                {([7, 30] as const).map((d) => (
                  <button key={d} type="button" aria-pressed={statsDays === d} onClick={() => setStatsDays(d)} className={`${crmSegment(statsDays === d)} !py-1 !px-2.5 !text-[11.5px]`}>
                    {d} dias
                  </button>
                ))}
              </span>
              {stats.people.length > 0 && (
                <button type="button" className={`${CRM_LINK_BTN} !text-[12px]`} aria-expanded={statsOpen} onClick={() => setStatsOpen((v) => !v)}>
                  {statsOpen ? "Esconder" : "Por pessoa"}
                </button>
              )}
            </span>
          </div>
          {statsOpen && (
            <ul className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3" aria-label="Tempo de resposta por pessoa">
              {stats.people.map((p) => (
                <li key={p.userId} className="flex items-center justify-between gap-2 rounded-lg bg-crm-sunken px-3 py-1.5">
                  <span className="truncate">{p.name}</span>
                  <span className="tabular-nums whitespace-nowrap">
                    <strong>{minutesLabel(p.avgMinutes)}</strong> <span className="text-crm-faint">· {p.answered}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}
      <div className="grid grid-cols-1 lg:grid-cols-[minmax(320px,400px)_minmax(0,1fr)] rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden h-[calc(100dvh-13.5rem)] min-h-[460px]">
        <div className="flex flex-col min-h-0 min-w-0 lg:border-r lg:border-crm-line">
          <div className="p-3 space-y-2 border-b border-crm-line">
            <input
              type="search"
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
                setLimit(PAGE);
              }}
              placeholder="Buscar nome, empresa ou telefone"
              aria-label="Buscar conversas"
              className={`${CRM_INPUT} !rounded-full !py-1.5`}
            />
            <div className="flex flex-wrap items-center gap-2">
              <div className={CRM_SEGMENT_TRACK} role="group" aria-label="Mostrar">
                <button type="button" aria-pressed={show === "all"} onClick={() => changeFilter(() => setShow("all"))} className={crmSegment(show === "all")}>
                  Todas
                </button>
                <button type="button" aria-pressed={unreadOnly} onClick={() => changeFilter(() => setShow("unread"))} className={crmSegment(unreadOnly)}>
                  Não lidas{result && result.unreadTotal > 0 ? ` · ${result.unreadTotal}` : ""}
                </button>
                <button type="button" aria-pressed={show === "waiting"} onClick={() => changeFilter(() => setShow("waiting"))} className={crmSegment(show === "waiting")}>
                  Aguardando
                </button>
              </div>
              <select value={stage} onChange={(e) => changeFilter(() => setStage(e.target.value))} aria-label="Filtrar por etapa" className={`${CRM_FILTER} !text-[12px]`}>
                <option value="">Todas as etapas</option>
                {CRM_STAGES.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
              <select value={owner} onChange={(e) => changeFilter(() => setOwner(e.target.value))} aria-label="Filtrar por responsável" className={`${CRM_FILTER} !text-[12px]`}>
                <option value="all">Todos</option>
                <option value="mine">Minhas</option>
                <option value="none">Sem responsável</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.name}
                  </option>
                ))}
              </select>
              <select value={attendant} onChange={(e) => changeFilter(() => setAttendant(e.target.value))} aria-label="Filtrar por atendimento" className={`${CRM_FILTER} !text-[12px]`}>
                <option value="all">Qualquer atendimento</option>
                <option value="mine">Meus atendimentos</option>
                <option value="none">Sem atendimento</option>
                {team.map((m) => (
                  <option key={m.id} value={m.id}>
                    Atende: {m.name}
                  </option>
                ))}
              </select>
              <select value={tagFilter} onChange={(e) => changeFilter(() => setTagFilter(e.target.value))} aria-label="Filtrar por etiqueta" className={`${CRM_FILTER} !text-[12px] max-w-full`}>
                <option value="">Todas as etiquetas</option>
                {[...tagGroups].sort((a, b) => Number(b.id === "atendimento") - Number(a.id === "atendimento")).map((g) => (
                  <optgroup key={g.id} label={g.label}>
                    {g.tags.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
          </div>

          <div className={`flex-1 min-h-0 overflow-y-auto transition-opacity ${loading && result ? "opacity-60" : ""}`}>
            {error && !result ? (
              <p className="p-4 text-[12.5px] text-crm-red">Não foi possível carregar as conversas agora.</p>
            ) : !result ? (
              <p className="p-4 text-[12.5px] text-crm-dim">Carregando conversas...</p>
            ) : rows.length === 0 ? (
              <div className="flex flex-col items-center text-center gap-2 px-6 py-10">
                <Mascot name={filtered ? "titanDoubt" : "legacyHello"} decorative className="h-24 w-auto" />
                <p className="text-[13px] font-semibold">{filtered ? "Nenhuma conversa com esses filtros" : "Nenhuma conversa ainda"}</p>
                <p className="text-[12px] text-crm-dim">
                  {filtered ? "Tente limpar a busca ou trocar a etapa." : "Quando alguém mandar mensagem para o número de prospecção, a conversa aparece aqui."}
                </p>
              </div>
            ) : (
              <>
                <ul className="divide-y divide-crm-line">
                  {rows.map((c) => (
                    <li key={c.id}>
                      <ConversationRow c={c} selected={c.id === selectedId} now={now} currentUserId={currentUserId} onOpen={() => onOpen(c.id)} />
                    </li>
                  ))}
                </ul>
                {result.hasMore && (
                  <div className="p-3 text-center">
                    {limit < MAX_ROWS ? (
                      <button type="button" onClick={() => setLimit((n) => Math.min(MAX_ROWS, n + PAGE))} className="text-[12.5px] font-semibold text-crm-accent hover:opacity-80">
                        Carregar mais conversas
                      </button>
                    ) : (
                      <p className="text-[11.5px] text-crm-faint">Mostrando as {MAX_ROWS} mais recentes. Use a busca para achar conversas antigas.</p>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        <div className="hidden lg:flex min-h-0 flex-col">
          {panel ?? (
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 px-8 bg-crm-sunken/40">
              <Mascot name="legacyHello" decorative className="h-32 w-auto" />
              <p className="crm-display text-[17px]">Escolha uma conversa</p>
              <p className="text-[12.5px] text-crm-dim max-w-sm">
                As mensagens aparecem aqui, junto com a etapa do lead no funil, as oportunidades e as tarefas.
              </p>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
