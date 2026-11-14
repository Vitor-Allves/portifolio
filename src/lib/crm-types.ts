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
  | "restored";

export type CrmEvent = {
  id: string;
  kind: CrmEventKind;
  payload: Record<string, unknown>;
  userName: string | null;
  createdAt: string;
};

export type CrmContactDetail = CrmContactCard & {
  consentSource: string | null;
  consentAt: string | null;
  adReferral: CrmAdReferral | null;
  messages: CrmMessage[];
  events: CrmEvent[];
};

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
