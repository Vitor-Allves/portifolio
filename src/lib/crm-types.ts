// Types and constants shared by the CRM's server code (crm.ts, the /api/crm
// routes) and its client components — nothing here touches process.env or
// the database, so it's safe to import from either side.

import { DEFAULT_OPTIONS, stageMeta, type CrmCatalog } from "./crm-catalog";

/**
 * The funnel's stages as shipped (evolução v1.0, v21). The real list — names,
 * order, probability, stages added or archived by the Administrador — lives
 * in Personalização (crm_options kind "stage"); screens read it from the
 * catalog and the server validates against it.
 */
export const CRM_STAGES: readonly { id: string; label: string }[] = DEFAULT_OPTIONS.stage.map((s) => ({ id: s.id, label: s.label }));

/** A stage code (any stage on the list, including ones the Administrador created). */
export type CrmStage = string;

/** Shape of a stage code; whether it is on the list is checked against the catalog. */
export function isCrmStage(value: unknown): value is CrmStage {
  return typeof value === "string" && /^[a-z0-9_]{1,40}$/.test(value);
}

/** Labels the screens learned from the catalog (client only — the server passes the catalog). */
const stageNames = new Map<string, string>(CRM_STAGES.map((s) => [s.id, s.label]));
export function registerStageLabels(list: { id: string; label: string }[]): void {
  for (const s of list) stageNames.set(s.id, s.label);
}

/** The funnel's stages in order (active ones; `keep` adds the records' archived stages), with probability and kind. */
export function stagesOf(
  catalog: CrmCatalog,
  keep?: string | readonly string[] | null
): { id: string; label: string; probability: number; outcome: "open" | "won" | "lost"; archived: boolean }[] {
  const kept = new Set(typeof keep === "string" ? [keep] : (keep ?? []));
  const list = catalog.options.filter((o) => o.kind === "stage").sort((a, b) => a.sort - b.sort);
  const src = list.length ? list : CRM_STAGES.map((s, i) => ({ ...s, kind: "stage" as const, sort: i, archived: false, meta: DEFAULT_OPTIONS.stage[i].meta ?? {} }));
  return src
    .filter((o) => !o.archived || kept.has(o.id))
    .map((o) => ({ id: o.id, label: o.label, archived: o.archived, ...stageMeta(o) }));
}

// Origens, tipos de tarefa e motivos de perda moved to the database in v9
// (Personalização do CRM): defaults in crm-catalog.ts, reads/writes in
// crm-options.ts. Records keep the option's code (id); labels come from the
// catalog.
export type CrmSource = string;
export type CrmTaskKind = string;
export type CrmLostReason = string;

export function stageLabel(id: string, catalog?: CrmCatalog | null): string {
  const fromCatalog = catalog?.options.find((o) => o.kind === "stage" && o.id === id)?.label;
  return fromCatalog ?? stageNames.get(id) ?? id;
}

export function isClosedStage(stage: string): boolean {
  return stage === "ganho" || stage === "perdido";
}

/**
 * Exigência que cresce com a etapa: the first registration stays quick, and
 * the funnel asks for more as the negotiation advances. The server enforces
 * it on every move made by a person (automatic moves only go to "Primeiro
 * contato"); the screens use the same list to ask before moving. Stages the
 * Administrador creates ask for nothing extra.
 */
export const STAGE_REQUIREMENTS: Partial<Record<CrmStage, readonly CrmStageRequirement[]>> = {
  elaboracao: ["service"],
  proposta: ["service", "value"],
  negociacao: ["service", "value"],
  aprovacao: ["service", "value"],
  ganho: ["service", "negotiated", "wonReason"],
};
export type CrmStageRequirement = "service" | "value" | "negotiated" | "wonReason";
export const STAGE_REQUIREMENT_LABEL: Record<CrmStageRequirement, string> = {
  service: "serviço",
  value: "valor estimado",
  negotiated: "valor negociado",
  wonReason: "motivo do ganho",
};
export function missingForStage(
  stage: string,
  deal: { service: string | null; valueCents: number | null; negotiatedCents: number | null; wonReason: string | null }
): CrmStageRequirement[] {
  const has: Record<CrmStageRequirement, boolean> = {
    service: Boolean(deal.service),
    value: deal.valueCents !== null,
    negotiated: deal.negotiatedCents !== null,
    wonReason: Boolean(deal.wonReason),
  };
  return (STAGE_REQUIREMENTS[stage as CrmStage] ?? []).filter((r) => !has[r]);
}
/** "serviço, valor estimado e motivo do ganho" */
export function joinPt(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} e ${items[items.length - 1]}`;
}

/** Situação de uma tarefa (fixed list; done_at / canceled_at keep when and who). */
export const CRM_TASK_STATUSES = [
  { id: "pendente", label: "Pendente" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "concluida", label: "Concluída" },
  { id: "cancelada", label: "Cancelada" },
] as const;
export type CrmTaskStatus = (typeof CRM_TASK_STATUSES)[number]["id"];
export function isCrmTaskStatus(value: unknown): value is CrmTaskStatus {
  return CRM_TASK_STATUSES.some((t) => t.id === value);
}
export function taskStatusLabel(id: string): string {
  return CRM_TASK_STATUSES.find((t) => t.id === id)?.label ?? id;
}

/**
 * In-app reminder, in minutes before the task. A task with a time: at the
 * time, 15 min, 1 h or 1 day before; an all-day task: 08:00 that day or the
 * day before (Brasília).
 */
export const TASK_REMINDERS_TIMED = [
  { minutes: 0, label: "Na hora" },
  { minutes: 15, label: "15 minutos antes" },
  { minutes: 60, label: "1 hora antes" },
  { minutes: 1440, label: "1 dia antes" },
] as const;
export const TASK_REMINDERS_ALL_DAY = [
  { minutes: 0, label: "No dia, às 8h" },
  { minutes: 1440, label: "Na véspera, às 8h" },
] as const;
export function reminderLabel(minutes: number | null, allDay: boolean): string {
  if (minutes === null) return "Sem lembrete";
  const list: readonly { minutes: number; label: string }[] = allDay ? TASK_REMINDERS_ALL_DAY : TASK_REMINDERS_TIMED;
  return list.find((r) => r.minutes === minutes)?.label ?? `${minutes} min antes`;
}

/** Temperatura do lead/oportunidade — a field, not a tag (fixed list). */
export const CRM_TEMPERATURES = [
  { id: "frio", label: "Frio" },
  { id: "morno", label: "Morno" },
  { id: "quente", label: "Quente" },
] as const;
export type CrmTemperature = (typeof CRM_TEMPERATURES)[number]["id"];
export function isCrmTemperature(value: unknown): value is CrmTemperature {
  return CRM_TEMPERATURES.some((t) => t.id === value);
}
export function temperatureLabel(id: string | null | undefined): string {
  return CRM_TEMPERATURES.find((t) => t.id === id)?.label ?? "";
}

/** Situação comercial da empresa. */
export const CRM_COMPANY_STATUSES = [
  { id: "prospeccao", label: "Prospecção" },
  { id: "negociacao", label: "Em negociação" },
  { id: "cliente_ativo", label: "Cliente ativo" },
  { id: "ex_cliente", label: "Ex-cliente" },
  { id: "inativa", label: "Inativa" },
] as const;
export type CrmCompanyStatus = (typeof CRM_COMPANY_STATUSES)[number]["id"];
export function isCrmCompanyStatus(value: unknown): value is CrmCompanyStatus {
  return CRM_COMPANY_STATUSES.some((t) => t.id === value);
}
export function companyStatusLabel(id: string | null | undefined): string {
  return CRM_COMPANY_STATUSES.find((t) => t.id === id)?.label ?? "";
}

export const BR_STATES = [
  "AC", "AL", "AP", "AM", "BA", "CE", "DF", "ES", "GO", "MA", "MT", "MS", "MG", "PA",
  "PB", "PR", "PE", "PI", "RJ", "RN", "RS", "RO", "RR", "SC", "SP", "SE", "TO",
] as const;

/**
 * CNPJ → 14 characters without punctuation, upper case; null when it isn't a
 * valid CNPJ. Accepts the alphanumeric CNPJ (from July 2026): the first 12
 * characters may be letters, each worth its ASCII code minus 48, and the two
 * check digits stay numeric (mod 11, weights 2–9 from the right).
 */
export function normalizeCnpj(raw: string): string | null {
  const v = raw.replace(/[\s./-]/g, "").toUpperCase();
  if (!/^[0-9A-Z]{12}[0-9]{2}$/.test(v)) return null;
  if (/^(.)\1{13}$/.test(v)) return null;
  const digit = (base: string) => {
    let sum = 0;
    for (let i = 0; i < base.length; i++) sum += (base.charCodeAt(base.length - 1 - i) - 48) * (2 + (i % 8));
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  const d1 = digit(v.slice(0, 12));
  const d2 = digit(v.slice(0, 12) + d1);
  return v.endsWith(`${d1}${d2}`) ? v : null;
}

/** "11222333000181" → "11.222.333/0001-81" (anything else is returned as is). */
export function formatCnpj(cnpj: string | null): string {
  if (!cnpj) return "";
  return /^[0-9A-Z]{14}$/.test(cnpj) ? `${cnpj.slice(0, 2)}.${cnpj.slice(2, 5)}.${cnpj.slice(5, 8)}/${cnpj.slice(8, 12)}-${cnpj.slice(12)}` : cnpj;
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
  /** Tags on the contact (crm_tags.id); labels and colors come from the catalog. */
  tagIds: string[];
  temperature: CrmTemperature | null;
  /** Serviço de interesse (crm_options kind "service"). */
  serviceInterest: string | null;
  /** Data prevista de retorno, "YYYY-MM-DD". */
  returnAt: string | null;
  /** Decisor na empresa. */
  isDecisionMaker: boolean;
  /** Latest message, note or finished task — whichever came last. */
  lastInteractionAt: string | null;
  /** Earliest pending task. */
  nextTask: CrmTaskSummary | null;
  /** Who is answering this conversation now (atendimento; not the lead's owner) and since when. */
  attendantId: string | null;
  attendantName: string | null;
  attendantSince: string | null;
};

/** A WhatsApp conversation in the Conversas list: the contact plus the funnel stages of its opportunities (the "tags"). */
export type CrmConversation = CrmContactCard & {
  dealStages: CrmStage[];
  /** First message from the contact still without an answer from us (null = nothing waiting). */
  waitingSince: string | null;
};

/** Tempo de resposta: from a contact's first unanswered message to our first reply, in a period. */
export type CrmResponseStats = {
  days: number;
  /** Whole team (or what this profile sees). */
  team: { answered: number; avgMinutes: number | null };
  people: { userId: string; name: string; answered: number; avgMinutes: number }[];
  /** Conversations waiting for us right now. */
  waitingNow: number;
};

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
  | "task"
  | "tag"
  /** Written by an automation (Fase 3): payload { automation, text }. */
  | "automation"
  /** Atendimento of the conversation (Fase 4): payload { action: assumed|takeover|transferred|ended, from, to }. */
  | "attendance"
  /** Solicitação de transferência (evolução v1.0): payload { action: requested|aprovada|recusada|cancelada, from, to, reason, note, requestedBy }. */
  | "transfer";

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
  /** Serviço (crm_options kind "service"). */
  service: string | null;
  /** Valor negociado, centavos — what a won opportunity is worth. */
  negotiatedCents: number | null;
  /** Origem (crm_options kind "source"); starts as the contact's. */
  source: CrmSource;
  /** The opportunity's own temperature, else the contact's. */
  temperature: CrmTemperature | null;
  wonReason: string | null;
  wonNote: string | null;
  stageChangedAt: string;
  closedAt: string | null;
  createdAt: string;
  /** The active client this won opportunity became a contract of (Fase 5). */
  clientId: string | null;
  /** Probabilidade de fechamento (%): the opportunity's own, else its stage's (evolução). */
  probability: number;
  /** true when the probability was set on the opportunity itself. */
  probabilityOwn: boolean;
  /** Tabulação of a closed opportunity: group, result (won), who closed it, return date (futuro). */
  closeGroup: "positivo" | "negativo" | "sem_conversao" | "futuro" | null;
  wonResult: "venda_realizada" | "proposta_aprovada" | null;
  closedByName: string | null;
  returnOn: string | null;
};

export type CrmTaskSummary = { id: string; kind: CrmTaskKind; title: string; dueAt: string | null; allDay: boolean };

/** One card on the funnel: the opportunity plus what the board shows of its contact. */
export type CrmDealCard = CrmDeal & {
  contactName: string;
  company: string | null;
  phone: string | null;
  email: string | null;
  referredBy: string | null;
  hasAdReferral: boolean;
  unreadCount: number;
  lastInboundAt: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string | null;
  /** Earliest pending task for this opportunity (or for its contact with no opportunity set). */
  nextTask: CrmTaskSummary | null;
  /** The contact's tags. */
  tagIds: string[];
};

export type CrmTask = CrmTaskSummary & {
  /** null = linked to a company only, or an internal activity. */
  contactId: string | null;
  contactName: string | null;
  /** The task's own company, or its contact's. */
  companyId: string | null;
  company: string | null;
  description: string | null;
  /** A crm_options id of kind "priority". */
  priority: string;
  status: CrmTaskStatus;
  remindMinutes: number | null;
  remindAt: string | null;
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

/** One line of a task's own history. */
export type CrmTaskEvent = { id: string; action: string; payload: Record<string, unknown>; userName: string | null; at: string };

/** The reminders bell: reminders that are due, and how many of my tasks are late. */
export type CrmReminders = { due: CrmTask[]; overdue: number };

/** A notice in the bell (automações): a lead given to me, an alert, interest in a campaign. */
export type CrmBellNotice = { id: string; kind: string; title: string; body: string | null; contactId: string | null; clientId?: string | null; at: string };

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
  /** How each tag got here (manual, importação, campanha, automação), by whom and when. */
  tagLinks: { tagId: string; via: "manual" | "importacao" | "campanha" | "automacao"; byName: string | null; at: string }[];
  /** Evolução v1.0: true when the viewer may see the lead but not its WhatsApp conversation (someone else's lead). */
  conversationHidden?: boolean;
  /** The open transfer request on this lead, if any. */
  pendingTransfer?: CrmTransferInfo | null;
};

/** A transfer request as the screens show it (see crm-transfers.ts). */
export type CrmTransferInfo = {
  id: string;
  contactId: string;
  contactName: string;
  company: string | null;
  fromOwnerId: string | null;
  fromOwnerName: string | null;
  toOwnerId: string | null;
  toOwnerName: string;
  reason: string;
  status: "pendente" | "aprovada" | "recusada" | "cancelada";
  requestedById: string | null;
  requestedByName: string;
  requestedAt: string;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
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
  /** Nome (fantasia) — how the team calls it. */
  name: string;
  /** Razão social. */
  legalName: string | null;
  /** 14 characters, no punctuation (formatCnpj to show). */
  cnpj: string | null;
  segment: string | null;
  city: string | null;
  state: string | null;
  address: string | null;
  website: string | null;
  notes: string | null;
  /** Responsável pela conta. */
  ownerId: string | null;
  ownerName: string | null;
  status: CrmCompanyStatus | null;
  tagIds: string[];
  /** Contacts marked as decisores. */
  decisionMakers: { id: string; name: string }[];
  contactCount: number;
  /** Contacts still in the funnel (not won/lost/archived). */
  openCount: number;
  wonCount: number;
  lastActivityAt: string | null;
  createdAt: string;
  /** Its record in Clientes ativos, if it has one (Fase 5). */
  clientId: string | null;
};

export type CrmCompanyDetail = CrmCompanyRow & {
  contacts: CrmContactCard[];
  /** Every opportunity of the company's contacts (open first, then the closed ones, newest first). */
  deals: (CrmDeal & { contactName: string })[];
  tagLinks: { tagId: string; via: string; byName: string | null; at: string }[];
};

export type CrmPage<T> = { rows: T[]; total: number; page: number; pageSize: number };

/** Values offered in the segment/city filters — whatever the team has typed so far. */
export type CrmFacets = { segments: string[]; cities: string[] };

/** Fields a spreadsheet column can be mapped to on import. */
export const CRM_IMPORT_FIELDS = [
  { id: "name", label: "Nome", required: true },
  { id: "phone", label: "WhatsApp / telefone" },
  { id: "email", label: "E-mail" },
  { id: "company", label: "Empresa" },
  { id: "cnpj", label: "CNPJ" },
  { id: "jobTitle", label: "Cargo" },
  { id: "segment", label: "Segmento" },
  { id: "city", label: "Cidade" },
  { id: "source", label: "Origem" },
  { id: "referredBy", label: "Indicado por" },
  { id: "consent", label: "Consentimento (sim/não)" },
  { id: "consentSource", label: "Como aceitou ser contatado" },
  { id: "notes", label: "Observações" },
  { id: "tags", label: "Etiquetas (separadas por vírgula)" },
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
  /** Segments not on the Personalização list yet: added to it on import. */
  newSegments: string[];
  /** Tag names in the sheet that match no active tag: ignored. */
  unknownTags: string[];
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
  /** Opportunities that entered "Proposta enviada" in the period (meetings: Reunião tasks scheduled in it). */
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
  /** Open opportunities in the same stage for `days` days, without a message or a finished task (now). */
  stalledNow: { count: number; valueCents: number; days: number };
  /** Receita recorrente contratada: clients with vigente monthly contracts (now). null = no access to clients; monthlyCents null = values hidden. */
  recurring: { clients: number; monthlyCents: number | null } | null;
  /** Campaigns that started sending in the period (null = no access to campaigns). */
  campaigns: { count: number; sent: number; delivered: number; read: number; replied: number; interested: number; newDeals: number; optedOut: number } | null;
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

/** One record behind a Painel number ("clicar no indicador"). */
export type CrmDashboardRecord = {
  kind: "contact" | "deal" | "task" | "client" | "campaign";
  id: string;
  /** Opens this contact (deals, leads, tasks of a contact). */
  contactId: string | null;
  /** Tasks of a company / clients. */
  companyId: string | null;
  title: string;
  detail: string | null;
  ownerName: string | null;
  stage: CrmStage | null;
  valueCents: number | null;
  at: string | null;
};

// ---------- Metas e produtividade (Fase 6, entrega 2) ----------

/** The indicators a monthly goal can be set on — each one counted exactly like the Painel counts it. */
export const CRM_GOAL_METRICS = [
  { id: "leads", label: "Leads cadastrados", short: "Leads", money: false },
  { id: "meetings", label: "Reuniões agendadas", short: "Reuniões", money: false },
  { id: "proposals", label: "Propostas enviadas", short: "Propostas", money: false },
  { id: "won", label: "Negócios ganhos", short: "Ganhos", money: false },
  { id: "wonValue", label: "Valor vendido", short: "Valor vendido", money: true },
] as const;
export type CrmGoalMetric = (typeof CRM_GOAL_METRICS)[number]["id"];
export function isGoalMetric(v: unknown): v is CrmGoalMetric {
  return CRM_GOAL_METRICS.some((m) => m.id === v);
}

/** One line of the month's goals: the team (userId null) or a person. */
export type CrmGoalRow = {
  userId: string | null;
  name: string;
  /** The goal per indicator (a count, or centavos for wonValue); missing = no goal. */
  targets: Partial<Record<CrmGoalMetric, number>>;
  /** What was achieved in the month so far. */
  actual: Record<CrmGoalMetric, number>;
};

export type CrmGoalsMonth = {
  /** "YYYY-MM" */
  month: string;
  /** Share of the month already gone (0 for a future month, 1 for a past one) — the expected pace. */
  elapsed: number;
  /** The team first (for who sees everyone), then each person. A Comercial gets only their own line. */
  rows: CrmGoalRow[];
  updatedAt: string | null;
  updatedByName: string | null;
};

/** What one person did in a period (deal / lead / task owner; conversations by who answered). */
export type CrmProductivityNumbers = {
  leads: number;
  meetings: number;
  proposals: number;
  wonCount: number;
  wonValueCents: number;
  lostCount: number;
  /** Won ÷ (won + lost) in the period; null without any. */
  conversion: number | null;
  tasksDone: number;
  /** Right now, not in the period. */
  tasksOverdue: number;
  /** Contacts they wrote to on WhatsApp (campaigns don't count). */
  conversations: number;
  messagesSent: number;
  /** Waiting contacts they answered, and how long it took on average (clock minutes). */
  answered: number;
  avgResponseMinutes: number | null;
};

export type CrmProductivityRow = CrmProductivityNumbers & {
  /** null = work without a responsible person. */
  userId: string | null;
  name: string;
  lastActivityAt: string | null;
};

export type CrmProductivity = {
  from: string;
  to: string;
  rows: CrmProductivityRow[];
  /** The whole team (same totals as the Painel); null for a Comercial. */
  team: CrmProductivityNumbers | null;
};

// ---------- Indicadores de mídia do Legado Intelligence (Fase 7, entrega 1) ----------

/** A period's media numbers, computed exactly like the Intelligence does (rates from summed totals). Money in reais; null = hidden (no permission) or not applicable. */
export type CrmMediaTotals = {
  spend: number | null;
  impressions: number;
  /** Deduplicated per ad account (Meta's own account-level reach), summed across the client's accounts — as the Intelligence shows it. */
  reach: number;
  clicks: number;
  linkClicks: number;
  /** null = no campaign in scope reports conversations (not the same as 0). */
  conversations: number | null;
  /** % */
  ctr: number | null;
  cpc: number | null;
  cpm: number | null;
  costPerConversation: number | null;
};

export type CrmMediaCampaign = {
  id: string;
  name: string;
  accountName: string;
  objective: string | null;
  status: string;
  spend: number | null;
  impressions: number;
  clicks: number;
  conversations: number | null;
};

/** One synchronization, kept forever (the history). */
export type CrmMediaSync = {
  id: string;
  /** "YYYY-MM" */
  month: string;
  periodFrom: string;
  periodTo: string;
  /** "Meta Ads (Legado Intelligence)" */
  source: string;
  intelligenceClient: string;
  accountIds: string[];
  /** Accounts that couldn't be read that time — left out of the numbers. */
  missingAccounts: string[];
  totals: CrmMediaTotals;
  campaigns: CrmMediaCampaign[];
  syncedAt: string;
  syncedByName: string | null;
};

export type CrmClientMedia = {
  month: string;
  /** The Intelligence client this active client is linked to. */
  link: { clientAccessId: string; label: string; accountCount: number } | null;
  canLink: boolean;
  canSync: boolean;
  /** Why this person can't see or sync the numbers (their Intelligence access), when that's the case. */
  blocked: string | null;
  /** The month's latest sync. */
  latest: CrmMediaSync | null;
  /** Every sync of the month, newest first. */
  history: { id: string; syncedAt: string; syncedByName: string | null; periodTo: string; partial: boolean }[];
};

/** An Intelligence client that can be linked (within the person's Intelligence access). */
export type CrmIntelligenceClient = { id: string; label: string; accountCount: number; linkedClientId: string | null; linkedClientName: string | null };

// ---------- Assistente de IA (Fase 7, entrega 2) ----------

export type CrmAnalysisKind = "lead" | "dashboard" | "client";

/**
 * One analysis, in three separate parts (especificação: "separar dados
 * comprovados, cálculos e recomendações geradas pela IA"): what the CRM has,
 * what the system calculated from it (with the formula), and — only when
 * asked and available — the AI's reading and recommendations.
 */
export type CrmAnalysis = {
  kind: CrmAnalysisKind;
  title: string;
  subtitle: string;
  /** Dados do CRM, as recorded (only what this person may see). */
  facts: { title: string; items: { label: string; value: string }[] }[];
  /** Cálculos do sistema. */
  calculations: { label: string; value: string; how: string }[];
  /** Leitura da IA — never stored, never mixed with the facts. */
  ai: { text: string; model: string; generatedAt: string } | null;
  /** ready = may ask; ok = asked and answered. */
  aiStatus: "ready" | "ok" | "not_configured" | "not_allowed" | "limit" | "error" | "refused";
  aiMessage: string | null;
  /** AI requests this person has left today (null when the AI isn't available to them). */
  remainingToday: number | null;
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

// ---------------- Clientes ativos (Fase 5) ----------------

export const CRM_CLIENT_STATUSES = [
  { id: "onboarding", label: "Onboarding" },
  { id: "ativo", label: "Ativo" },
  { id: "pausado", label: "Pausado" },
  { id: "encerrado", label: "Encerrado" },
] as const;
export type CrmClientStatus = (typeof CRM_CLIENT_STATUSES)[number]["id"];
export function isCrmClientStatus(value: unknown): value is CrmClientStatus {
  return CRM_CLIENT_STATUSES.some((t) => t.id === value);
}
export function clientStatusLabel(id: string | null | undefined): string {
  return CRM_CLIENT_STATUSES.find((t) => t.id === id)?.label ?? "";
}

export const CRM_CONTRACT_STATUSES = [
  { id: "vigente", label: "Vigente" },
  { id: "encerrado", label: "Encerrado" },
  { id: "cancelado", label: "Cancelado" },
] as const;
export type CrmContractStatus = (typeof CRM_CONTRACT_STATUSES)[number]["id"];
export function isCrmContractStatus(value: unknown): value is CrmContractStatus {
  return CRM_CONTRACT_STATUSES.some((t) => t.id === value);
}
export function contractStatusLabel(id: string | null | undefined): string {
  return CRM_CONTRACT_STATUSES.find((t) => t.id === id)?.label ?? "";
}

export const CRM_CONTRACT_BILLINGS = [
  { id: "mensal", label: "Mensal" },
  { id: "unico", label: "Valor único" },
] as const;
export type CrmContractBilling = (typeof CRM_CONTRACT_BILLINGS)[number]["id"];
export function isCrmContractBilling(value: unknown): value is CrmContractBilling {
  return CRM_CONTRACT_BILLINGS.some((t) => t.id === value);
}

/** "Vence em 30 / 60 dias" and "Vencido" in the Clientes filter. */
export const CRM_RENEWAL_FILTERS = [
  { id: "30", label: "Vence em até 30 dias" },
  { id: "60", label: "Vence em até 60 dias" },
  { id: "vencido", label: "Contrato vencido" },
] as const;

export type CrmContract = {
  id: string;
  clientId: string;
  /** Serviço ids (Personalização → Serviços). */
  services: string[];
  startsOn: string;
  /** null = sem prazo. */
  endsOn: string | null;
  /** Centavos; null when not informed — or hidden from this person (see `valuesHidden`). */
  valueCents: number | null;
  billing: CrmContractBilling;
  status: CrmContractStatus;
  notes: string | null;
  dealId: string | null;
  dealTitle: string | null;
  /** Days until it ends (Brasília), for a vigente contract with an end date; negative = already ended. */
  daysLeft: number | null;
  createdAt: string;
};

export type CrmClientRow = {
  id: string;
  companyId: string;
  companyName: string;
  segment: string | null;
  city: string | null;
  ownerId: string | null;
  ownerName: string | null;
  status: CrmClientStatus;
  startedOn: string | null;
  endedOn: string | null;
  endReason: string | null;
  notes: string | null;
  /** Services of the vigente contracts. */
  services: string[];
  /** Monthly value of the vigente contracts (centavos); null when hidden or none informed. */
  monthlyCents: number | null;
  /** The vigente contract that ends first: its end date and the days left (negative = expired). */
  nextEndsOn: string | null;
  daysLeft: number | null;
  activeContracts: number;
  decisionMakers: { id: string; name: string }[];
  tagIds: string[];
  createdAt: string;
};

export type CrmClientEvent = {
  id: string;
  kind: "created" | "edited" | "status" | "contract_added" | "contract_edited" | "note" | "report" | "intelligence";
  payload: Record<string, unknown>;
  userName: string | null;
  createdAt: string;
};

export type CrmClientDetail = CrmClientRow & {
  contracts: CrmContract[];
  events: CrmClientEvent[];
  /** Acompanhamento mensal, newest month first. */
  reports: CrmClientReport[];
  dealId: string | null;
  createdByName: string | null;
};

/** Ready to become clients: won opportunities without a contract, companies marked "Cliente ativo" without a record. */
export type CrmClientSuggestions = {
  deals: { dealId: string; title: string; contactId: string; contactName: string; companyId: string | null; companyName: string | null; closedAt: string | null; clientId: string | null }[];
  companies: { companyId: string; companyName: string }[];
};

/** Acompanhamento mensal of a client (Fase 5, entrega 2): one per month. */
export type CrmClientReport = {
  id: string;
  clientId: string;
  /** "YYYY-MM". */
  month: string;
  /** Serviços realizados (ids). */
  services: string[];
  activities: string | null;
  results: string | null;
  attention: string | null;
  nextActions: string | null;
  ownerId: string | null;
  ownerName: string | null;
  updatedByName: string | null;
  updatedAt: string;
  createdAt: string;
};

/** "Acompanhamento de clientes": every current client and whether this month was updated. */
export type CrmFollowUpRow = {
  clientId: string;
  companyName: string;
  status: CrmClientStatus;
  ownerId: string | null;
  ownerName: string | null;
  services: string[];
  report: { ownerName: string | null; updatedByName: string | null; updatedAt: string; attention: string | null } | null;
};

const MONTHS_PT = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
/** "2026-11" → "novembro de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = month.split("-").map(Number);
  return MONTHS_PT[m - 1] ? `${MONTHS_PT[m - 1]} de ${y}` : month;
}
/** "Novembro de 2026" (for titles). */
export function monthTitle(month: string): string {
  const l = monthLabel(month);
  return l.charAt(0).toUpperCase() + l.slice(1);
}
export function isMonth(value: unknown): value is string {
  return typeof value === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(value);
}
