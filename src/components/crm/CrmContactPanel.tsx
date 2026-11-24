"use client";

import { useCallback, useEffect, useRef, useState, type FormEvent } from "react";
import {
  CRM_CONSENT,
  formatBRL,
  formatPhone,
  isClosedStage,
  serviceWindowRemainingMs,
  stageLabel,
  type CrmContactDetail,
  type CrmMessage,
  type CrmQuickReply,
  type CrmTeamMember,
  type CrmTemplate,
} from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_POPOVER, CRM_SEGMENT_TRACK, crmSegment } from "./crm-styles";
import { TASK_STATE_TONE, dateTime, initials, shortDate, taskDueLabel, taskState, todaySp, windowLabel } from "./crm-format";
import { Mascot } from "./crm-brand";
import CrmCompanyField from "./CrmCompanyField";
import CrmDealsTasksTab from "./CrmDealsTasksTab";
import type { CrmCapabilities } from "@/lib/crm-permissions";
import CrmLostDialog from "./CrmLostDialog";
import { WON_RESULTS, closeGroupLabel } from "@/lib/crm-catalog";
import CrmStageDialog, { needsStageDialog } from "./CrmStageDialog";
import { ServiceSelect, TemperatureChip, TemperatureSelect, brDay } from "./crm-fields";
import CrmTagsEditor from "./CrmTagsEditor";
import { SegmentSelect, TagChip, TagChips, useCatalog } from "./crm-catalog-context";
import type { TaskDraft } from "./CrmTaskDialog";
import { describeEvent } from "./crm-event-text";
import CrmAnalysisDialog from "./CrmAnalysisDialog";

type CrmContactPanelProps = {
  contactId: string;
  team: CrmTeamMember[];
  quickReplies: CrmQuickReply[];
  onQuickRepliesChange: (next: CrmQuickReply[]) => void;
  whatsappConfigured: boolean;
  templatesConfigured: boolean;
  onClose: () => void;
  /** Something about this contact changed — the board should refetch. */
  onChanged: () => void;
  /** The contact was just moved to Ganho from this panel. */
  onWon?: (name: string) => void;
  /** Opportunity to focus (opened from a funnel card). */
  initialDealId?: string | null;
  initialTab?: "conversa" | "negocio" | "detalhes";
  currentUserId: string;
  /** Rendered inside a page column (Conversas, desktop) instead of as a slide-over dialog. */
  embedded?: boolean;
  /** What the viewer's CRM profile allows (the server enforces it too). */
  caps: CrmCapabilities;
  /** Opens a task in the full task form (description, priority, history...). */
  onOpenTask?: (taskId: string) => void;
  /** Opens the task form for a new task (the conversation's "+ Tarefa"). */
  onNewTask?: (draft: TaskDraft) => void;
  /** Bumped when a task was saved in the task form: reload this contact. */
  tasksVersion?: number;
  /** Opens a client of Clientes ativos (from a won opportunity). */
  onOpenClient?: (clientId: string) => void;
};

const PANEL_REFRESH_MS = 5_000;

type ContactForm = {
  name: string;
  phone: string;
  email: string;
  jobTitle: string;
  company: string;
  segment: string;
  city: string;
  source: string;
  referredBy: string;
  consentSource: string;
  temperature: string;
  serviceInterest: string;
  returnAt: string;
  isDecisionMaker: boolean;
};

const STATUS_LABEL: Record<string, string> = { sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou" };

async function errorFrom(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => null)) as { error?: string } | null;
  return body?.error ?? fallback;
}

function MessageBubble({ message }: { message: CrmMessage }) {
  const out = message.direction === "out";
  const mediaUrl = message.mediaId ? `/api/crm/media/${encodeURIComponent(message.mediaId)}/` : null;
  return (
    <div className={`flex ${out ? "justify-end" : "justify-start"}`}>
      <div
        className={`max-w-[85%] rounded-2xl border px-3.5 py-2 ${
          out
            ? "bg-crm-bubble-out text-crm-bubble-out-text border-transparent rounded-br-md"
            : "bg-crm-bubble-in text-crm-text border-crm-line rounded-bl-md shadow-[var(--crm-shadow)]"
        }`}
      >
        {message.templateName && (
          <p className="text-[10.5px] tracking-[0.06em] uppercase opacity-60 mb-1">
            {message.campaignName ? `Campanha · ${message.campaignName}` : `Modelo · ${message.templateName}`}
          </p>
        )}
        {mediaUrl && message.type === "image" && (
          // eslint-disable-next-line @next/next/no-img-element -- streamed from the authenticated media proxy, not a static asset
          <img src={mediaUrl} alt="Imagem enviada pelo contato" className="max-h-64 rounded-lg mb-1" />
        )}
        {mediaUrl && message.type === "audio" && <audio controls src={mediaUrl} className="max-w-full mb-1" />}
        {mediaUrl && message.type === "video" && <video controls src={mediaUrl} className="max-h-64 rounded-lg mb-1" />}
        {mediaUrl && !["image", "audio", "video"].includes(message.type) && (
          <a href={mediaUrl} target="_blank" rel="noreferrer" className="block text-[12.5px] underline mb-1">
            Abrir arquivo
          </a>
        )}
        {message.body && <p className="text-[13px] whitespace-pre-wrap break-words">{message.body}</p>}
        <p className="mt-1 text-[10.5px] opacity-60 text-right">
          {dateTime(message.createdAt)}
          {out && message.sentByName ? ` · ${message.sentByName}` : ""}
          {out && message.status ? ` · ${STATUS_LABEL[message.status] ?? message.status}` : ""}
        </p>
        {message.error && <p className={`mt-0.5 text-[11px] font-medium ${out ? "text-red-400" : "text-crm-red"}`}>{message.error}</p>}
      </div>
    </div>
  );
}

function QuickReplies({
  quickReplies,
  onPick,
  onChange,
}: {
  quickReplies: CrmQuickReply[];
  onPick: (body: string) => void;
  onChange: (next: CrmQuickReply[]) => void;
}) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function add(e: FormEvent) {
    e.preventDefault();
    const res = await fetch("/api/crm/quick-replies/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title, body }),
    });
    if (!res.ok) return setError(await errorFrom(res, "Não foi possível salvar."));
    const { quickReply } = (await res.json()) as { quickReply: CrmQuickReply };
    onChange([...quickReplies, quickReply].sort((a, b) => a.title.localeCompare(b.title)));
    setTitle("");
    setBody("");
    setError(null);
  }

  async function remove(id: string) {
    const res = await fetch(`/api/crm/quick-replies/${id}/`, { method: "DELETE" });
    if (res.ok) onChange(quickReplies.filter((q) => q.id !== id));
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={CRM_BTN_OUTLINE}
      >
        Respostas rápidas
      </button>
      {open && (
        <div className={`absolute bottom-full left-0 mb-2 w-80 max-w-[85vw] z-10 p-3 ${CRM_POPOVER}`}>
          {quickReplies.length === 0 ? (
            <p className="text-[12px] text-crm-dim mb-3">Nenhuma resposta rápida ainda.</p>
          ) : (
            <ul className="mb-3 max-h-48 overflow-y-auto space-y-1">
              {quickReplies.map((q) => (
                <li key={q.id} className="flex items-start gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      onPick(q.body);
                      setOpen(false);
                    }}
                    className="flex-1 text-left rounded-lg px-2 py-1.5 hover:bg-crm-hover"
                  >
                    <span className="block text-[12.5px] font-semibold text-crm-text">{q.title}</span>
                    <span className="block text-[11.5px] text-crm-dim line-clamp-2">{q.body}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => void remove(q.id)}
                    aria-label={`Excluir ${q.title}`}
                    className="text-crm-dim hover:text-crm-red px-1.5 py-1"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>
          )}
          <form onSubmit={add} className="space-y-2 border-t border-crm-line pt-3">
            <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Título (ex.: Boas-vindas)" aria-label="Título da resposta rápida" className={CRM_INPUT} />
            <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={2} placeholder="Texto" aria-label="Texto da resposta rápida" className={CRM_INPUT} />
            {error && <p className="text-[11.5px] text-crm-red">{error}</p>}
            <button type="submit" className="text-[12px] font-semibold text-crm-accent hover:opacity-80">
              + Salvar resposta rápida
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

function TemplatePicker({ templatesConfigured, onSend }: { templatesConfigured: boolean; onSend: (t: CrmTemplate, params: string[]) => Promise<void> }) {
  const [templates, setTemplates] = useState<CrmTemplate[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [chosen, setChosen] = useState("");
  const [params, setParams] = useState<string[]>([]);
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!templatesConfigured) return;
    let cancelled = false;
    fetch("/api/crm/templates/")
      .then(async (res) => {
        if (!res.ok) throw new Error(await errorFrom(res, "Não foi possível carregar os modelos."));
        return ((await res.json()) as { templates: CrmTemplate[] }).templates;
      })
      .then((list) => !cancelled && setTemplates(list))
      .catch((err: Error) => !cancelled && setLoadError(err.message));
    return () => {
      cancelled = true;
    };
  }, [templatesConfigured]);

  if (!templatesConfigured) {
    return <p className="text-[12px] text-crm-dim">Para listar os modelos aprovados, configure WHATSAPP_BUSINESS_ACCOUNT_ID no servidor.</p>;
  }
  if (loadError) return <p className="text-[12px] text-crm-red">{loadError}</p>;
  if (!templates) return <p className="text-[12px] text-crm-dim">Carregando modelos...</p>;
  if (templates.length === 0) return <p className="text-[12px] text-crm-dim">Nenhum modelo aprovado ainda. Crie e envie para aprovação no WhatsApp Manager.</p>;

  const template = templates.find((t) => `${t.name}|${t.language}` === chosen) ?? null;

  return (
    <div className="space-y-2">
      <select
        value={chosen}
        onChange={(e) => {
          setChosen(e.target.value);
          const t = templates.find((x) => `${x.name}|${x.language}` === e.target.value);
          setParams(Array.from({ length: t?.bodyParamCount ?? 0 }, () => ""));
        }}
        aria-label="Modelo de mensagem"
        className={`${CRM_INPUT}`}
      >
        <option value="">Escolha um modelo aprovado</option>
        {templates.map((t) => (
          <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
            {t.name} ({t.language})
          </option>
        ))}
      </select>
      {template?.bodyText && <p className="text-[12px] text-crm-dim whitespace-pre-wrap rounded-lg bg-crm-sunken border border-crm-line px-3 py-2">{template.bodyText}</p>}
      {params.map((value, i) => (
        <input
          key={i}
          value={value}
          onChange={(e) => setParams((ps) => ps.map((p, j) => (j === i ? e.target.value : p)))}
          placeholder={`Valor para {{${i + 1}}}`}
          aria-label={`Valor para o campo ${i + 1} do modelo`}
          className={CRM_INPUT}
        />
      ))}
      <button
        type="button"
        disabled={!template || sending || params.some((p) => !p.trim())}
        onClick={async () => {
          if (!template) return;
          setSending(true);
          await onSend(template, params);
          setSending(false);
          setChosen("");
          setParams([]);
        }}
        className={CRM_BTN_PRIMARY}
      >
        {sending ? "Enviando..." : "Enviar modelo"}
      </button>
    </div>
  );
}

export default function CrmContactPanel({
  contactId,
  team,
  quickReplies,
  onQuickRepliesChange,
  whatsappConfigured,
  templatesConfigured,
  onClose,
  onChanged,
  onWon,
  initialDealId = null,
  initialTab = "conversa",
  currentUserId,
  embedded = false,
  caps,
  onOpenTask,
  onNewTask,
  tasksVersion = 0,
  onOpenClient,
}: CrmContactPanelProps) {
  const { label, options, tag: tagById, tagGroups, stages, stageDot } = useCatalog();
  const [newDealFromChat, setNewDealFromChat] = useState(false);
  const [busyAttendance, setBusyAttendance] = useState(false);
  const [detail, setDetail] = useState<CrmContactDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [tab, setTab] = useState<"conversa" | "negocio" | "detalhes">(initialTab);
  const [dealPick, setDealPick] = useState<string | null>(initialDealId);
  const [lostPending, setLostPending] = useState<string | null>(null);
  const [analysisOpen, setAnalysisOpen] = useState(false);
  const [stagePending, setStagePending] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [showTemplates, setShowTemplates] = useState(false);
  const [note, setNote] = useState("");
  const [form, setForm] = useState<ContactForm | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const messagesRef = useRef<HTMLDivElement | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/contacts/${contactId}/`);
    if (!res.ok) {
      setLoadError(await errorFrom(res, "Não foi possível abrir o contato."));
      return;
    }
    const { contact } = (await res.json()) as { contact: CrmContactDetail };
    setDetail(contact);
    setLoadError(null);
    setNow(Date.now());
  }, [contactId]);

  useEffect(() => {
    let cancelled = false;
    const tick = () => {
      if (!cancelled) void load();
    };
    tick();
    const timer = setInterval(tick, PANEL_REFRESH_MS);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [load, tasksVersion]);

  // Opening the panel already marked the messages as read server-side.
  useEffect(() => {
    if (detail) onChanged();
    // only once, when the contact first loads
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail?.id]);

  const messageCount = detail?.messages.length ?? 0;
  useEffect(() => {
    const el = messagesRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messageCount, tab]);

  // Escape closes the slide-over; an embedded panel is part of the page.
  useEffect(() => {
    if (embedded) return;
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, embedded]);

  async function patch(body: Record<string, unknown>) {
    const res = await fetch(`/api/crm/contacts/${contactId}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setActionError(await errorFrom(res, "Não foi possível salvar."));
      return false;
    }
    setActionError(null);
    await load();
    onChanged();
    return true;
  }

  async function send(body: Record<string, unknown>) {
    setSending(true);
    // Someone else attending: the button says "Assumir e responder", so sending takes the conversation over.
    const res = await fetch(`/api/crm/contacts/${contactId}/messages/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...body, takeover: attendedByOther }),
    });
    setSending(false);
    if (!res.ok) {
      setActionError(await errorFrom(res, "Não foi possível enviar."));
      return false;
    }
    setActionError(null);
    await load();
    onChanged();
    return true;
  }

  async function sendText(e?: FormEvent) {
    e?.preventDefault();
    if (!text.trim()) return;
    if (await send({ kind: "text", body: text })) setText("");
  }

  async function addNote(e: FormEvent) {
    e.preventDefault();
    const res = await fetch(`/api/crm/contacts/${contactId}/notes/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: note }),
    });
    if (!res.ok) return setActionError(await errorFrom(res, "Não foi possível salvar a nota."));
    setNote("");
    setActionError(null);
    await load();
  }

  /** Atendimento: assume / transfer / end. */
  async function attendance(body: Record<string, unknown>) {
    setBusyAttendance(true);
    const res = await fetch(`/api/crm/contacts/${contactId}/attendance/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    setBusyAttendance(false);
    if (!res.ok) return setActionError(await errorFrom(res, "Não foi possível mudar o atendimento."));
    setActionError(null);
    await load();
    onChanged();
  }

  async function attendanceTag(method: "POST" | "DELETE", tagId: string) {
    const res = await fetch(`/api/crm/contacts/${contactId}/tags/${method === "DELETE" ? `?tagId=${encodeURIComponent(tagId)}` : ""}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ tagId }) : undefined,
    });
    if (!res.ok) return setActionError(await errorFrom(res, "Não foi possível mudar a etiqueta."));
    setActionError(null);
    await load();
    onChanged();
  }

  const attendedByOther = Boolean(detail?.attendantId && detail.attendantId !== currentUserId);
  const windowOpen = detail ? serviceWindowRemainingMs(detail.lastInboundAt, now) > 0 : false;
  const win = detail ? windowLabel(detail.lastInboundAt, now) : null;
  const fields: ContactForm | null =
    form ??
    (detail
      ? {
          name: detail.name,
          phone: detail.phone ? formatPhone(detail.phone) : "",
          email: detail.email ?? "",
          jobTitle: detail.jobTitle ?? "",
          company: detail.company ?? "",
          segment: detail.segment ?? "",
          city: detail.city ?? "",
          source: detail.source,
          referredBy: detail.referredBy ?? "",
          consentSource: detail.consentSource ?? "",
          temperature: detail.temperature ?? "",
          serviceInterest: detail.serviceInterest ?? "",
          returnAt: detail.returnAt ?? "",
          isDecisionMaker: detail.isDecisionMaker,
        }
      : null);
  const edit = (changes: Partial<ContactForm>) => fields && setForm({ ...fields, ...changes });
  // The opportunity the header acts on: the one picked, else the first open one, else the latest.
  const deal =
    detail?.deals.find((d) => d.id === dealPick) ?? detail?.deals.find((d) => !isClosedStage(d.stage)) ?? detail?.deals[0] ?? null;
  const nextTask = detail?.tasks.find((t) => !t.doneAt) ?? null;

  async function patchDeal(body: Record<string, unknown>): Promise<boolean> {
    if (!deal) return false;
    const res = await fetch(`/api/crm/deals/${deal.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      setActionError(await errorFrom(res, "Não foi possível salvar."));
      return false;
    }
    setActionError(null);
    await load();
    onChanged();
    return true;
  }

  return (
    <>
      {!embedded && <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden="true" />}
      <aside
        role={embedded ? "region" : "dialog"}
        aria-modal={embedded ? undefined : true}
        aria-label={detail ? `Contato ${detail.name}` : "Contato"}
        className={
          embedded
            ? "h-full w-full min-h-0 bg-crm-raised text-crm-text flex flex-col"
            : "fixed inset-y-0 right-0 z-40 w-full sm:w-[540px] bg-crm-raised text-crm-text border-l border-crm-line shadow-[var(--crm-shadow-lg)] flex flex-col"
        }
      >
        {!detail ? (
          <div className="p-6 flex-1 flex flex-col">
            <button type="button" onClick={onClose} className="self-start text-[12.5px] text-crm-dim hover:text-crm-text">
              ← Fechar
            </button>
            <div className="flex-1 flex flex-col items-center justify-center text-center gap-3">
              <Mascot name={loadError ? "titanDoubt" : "titanLoading"} decorative className={`h-36 w-auto ${loadError ? "" : "animate-pulse"}`} />
              <p className={`text-[13px] ${loadError ? "text-crm-red" : "text-crm-dim"}`}>{loadError ?? "Carregando contato..."}</p>
            </div>
          </div>
        ) : (
          <>
            <header className="px-5 pt-4 pb-3 border-b border-crm-line space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <span className="h-10 w-10 shrink-0 rounded-full bg-crm-navy text-white text-[13px] font-semibold flex items-center justify-center ring-2 ring-crm-silver/60">
                    {initials(detail.name)}
                  </span>
                  <div className="min-w-0">
                    <h2 className="text-[16px] font-semibold text-crm-text truncate">{detail.name}</h2>
                    <p className="text-[12px] text-crm-dim truncate">
                      {detail.phone ? formatPhone(detail.phone) : detail.email ?? "Sem contato"}
                      {detail.company ? ` · ${detail.company}` : ""}
                    </p>
                    {(detail.tagIds.length > 0 || detail.temperature || detail.returnAt || detail.isDecisionMaker) && (
                      <p className="mt-1 flex flex-wrap items-center gap-1">
                        <TemperatureChip value={detail.temperature} />
                        {detail.isDecisionMaker && (
                          <span className="text-[10.5px] font-semibold px-1.5 py-px rounded-full bg-crm-violet/10 text-crm-violet border border-crm-violet/25">Decisor</span>
                        )}
                        {detail.returnAt && (
                          <span
                            className={`text-[10.5px] font-medium px-1.5 py-px rounded-full border ${
                              detail.returnAt < todaySp() ? "bg-crm-amber/10 text-crm-amber border-crm-amber/30" : "bg-crm-sunken text-crm-dim border-crm-line"
                            }`}
                          >
                            Retorno {brDay(detail.returnAt)}
                          </span>
                        )}
                        <TagChips ids={detail.tagIds} max={4} />
                      </p>
                    )}
                    {(detail.optedOutAt || detail.archivedAt) && (
                      <p className="mt-1 flex flex-wrap gap-1.5">
                        {detail.optedOutAt && (
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-crm-red/10 text-crm-red border border-crm-red/25">Descadastrado</span>
                        )}
                        {detail.archivedAt && (
                          <span className="text-[10.5px] font-semibold px-2 py-0.5 rounded-full bg-crm-sunken text-crm-dim border border-crm-line">Arquivado</span>
                        )}
                      </p>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setAnalysisOpen(true)}
                  aria-label="Resumo do lead"
                  title="Resumo do lead: dados, cálculos e leitura da IA"
                  className="shrink-0 text-[11.5px] font-semibold px-2.5 py-1 rounded-full border border-crm-violet/40 text-crm-violet hover:bg-crm-violet/[0.06]"
                >
                  Resumo
                </button>
                <button type="button" onClick={onClose} aria-label="Fechar painel" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
                  ×
                </button>
              </div>
              {analysisOpen && <CrmAnalysisDialog request={{ kind: "lead", contactId }} onClose={() => setAnalysisOpen(false)} />}
              {deal ? (
                <div className="rounded-xl border border-crm-line bg-crm-sunken p-2.5 space-y-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className={`h-2.5 w-2.5 rounded-full shrink-0 ${stageDot(deal.stage)}`} aria-hidden="true" />
                    {detail.deals.length > 1 ? (
                      <select
                        value={deal.id}
                        onChange={(e) => setDealPick(e.target.value)}
                        aria-label="Oportunidade"
                        className="min-w-0 flex-1 bg-transparent text-[13px] font-semibold text-crm-text focus:outline-none truncate"
                      >
                        {detail.deals.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.title} · {stageLabel(d.stage)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <span className="min-w-0 flex-1 text-[13px] font-semibold truncate">{deal.title}</span>
                    )}
                    <span className="text-[13px] font-semibold tabular-nums" title={deal.negotiatedCents !== null ? "Valor negociado" : "Valor estimado"}>
                      {formatBRL(deal.negotiatedCents ?? deal.valueCents) || <span className="text-crm-faint font-normal">sem valor</span>}
                    </span>
                  </div>
                  {(deal.service || deal.temperature !== detail.temperature || (deal.negotiatedCents !== null && deal.valueCents !== null)) && (
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11.5px] text-crm-dim">
                      {/* the deal's own temperature, when it differs from the contact's (shown above) */}
                      {deal.temperature !== detail.temperature && <TemperatureChip value={deal.temperature} />}
                      {deal.service && <span>{label("service", deal.service)}</span>}
                      {deal.negotiatedCents !== null && deal.valueCents !== null && <span className="tabular-nums">estimado {formatBRL(deal.valueCents)}</span>}
                    </p>
                  )}
                  <div className="grid grid-cols-2 gap-2">
                    <label className="block">
                      <span className={CRM_LABEL}>Etapa</span>
                      <select
                        value={deal.stage}
                        onChange={async (e) => {
                          const stage = e.target.value;
                          if (stage === "perdido") return setLostPending(deal.id);
                          if (needsStageDialog(deal, stage)) return setStagePending(stage);
                          await patchDeal({ stage });
                        }}
                        aria-label="Etapa da oportunidade"
                        disabled={!caps.editPipeline}
                        className={`${CRM_INPUT} mt-1 !py-1.5 disabled:opacity-70`}
                      >
                        {stages(deal.stage).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="block">
                      <span className={CRM_LABEL}>Responsável</span>
                      <select
                        value={deal.ownerId ?? ""}
                        onChange={(e) => void patchDeal({ ownerId: e.target.value || null })}
                        aria-label="Responsável pela oportunidade"
                        disabled={!caps.editPipeline}
                        className={`${CRM_INPUT} mt-1 !py-1.5 disabled:opacity-70`}
                      >
                        <option value="">Sem responsável</option>
                        {(caps.assignAnyOwner ? team : team.filter((m) => m.id === currentUserId || m.id === deal.ownerId)).map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.name}
                          </option>
                        ))}
                      </select>
                    </label>
                  </div>
                  {deal.stage === "ganho" && (
                    <p className="text-[11.5px] text-crm-green">
                      {WON_RESULTS.find((r) => r.id === deal.wonResult)?.label ?? "Venda realizada"}
                      {deal.wonReason ? `: ${label("won_reason", deal.wonReason)}` : ""}
                      {deal.wonNote ? ` · ${deal.wonNote}` : ""}
                      {deal.closedByName ? <span className="text-crm-faint"> · encerrada por {deal.closedByName}</span> : null}
                    </p>
                  )}
                  {deal.stage === "perdido" && deal.lostReason && (
                    <p className={`text-[11.5px] ${deal.closeGroup === "futuro" ? "text-crm-amber" : "text-crm-red"}`}>
                      {closeGroupLabel(deal.closeGroup)}: {label("lost_reason", deal.lostReason)}
                      {deal.closeGroup === "futuro" && deal.returnOn ? ` · retomar em ${brDay(deal.returnOn)}` : ""}
                      {deal.lostNote ? ` · ${deal.lostNote}` : ""}
                      {deal.closedByName ? <span className="text-crm-faint"> · encerrada por {deal.closedByName}</span> : null}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-crm-line-strong px-3 py-2.5">
                  <span className="text-[12.5px] text-crm-dim">Sem oportunidade no funil.</span>
                  {caps.editPipeline && (
                    <button type="button" onClick={() => setTab("negocio")} className={CRM_LINK_BTN}>
                      + Criar oportunidade
                    </button>
                  )}
                </div>
              )}
              {stagePending && deal && (
                <CrmStageDialog
                  deal={deal}
                  stage={stagePending}
                  canCustomize={caps.customize}
                  onCancel={() => setStagePending(null)}
                  onConfirm={async (fields) => {
                    const stage = stagePending;
                    setStagePending(null);
                    if ((await patchDeal({ stage, ...fields })) && stage === "ganho") onWon?.(deal.title);
                  }}
                />
              )}
              {lostPending && deal && (
                <CrmLostDialog
                  dealTitle={deal.title}
                  reopening={deal.stage === "ganho"}
                  onCancel={() => setLostPending(null)}
                  onConfirm={async (fields) => {
                    setLostPending(null);
                    await patchDeal({ stage: "perdido", ...fields });
                  }}
                />
              )}
              <div className="flex flex-wrap items-center gap-2 text-[11.5px]">
                {win ? (
                  <span className="px-2.5 py-1 rounded-full bg-crm-green/10 text-crm-green border border-crm-green/25 font-medium">Janela de 24h: {win}</span>
                ) : (
                  <span className="px-2.5 py-1 rounded-full bg-crm-sunken text-crm-dim border border-crm-line">Janela de 24h fechada</span>
                )}
                {nextTask ? (
                  <button type="button" onClick={() => setTab("negocio")} className="text-crm-dim hover:text-crm-text text-left">
                    Próxima tarefa: <span className="text-crm-text">{nextTask.title}</span>{" "}
                    <span className={TASK_STATE_TONE[taskState(nextTask.dueAt, nextTask.allDay, now)]}>· {taskDueLabel(nextTask.dueAt, nextTask.allDay, now)}</span>
                  </button>
                ) : null}
                <span className="text-crm-faint">
                  Última interação: {detail.lastInteractionAt ? shortDate(detail.lastInteractionAt) : "nenhuma ainda"}
                </span>
              </div>
              <div className={`${CRM_SEGMENT_TRACK} w-fit`} role="tablist">
                {(["conversa", "negocio", "detalhes"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => {
                      setNewDealFromChat(false);
                      setTab(t);
                    }}
                    className={crmSegment(tab === t)}
                  >
                    {t === "conversa" ? "Conversa" : t === "negocio" ? "Negócio e tarefas" : "Detalhes e histórico"}
                  </button>
                ))}
              </div>
            </header>

            {actionError && (
              <div className={`mx-5 mt-3 ${CRM_ALERT}`} role="alert">
                {actionError}
              </div>
            )}

            {tab === "negocio" ? (
              <CrmDealsTasksTab
                detail={detail}
                readOnly={!caps.editPipeline}
                team={caps.assignAnyOwner ? team : team.filter((m) => m.id === currentUserId)}
                currentUserId={currentUserId}
                selectedDealId={deal?.id ?? null}
                onSelectDeal={setDealPick}
                now={now}
                onOpenTask={onOpenTask}
                startNewDeal={newDealFromChat}
                clients={onOpenClient && caps.viewClients ? { canCreate: caps.editClients, onOpen: onOpenClient } : undefined}
                onReload={async () => {
                  await load();
                  onChanged();
                }}
              />
            ) : tab === "conversa" ? (
              <>
                <section aria-label="Atendimento" className="border-b border-crm-line px-5 py-2 space-y-1.5 text-[12px]">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
                    <span className={attendedByOther ? "text-crm-amber font-medium" : "text-crm-dim"}>
                      {!detail.attendantId
                        ? "Ninguém está atendendo."
                        : `${detail.attendantId === currentUserId ? "Você está atendendo" : `${detail.attendantName} está atendendo`}${
                            detail.attendantSince ? ` desde ${dateTime(detail.attendantSince)}` : ""
                          }.`}
                    </span>
                    {caps.sendWhatsApp && detail.attendantId !== currentUserId && (
                      <button type="button" disabled={busyAttendance} onClick={() => void attendance({ action: "assume" })} className={`${CRM_LINK_BTN} !text-[12px]`}>
                        Assumir
                      </button>
                    )}
                    {caps.sendWhatsApp && (detail.attendantId === currentUserId || !detail.attendantId || caps.assignAnyOwner) && (
                      <select
                        value=""
                        disabled={busyAttendance}
                        onChange={(e) => e.target.value && void attendance({ action: "transfer", toUserId: e.target.value })}
                        aria-label="Transferir atendimento"
                        className="rounded-full border border-crm-line bg-crm-card px-2 py-0.5 text-[12px] text-crm-dim max-w-[11rem]"
                      >
                        <option value="">Transferir para…</option>
                        {team
                          .filter((m) => m.id !== detail.attendantId)
                          .map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.name}
                            </option>
                          ))}
                      </select>
                    )}
                    {caps.sendWhatsApp && detail.attendantId && (detail.attendantId === currentUserId || caps.assignAnyOwner) && (
                      <button type="button" disabled={busyAttendance} onClick={() => void attendance({ action: "end" })} className="text-[12px] text-crm-dim hover:text-crm-text">
                        Encerrar
                      </button>
                    )}
                    <span className="ml-auto flex items-center gap-3">
                      {onNewTask && caps.editPipeline && (
                        <button type="button" onClick={() => onNewTask({ contactId: detail.id, contactName: detail.name })} className={`${CRM_LINK_BTN} !text-[12px]`}>
                          + Tarefa
                        </button>
                      )}
                      {caps.editPipeline && (
                        <button
                          type="button"
                          onClick={() => {
                            setNewDealFromChat(true);
                            setTab("negocio");
                          }}
                          className={`${CRM_LINK_BTN} !text-[12px]`}
                        >
                          + Oportunidade
                        </button>
                      )}
                    </span>
                  </div>
                  {(() => {
                    const group = tagGroups.find((g) => g.id === "atendimento");
                    const mine = detail.tagIds.map((id) => tagById(id)).filter((t) => t && t.category === "atendimento");
                    const free = (group?.tags ?? []).filter((t) => !detail.tagIds.includes(t.id));
                    if (!group || (mine.length === 0 && !caps.editContacts)) return null;
                    return (
                      <div className="flex flex-wrap items-center gap-1.5" aria-label="Etiquetas de atendimento">
                        {mine.map((t) => (
                          <TagChip key={t!.id} tag={t!} small onRemove={caps.editContacts ? () => void attendanceTag("DELETE", t!.id) : undefined} />
                        ))}
                        {caps.editContacts && free.length > 0 && (
                          <select
                            value=""
                            onChange={(e) => e.target.value && void attendanceTag("POST", e.target.value)}
                            aria-label="Etiqueta de atendimento"
                            className="rounded-full border border-dashed border-crm-line bg-transparent px-2 py-0.5 text-[11px] text-crm-dim"
                          >
                            <option value="">+ Etiqueta</option>
                            {free.map((t) => (
                              <option key={t.id} value={t.id}>
                                {t.label}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    );
                  })()}
                </section>
                <div ref={messagesRef} className="flex-1 overflow-y-auto bg-crm-sunken px-5 py-4 space-y-2.5">
                  {detail.messages.length === 0 ? (
                    <div className="h-full flex flex-col items-center justify-center text-center gap-3 py-6">
                      <Mascot name="legacyDoubt" decorative className="h-32 w-auto" />
                      <p className="text-[12.5px] text-crm-dim max-w-xs">
                        Nenhuma mensagem ainda. O primeiro contato precisa ser um modelo aprovado: use &quot;Enviar modelo&quot; abaixo.
                      </p>
                    </div>
                  ) : (
                    detail.messages.map((m) => <MessageBubble key={m.id} message={m} />)
                  )}
                </div>
                <div className="border-t border-crm-line px-5 py-3 space-y-2.5">
                  {!caps.sendWhatsApp ? (
                    <p className="text-[12px] text-crm-dim">Seu perfil acompanha as conversas, mas não envia mensagens pelo CRM.</p>
                  ) : !detail.phone ? (
                    <p className="text-[12px] text-crm-dim">
                      Este contato não tem WhatsApp cadastrado. Adicione o número em <strong>Detalhes e histórico</strong> para conversar por aqui.
                    </p>
                  ) : !whatsappConfigured ? (
                    <p className="text-[12px] text-crm-dim">O WhatsApp ainda não está conectado — enviar mensagens começa quando o número for ligado ao CRM.</p>
                  ) : windowOpen && !showTemplates ? (
                    <form onSubmit={sendText} className="space-y-2">
                      <textarea
                        value={text}
                        onChange={(e) => setText(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) void sendText();
                        }}
                        rows={3}
                        placeholder="Escreva a resposta (Ctrl+Enter envia)"
                        aria-label="Mensagem"
                        className={CRM_INPUT}
                      />
                      {attendedByOther && (
                        <p className="text-[11.5px] text-crm-amber">
                          {detail.attendantName} está atendendo esta conversa. Ao enviar, você assume o atendimento (fica no histórico).
                        </p>
                      )}
                      <div className="flex flex-wrap items-center gap-2">
                        <QuickReplies quickReplies={quickReplies} onPick={(b) => setText((t) => (t ? `${t}\n${b}` : b))} onChange={onQuickRepliesChange} />
                        <button
                          type="button"
                          onClick={() => setShowTemplates(true)}
                          className={CRM_BTN_OUTLINE}
                        >
                          Enviar modelo
                        </button>
                        <button
                          type="submit"
                          disabled={sending || !text.trim()}
                          className={`ml-auto ${CRM_BTN_PRIMARY}`}
                        >
                          {sending ? "Enviando..." : attendedByOther ? "Assumir e responder" : "Enviar"}
                        </button>
                      </div>
                    </form>
                  ) : (
                    <div className="space-y-2">
                      {!windowOpen && (
                        <p className="text-[12px] font-medium text-crm-amber">
                          A janela de 24h está fechada: para falar com este contato, envie um modelo aprovado (cobrado por mensagem).
                        </p>
                      )}
                      <TemplatePicker
                        templatesConfigured={templatesConfigured}
                        onSend={async (t, params) => {
                          if (await send({ kind: "template", name: t.name, language: t.language, params })) setShowTemplates(false);
                        }}
                      />
                      {windowOpen && (
                        <button type="button" onClick={() => setShowTemplates(false)} className="text-[12px] text-crm-dim hover:text-crm-text">
                          ← Voltar para mensagem livre
                        </button>
                      )}
                    </div>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
                <CrmTagsEditor
                  links={detail.tagLinks}
                  endpoint={`/api/crm/contacts/${detail.id}/tags/`}
                  canEdit={caps.editContacts}
                  onChanged={() => {
                    void load();
                    onChanged();
                  }}
                />
                {fields && (
                  <section className="space-y-2">
                    <h3 className={CRM_LABEL}>Dados do contato</h3>
                    <input value={fields.name} onChange={(e) => edit({ name: e.target.value })} aria-label="Nome" placeholder="Nome" className={CRM_INPUT} />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <input value={fields.phone} onChange={(e) => edit({ phone: e.target.value })} inputMode="tel" aria-label="WhatsApp" placeholder="WhatsApp" className={CRM_INPUT} />
                      <input value={fields.email} onChange={(e) => edit({ email: e.target.value })} type="email" aria-label="E-mail" placeholder="E-mail" className={CRM_INPUT} />
                      <CrmCompanyField value={fields.company} onChange={(v) => edit({ company: v })} ariaLabel="Empresa" placeholder="Empresa" />
                      <input value={fields.jobTitle} onChange={(e) => edit({ jobTitle: e.target.value })} aria-label="Cargo" placeholder="Cargo" className={CRM_INPUT} />
                      <SegmentSelect value={fields.segment} onChange={(v) => edit({ segment: v })} className={CRM_INPUT} emptyLabel={detail.companyId ? "Segmento (da empresa)" : "Sem segmento"} />
                      <input value={fields.city} onChange={(e) => edit({ city: e.target.value })} aria-label="Cidade" placeholder={detail.companyId ? "Cidade (da empresa)" : "Cidade"} className={CRM_INPUT} />
                      <select value={fields.source} onChange={(e) => edit({ source: e.target.value })} aria-label="Origem" className={CRM_INPUT}>
                        {options("source", detail.source).map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <input value={fields.referredBy} onChange={(e) => edit({ referredBy: e.target.value })} aria-label="Indicado por" placeholder="Indicado por (ex.: Carlos, BNI)" className={CRM_INPUT} />
                      <TemperatureSelect value={fields.temperature} onChange={(v) => edit({ temperature: v })} className={CRM_INPUT} />
                      <ServiceSelect
                        value={fields.serviceInterest}
                        onChange={(v) => edit({ serviceInterest: v })}
                        label="Serviço de interesse"
                        emptyLabel="Serviço de interesse"
                        className={CRM_INPUT}
                      />
                      <label className="block">
                        <span className={CRM_LABEL}>Retorno previsto</span>
                        <input type="date" value={fields.returnAt} onChange={(e) => edit({ returnAt: e.target.value })} aria-label="Retorno previsto" className={`${CRM_INPUT} mt-1`} />
                      </label>
                      <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-crm-text">
                        <input
                          type="checkbox"
                          checked={fields.isDecisionMaker}
                          onChange={(e) => edit({ isDecisionMaker: e.target.checked })}
                          className="h-4 w-4 accent-[var(--crm-accent)]"
                        />
                        Decisor na empresa
                      </label>
                    </div>
                    {detail.companyId && <p className="text-[11.5px] text-crm-faint">Segmento e cidade ficam na empresa e valem para todos os contatos dela.</p>}
                    <button
                      type="button"
                      disabled={!form}
                      onClick={async () => {
                        if (form && (await patch(form))) setForm(null);
                      }}
                      className={CRM_LINK_BTN}
                    >
                      Salvar dados
                    </button>
                  </section>
                )}

                {fields && (
                  <section className="space-y-2">
                    <h3 className={CRM_LABEL}>Consentimento e situação</h3>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      <select
                        value={detail.consentStatus}
                        onChange={(e) => void patch({ consentStatus: e.target.value })}
                        aria-label="Consentimento"
                        className={CRM_INPUT}
                      >
                        {CRM_CONSENT.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.label}
                          </option>
                        ))}
                      </select>
                      <input
                        value={fields.consentSource}
                        onChange={(e) => edit({ consentSource: e.target.value })}
                        aria-label="Como aceitou ser contatado"
                        placeholder="Como aceitou (ex.: formulário do site)"
                        className={CRM_INPUT}
                      />
                    </div>
                    {detail.consentAt && detail.consentStatus === "sim" && (
                      <p className="text-[11.5px] text-crm-faint">Registrado em {shortDate(detail.consentAt)}.</p>
                    )}
                    <div className="flex flex-wrap items-center gap-2 pt-1">
                      {detail.optedOutAt ? (
                        <>
                          <span className="text-[12px] text-crm-red">Descadastrado em {shortDate(detail.optedOutAt)}: não recebe campanhas.</span>
                          <button type="button" onClick={() => void patch({ optedOut: false })} className={CRM_BTN_OUTLINE}>
                            Remover descadastro
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => void patch({ optedOut: true })} className={CRM_BTN_OUTLINE}>
                          Marcar descadastro
                        </button>
                      )}
                      {!caps.archiveContacts ? null : detail.archivedAt ? (
                        <button type="button" onClick={() => void patch({ archived: false })} className={CRM_BTN_OUTLINE}>
                          Restaurar contato
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm(`Arquivar ${detail.name}? Ele sai do funil, mas nada é apagado e dá para restaurar em Contatos → Arquivados.`)) {
                              if (await patch({ archived: true })) onClose();
                            }
                          }}
                          className={`${CRM_BTN_OUTLINE} hover:!text-crm-red hover:!border-crm-red/40`}
                        >
                          Arquivar contato
                        </button>
                      )}
                    </div>
                  </section>
                )}

                {detail.adReferral && (
                  <section className="space-y-1">
                    <h3 className={CRM_LABEL}>Veio de um anúncio</h3>
                    {detail.adReferral.headline && <p className="text-[13px] text-crm-text">{detail.adReferral.headline}</p>}
                    <p className="text-[12px] text-crm-dim">
                      {detail.adReferral.sourceId ? `ID do anúncio: ${detail.adReferral.sourceId}` : "ID do anúncio não informado"}
                      {detail.adReferral.sourceUrl && /^https?:\/\//i.test(detail.adReferral.sourceUrl) && (
                        <>
                          {" · "}
                          <a href={detail.adReferral.sourceUrl} target="_blank" rel="noreferrer" className="text-crm-accent underline">
                            ver anúncio
                          </a>
                        </>
                      )}
                    </p>
                  </section>
                )}

                <section className="space-y-2">
                  <h3 className={CRM_LABEL}>Notas e histórico</h3>
                  <form onSubmit={addNote} className="space-y-2">
                    <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={2} placeholder="Nota interna (só a equipe vê)" aria-label="Nova nota" className={CRM_INPUT} />
                    <button type="submit" disabled={!note.trim()} className={CRM_LINK_BTN}>
                      Adicionar nota
                    </button>
                  </form>
                  <ol className="space-y-2.5 pt-1">
                    {[...detail.events].reverse().map((e) => (
                      <li key={e.id} className={e.kind === "note" ? "rounded-lg border border-crm-amber/30 bg-crm-amber/[0.08] px-3 py-2" : "px-1"}>
                        <p className={`text-[12.5px] whitespace-pre-wrap break-words ${e.kind === "note" ? "text-crm-text" : "text-crm-dim"}`}>{describeEvent(e, label)}</p>
                        <p className="text-[10.5px] text-crm-dim mt-0.5">
                          {e.userName ?? "Sistema"} · {dateTime(e.createdAt)}
                        </p>
                      </li>
                    ))}
                  </ol>
                </section>
              </div>
            )}
          </>
        )}
      </aside>
    </>
  );
}
