// Types and constants shared by the CRM's server code (crm.ts, the /api/crm
// routes) and its client components — nothing here touches process.env or
// the database, so it's safe to import from either side.

export const CRM_STAGES = [
  { id: "novo", label: "Novo" },
  { id: "conversa", label: "Em conversa" },
  { id: "reuniao", label: "Reunião agendada" },
  { id: "proposta", label: "Proposta enviada" },
  { id: "ganho", label: "Ganho" },
  { id: "perdido", label: "Perdido" },
] as const;

export type CrmStage = (typeof CRM_STAGES)[number]["id"];

export function isCrmStage(value: unknown): value is CrmStage {
  return CRM_STAGES.some((s) => s.id === value);
}

export const CRM_SOURCES = [
  { id: "anuncio", label: "Anúncio" },
  { id: "bni", label: "BNI" },
  { id: "site", label: "Site" },
  { id: "evento", label: "Evento" },
  { id: "indicacao", label: "Indicação" },
  { id: "outro", label: "Outro" },
] as const;

export type CrmSource = (typeof CRM_SOURCES)[number]["id"];

export function isCrmSource(value: unknown): value is CrmSource {
  return CRM_SOURCES.some((s) => s.id === value);
}

export function stageLabel(id: string): string {
  return CRM_STAGES.find((s) => s.id === id)?.label ?? id;
}

export function sourceLabel(id: string): string {
  return CRM_SOURCES.find((s) => s.id === id)?.label ?? id;
}

/** Kinds of task/activity a salesperson schedules or logs. */
export const CRM_TASK_KINDS = [
  { id: "ligacao", label: "Ligação" },
  { id: "reuniao", label: "Reunião" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "E-mail" },
  { id: "tarefa", label: "Tarefa" },
] as const;

export type CrmTaskKind = (typeof CRM_TASK_KINDS)[number]["id"];

export function isCrmTaskKind(value: unknown): value is CrmTaskKind {
  return CRM_TASK_KINDS.some((k) => k.id === value);
}

export function taskKindLabel(id: string): string {
  return CRM_TASK_KINDS.find((k) => k.id === id)?.label ?? id;
}

/** Asked when an opportunity moves to "Perdido" — feeds the loss analysis. */
export const CRM_LOST_REASONS = [
  { id: "sem_orcamento", label: "Sem orçamento" },
  { id: "concorrente", label: "Escolheu outra empresa" },
  { id: "sem_resposta", label: "Parou de responder" },
  { id: "sem_perfil", label: "Sem perfil para o serviço" },
  { id: "adiou", label: "Adiou o projeto" },
  { id: "outro", label: "Outro motivo" },
] as const;

export type CrmLostReason = (typeof CRM_LOST_REASONS)[number]["id"];

export function isCrmLostReason(value: unknown): value is CrmLostReason {
  return CRM_LOST_REASONS.some((r) => r.id === value);
}

export function lostReasonLabel(id: string | null): string {
  return CRM_LOST_REASONS.find((r) => r.id === id)?.label ?? "";
}

export function isClosedStage(stage: string): boolean {
  return stage === "ganho" || stage === "perdido";
}

/** Whether the lead agreed to be contacted. "descadastrado" is derived from opted_out_at, never stored here. */
export const CRM_CONSENT = [
  { id: "sim", label: "Aceitou contato" },
  { id: "nao_informado", label: "Não informado" },
] as const;

export type CrmConsentStatus = (typeof CRM_CONSENT)[number]["id"];

export function isCrmConsentStatus(value: unknown): value is CrmConsentStatus {
  return CRM_CONSENT.some((c) => c.id === value);
}

/**
 * Dedupe key for company names: "Clínica Ribeiro LTDA." and "  clinica
 * ribeiro " are the same company. Accents, case, punctuation, extra spaces
 * and the usual legal suffixes are ignored.
 */
export function companyKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/\s(ltda|me|epp|eireli|s a|sa|s s|ss)$/, "")
    .trim();
}

/** Light e-mail sanity check — the real proof is a reply. */
export function isPlausibleEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
}

/** What a Click-to-WhatsApp ad hands over in the first inbound message's `referral` object. */
export type CrmAdReferral = {
  sourceId: string | null;
  sourceType: string | null;
  sourceUrl: string | null;
  headline: string | null;
  body: string | null;
  ctwaClid: string | null;
};

export type CrmContactCard = {
  id: string;
  /** null for a lead imported/created with only an e-mail. */
  phone: string | null;
  name: string;
  email: string | null;
  jobTitle: string | null;
  companyId: string | null;
  company: string | null;
  /** The company's segment/city when linked, else the contact's own. */
  segment: string | null;
  city: string | null;
  source: CrmSource;
  referredBy: string | null;
  stage: CrmStage;
  ownerId: string | null;
  ownerName: string | null;
  nextAction: string | null;
  nextActionAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  lastInboundAt: string | null;
  unreadCount: number;
  hasAdReferral: boolean;
  /** When the card last changed stage — "won this month" counts use it. */
  stageChangedAt: string;
  consentStatus: CrmConsentStatus;
  /** Set when the lead asked not to be contacted — campaigns must skip them. */
  optedOutAt: string | null;
  archivedAt: string | null;
  createdAt: string;
};

/** A WhatsApp conversation in the Conversas list: the contact plus the funnel stages of its opportunities (the "tags"). */
export type CrmConversation = CrmContactCard & { dealStages: CrmStage[] };

export type CrmMessage = {
  id: string;
  direction: "in" | "out";
  type: string;
  body: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  templateName: string | null;
  status: string | null;
  error: string | null;
  sentByName: string | null;
  /** Set when the message went out as part of a campaign (Fase 5). */
  campaignName: string | null;
  createdAt: string;
};

export type CrmEventKind =
  | "created"
  | "stage"
  | "owner"
  | "next_action"
  | "note"
  | "edited"
  | "consent"
  | "opt_out"
  | "archived"
  | "restored"
  | "deal"
  | "task";

export type CrmEvent = {
  id: string;
  kind: CrmEventKind;
  payload: Record<string, unknown>;
  userName: string | null;
  createdAt: string;
};

/** An opportunity (negócio) as stored — one contact may have several over time. */
export type CrmDeal = {
  id: string;
  contactId: string;
  title: string;
  /** Centavos; null = not estimated yet. */
  valueCents: number | null;
  stage: CrmStage;
  ownerId: string | null;
  ownerName: string | null;
  expectedCloseAt: string | null;
  lostReason: CrmLostReason | null;
  lostNote: string | null;
  stageChangedAt: string;
  closedAt: string | null;
  createdAt: string;
};

export type CrmTaskSummary = { id: string; kind: CrmTaskKind; title: string; dueAt: string | null; allDay: boolean };

/** One card on the funnel: the opportunity plus what the board shows of its contact. */
export type CrmDealCard = CrmDeal & {
  contactName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  source: CrmSource;
  referredBy: string | null;
  hasAdReferral: boolean;
  unreadCount: number;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  /** Earliest pending task for this opportunity (or for its contact with no opportunity set). */
  nextTask: CrmTaskSummary | null;
};

export type CrmTask = CrmTaskSummary & {
  contactId: string;
  contactName: string;
  company: string | null;
  dealId: string | null;
  dealTitle: string | null;
  ownerId: string | null;
  ownerName: string | null;
  doneAt: string | null;
  doneByName: string | null;
  result: string | null;
  canceledAt: string | null;
  createdAt: string;
  createdByName: string | null;
};

export type CrmContactDetail = CrmContactCard & {
  consentSource: string | null;
  consentAt: string | null;
  adReferral: CrmAdReferral | null;
  messages: CrmMessage[];
  events: CrmEvent[];
  /** Open ones first, then the closed ones, newest first. */
  deals: CrmDeal[];
  /** Pending tasks (soonest first) and the latest finished ones. */
  tasks: CrmTask[];
};

/** "R$ 1.500,50" / "1500.5" / 1500.5 → centavos. Empty → null. Throws a pt-BR message on garbage. */
export function parseMoneyToCents(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  let n: number;
  if (typeof value === "number") n = value;
  else if (typeof value === "string") {
    const raw = value.replace(/[R$\s]/g, "");
    if (!raw) return null;
    // pt-BR: "1.500,50" → 1500.50 and "2.000" → 2000 (dots as thousands);
    // a plain "1500.50" is also accepted.
    const normalized = raw.includes(",")
      ? raw.replace(/\./g, "").replace(",", ".")
      : /^\d{1,3}(\.\d{3})+$/.test(raw)
        ? raw.replace(/\./g, "")
        : raw;
    n = Number(normalized);
  } else throw new Error("Valor inválido.");
  if (!Number.isFinite(n) || n < 0 || n > 1e10) throw new Error("Valor inválido.");
  return Math.round(n * 100);
}

export function formatBRL(cents: number | null, opts: { compact?: boolean } = {}): string {
  if (cents === null) return "";
  const reais = cents / 100;
  if (opts.compact && reais >= 1000) {
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", notation: "compact", minimumFractionDigits: 0, maximumFractionDigits: 1 }).format(reais);
  }
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: reais % 1 ? 2 : 0 }).format(reais);
}

export type CrmCompanyRow = {
  id: string;
  name: string;
  segment: string | null;
  city: string | null;
  website: string | null;
  notes: string | null;
  contactCount: number;
  /** Contacts still in the funnel (not won/lost/archived). */
  openCount: number;
  wonCount: number;
  lastActivityAt: string | null;
  createdAt: string;
};

export type CrmCompanyDetail = CrmCompanyRow & { contacts: CrmContactCard[] };

export type CrmPage<T> = { rows: T[]; total: number; page: number; pageSize: number };

/** Values offered in the segment/city filters — whatever the team has typed so far. */
export type CrmFacets = { segments: string[]; cities: string[] };

/** Fields a spreadsheet column can be mapped to on import. */
export const CRM_IMPORT_FIELDS = [
  { id: "name", label: "Nome", required: true },
  { id: "phone", label: "WhatsApp / telefone" },
  { id: "email", label: "E-mail" },
  { id: "company", label: "Empresa" },
  { id: "jobTitle", label: "Cargo" },
  { id: "segment", label: "Segmento" },
  { id: "city", label: "Cidade" },
  { id: "source", label: "Origem" },
  { id: "referredBy", label: "Indicado por" },
  { id: "consent", label: "Consentimento (sim/não)" },
  { id: "consentSource", label: "Como aceitou ser contatado" },
  { id: "notes", label: "Observações" },
] as const;

export type CrmImportField = (typeof CRM_IMPORT_FIELDS)[number]["id"];

/** One spreadsheet line after the column mapping; `line` is the row number as the user sees it in Excel. */
export type CrmImportRow = { line: number } & Partial<Record<CrmImportField, string>>;

export type CrmImportDefaults = {
  source?: string;
  ownerId?: string | null;
  consentStatus?: string;
  consentSource?: string;
  /** Open an opportunity in "Novo" for each imported contact (default true). */
  createDeals?: boolean;
};

export type CrmImportRowResult = {
  line: number;
  name: string | null;
  status: "novo" | "duplicado" | "erro";
  message: string | null;
};

export type CrmImportPreview = {
  results: CrmImportRowResult[];
  counts: { novo: number; duplicado: number; erro: number };
  newCompanies: number;
};

export const CRM_IMPORT_MAX_ROWS = 5000;

export type CrmImportSummary = {
  id: string;
  fileName: string;
  createdByName: string;
  createdAt: string;
  rowCount: number;
  createdCount: number;
  skippedCount: number;
  errorCount: number;
  undoneAt: string | null;
};

export type CrmTeamMember = { id: string; name: string };

/** Numbers of one period on the Painel (Fase 4). */
export type CrmDashboardMetrics = {
  newLeads: number;
  newDeals: number;
  /** Opportunities that entered "Reunião agendada" / "Proposta enviada" in the period. */
  meetings: number;
  proposals: number;
  wonCount: number;
  wonValueCents: number;
  lostCount: number;
  lostValueCents: number;
  /** won / (won + lost); null with nothing closed. */
  conversion: number | null;
  /** Mean value of the won opportunities that have a value. */
  avgTicketCents: number | null;
  /** Mean days from opening to winning. */
  avgCycleDays: number | null;
  tasksDone: number;
};

export type CrmDashboard = {
  /** Inclusive Brasília dates (YYYY-MM-DD). */
  from: string;
  to: string;
  previousFrom: string;
  previousTo: string;
  current: CrmDashboardMetrics;
  previous: CrmDashboardMetrics;
  /** Right now, whatever the period. */
  openNow: { count: number; valueCents: number };
  tasksNow: { overdue: number; today: number };
  /** Open opportunities per stage now, plus won/lost in the period. */
  funnel: { stage: CrmStage; count: number; valueCents: number }[];
  bucket: "week" | "month";
  series: { start: string; label: string; newLeads: number; won: number }[];
  lossReasons: { reason: CrmLostReason | "sem_motivo"; count: number; valueCents: number }[];
  sources: { source: CrmSource; newLeads: number; won: number; wonValueCents: number }[];
  team: {
    ownerId: string | null;
    name: string;
    openCount: number;
    openValueCents: number;
    wonCount: number;
    wonValueCents: number;
    lostCount: number;
    conversion: number | null;
    tasksDone: number;
    tasksOverdue: number;
    lastActivityAt: string | null;
  }[];
};

export type CrmQuickReply = { id: string; title: string; body: string };

export type CrmTemplate = {
  name: string;
  language: string;
  category: string;
  bodyText: string | null;
  /** How many {{1}}, {{2}}, … placeholders the body has — the CRM asks for that many values before sending. */
  bodyParamCount: number;
};

// WhatsApp only lets a business send free-form messages within 24h of the
// contact's own last message; after that, only an approved template.
export const SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

/** Milliseconds left in the 24h window, or 0 when it's closed (or was never opened). */
export function serviceWindowRemainingMs(lastInboundAt: string | null, now: number = Date.now()): number {
  if (!lastInboundAt) return 0;
  return Math.max(0, Date.parse(lastInboundAt) + SERVICE_WINDOW_MS - now);
}

/**
 * Digits only, with country code — WhatsApp's own wa_id shape. A Brazilian
 * number typed without the country code (10 or 11 digits, e.g. "(15)
 * 99999-9999") gets 55 prepended; anything else is kept as typed.
 */
export function normalizePhone(raw: string): string {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 || digits.length === 11) return `55${digits}`;
  return digits;
}

/**
 * Brazilian mobiles may come from WhatsApp with or without the extra 9
 * after the area code (a quirk of numbers registered before the 9th digit
 * rollout) — "5515999998888" and "551599998888" are the same person. Both
 * spellings are tried before treating an inbound message as a new contact.
 */
export function phoneVariants(phone: string): string[] {
  const variants = [phone];
  if (phone.startsWith("55")) {
    if (phone.length === 13 && phone[4] === "9") variants.push(phone.slice(0, 4) + phone.slice(5));
    if (phone.length === 12) variants.push(`${phone.slice(0, 4)}9${phone.slice(4)}`);
  }
  return variants;
}

export function formatPhone(phone: string): string {
  if (phone.startsWith("55") && (phone.length === 12 || phone.length === 13)) {
    const ddd = phone.slice(2, 4);
    const rest = phone.slice(4);
    return `+55 (${ddd}) ${rest.slice(0, rest.length - 4)}-${rest.slice(-4)}`;
  }
  return `+${phone}`;
}
