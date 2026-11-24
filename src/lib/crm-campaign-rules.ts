// Pure rules for Campanhas (Fase 5), shared by the server and the screens:
// statuses, how a template's {{n}} gets its value for each contact, and the
// words that unsubscribe a lead when they answer on WhatsApp.

/** How long after a campaign message an answer still counts as a reply to it (Campanhas, automação 10). */
export const CAMPAIGN_REPLY_WINDOW = "3 days";

export const CAMPAIGN_STATUS = [
  { id: "rascunho", label: "Rascunho" },
  { id: "enviando", label: "Enviando" },
  { id: "pausada", label: "Pausada" },
  { id: "concluida", label: "Concluída" },
  { id: "cancelada", label: "Cancelada" },
] as const;

export type CampaignStatus = (typeof CAMPAIGN_STATUS)[number]["id"];

export function campaignStatusLabel(status: string): string {
  return CAMPAIGN_STATUS.find((s) => s.id === status)?.label ?? status;
}

/** Where a template variable comes from. A contact field can be empty, so it always carries a fallback text. */
export const PARAM_SOURCES = [
  { id: "first_name", label: "Primeiro nome do contato" },
  { id: "name", label: "Nome completo do contato" },
  { id: "company", label: "Empresa do contato" },
  { id: "owner", label: "Nome do responsável" },
  { id: "text", label: "Texto fixo" },
] as const;

export type ParamSource = (typeof PARAM_SOURCES)[number]["id"];

export type CampaignParam = { source: ParamSource; text: string };

export function isParamSource(v: unknown): v is ParamSource {
  return PARAM_SOURCES.some((p) => p.id === v);
}

export type ParamContact = { name: string; company: string | null; ownerName: string | null };

/** The value of each {{n}} for one contact. Empty field → the fallback text. */
export function resolveParams(params: CampaignParam[], c: ParamContact): string[] {
  return params.map((p) => {
    const first = c.name.trim().split(/\s+/)[0] ?? "";
    const value =
      p.source === "first_name" ? first : p.source === "name" ? c.name.trim() : p.source === "company" ? c.company?.trim() : p.source === "owner" ? c.ownerName?.trim() : "";
    return (value || p.text).trim();
  });
}

/** What a template body reads like for one contact: {{1}} → its value (a field still empty stays as {{n}}). */
export function fillTemplate(body: string, values: string[]): string {
  return body.replace(/\{\{(\d+)\}\}/g, (all, n) => values[Number(n) - 1] || all);
}

/** Why a contact in the filtered audience won't receive the campaign. */
export const SKIP_REASONS = {
  sem_consentimento: "Não deu consentimento",
  descadastrado: "Pediu para não receber",
  sem_telefone: "Sem WhatsApp cadastrado",
  arquivado: "Arquivado",
  cancelada: "Campanha cancelada antes do envio",
} as const;

export type SkipReason = keyof typeof SKIP_REASONS;

// Whole-message answers only: "quero sair mais cedo" must not unsubscribe anyone.
const OPT_OUT_WORDS = new Set([
  "sair",
  "parar",
  "pare",
  "stop",
  "cancelar",
  "descadastrar",
  "descadastro",
  "remover",
  "nao quero receber",
  "nao quero mais receber",
  "nao quero mais",
  "nao enviar",
  "nao envie mais",
]);

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9 ]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** True when the whole message is a request to stop receiving messages ("SAIR", "Parar.", "não quero receber"). */
export function isOptOutText(body: string | null | undefined): boolean {
  if (!body || body.length > 60) return false;
  return OPT_OUT_WORDS.has(normalize(body));
}

export const OPT_OUT_CONFIRMATION =
  "Pronto, você não vai mais receber nossas mensagens de campanha. Se quiser falar com a gente, é só mandar uma mensagem por aqui.";

/** Who the campaign goes to: the same filters as Contatos (archived contacts never). */
export type CampaignAudience = {
  stage?: string;
  owner?: string;
  source?: string;
  segment?: string;
  city?: string;
  companyId?: string;
  /** Only contacts with this tag. */
  tag?: string;
  /** Contacts that entered the CRM from / until this day (YYYY-MM-DD, Brasília), inclusive. */
  createdFrom?: string;
  createdTo?: string;
  /** Contacts taken out of this campaign by hand (Fase 4). */
  exclude?: string[];
};

export const AUDIENCE_KEYS = ["stage", "owner", "source", "segment", "city", "companyId", "tag"] as const;

/** Most contacts that can be taken out of one campaign by hand. */
export const MAX_EXCLUDED = 5000;

/** A real calendar day, YYYY-MM-DD (so 2026-02-31 is refused before it reaches the database). */
const isDay = (v: unknown): v is string => {
  if (typeof v !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = new Date(`${v}T12:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
};

export function cleanAudience(raw: unknown): CampaignAudience {
  const out: CampaignAudience = {};
  if (!raw || typeof raw !== "object") return out;
  const r = raw as Record<string, unknown>;
  for (const k of AUDIENCE_KEYS) {
    const v = r[k];
    if (typeof v === "string" && v.trim() && v !== "all") out[k] = v.trim().slice(0, 200);
  }
  if (isDay(r.createdFrom)) out.createdFrom = r.createdFrom;
  if (isDay(r.createdTo)) out.createdTo = r.createdTo;
  if (Array.isArray(r.exclude)) {
    const ids = [...new Set(r.exclude.filter((x): x is string => typeof x === "string" && x.length > 0 && x.length <= 100))].slice(0, MAX_EXCLUDED);
    if (ids.length > 0) out.exclude = ids;
  }
  return out;
}

/** A saved, reusable audience: the filters only (exclusions belong to each campaign). */
export type SavedAudience = { id: string; name: string; audience: CampaignAudience; createdByName: string | null; createdAt: string };

/** One person the filters would send to, for the "Quem vai receber" list. */
export type AudienceMember = { id: string; name: string; company: string | null; ownerName: string | null; excluded: boolean };

export type CampaignCounts = {
  /** Everyone the filters matched when sending started. */
  audience: number;
  /** Left out (no consent, unsubscribed, no phone…). */
  skipped: number;
  pending: number;
  sent: number;
  failed: number;
  delivered: number;
  read: number;
  /** Wrote back within 3 days of receiving it. */
  replied: number;
  /** Unsubscribed after receiving it. */
  optedOut: number;
  /** Opportunities opened within 30 days of receiving it. */
  newDeals: number;
  /** Answered and showed interest: the automation "Resposta de campanha" flagged it, or the contact is "quente". */
  interested: number;
};

export type CampaignSummary = {
  id: string;
  name: string;
  status: CampaignStatus;
  templateName: string | null;
  createdByName: string | null;
  startedByName: string | null;
  createdAt: string;
  startedAt: string | null;
  finishedAt: string | null;
  pauseReason: string | null;
  counts: CampaignCounts;
};

export type CampaignRecipient = {
  contactId: string;
  name: string;
  phone: string | null;
  status: "pendente" | "enviando" | "enviada" | "falhou" | "pulada";
  /** Delivery status reported by WhatsApp: sent, delivered, read, failed. */
  messageStatus: string | null;
  detail: string | null;
  sentAt: string | null;
  replied: boolean;
  interested: boolean;
};

export type CampaignDetail = CampaignSummary & {
  templateLanguage: string | null;
  templateBody: string | null;
  params: CampaignParam[];
  audience: CampaignAudience;
  recipients: CampaignRecipient[];
};

export type AudiencePreview = {
  matched: number;
  eligible: number;
  /** Would receive it, but were taken out by hand. */
  excludedByHand: number;
  excluded: { reason: SkipReason; label: string; count: number }[];
  sample: { name: string; message: string | null }[];
};
