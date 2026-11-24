// Propostas e orçamentos (evolução v1.0, item 3): the types, the statuses and
// the arithmetic shared by the server, the CRM screens, the PDF and the
// public page. No database here — safe to import anywhere.

export const PROPOSAL_STATUSES = [
  { id: "em_elaboracao", label: "Em elaboração", tone: "cinza" },
  { id: "enviada", label: "Enviada", tone: "azul" },
  { id: "visualizada", label: "Visualizada", tone: "roxo" },
  { id: "em_negociacao", label: "Em negociação", tone: "amarelo" },
  { id: "aprovada", label: "Aprovada", tone: "verde" },
  { id: "recusada", label: "Recusada", tone: "vermelho" },
  { id: "expirada", label: "Expirada", tone: "cinza" },
  { id: "cancelada", label: "Cancelada", tone: "cinza" },
] as const;
export type ProposalStatus = (typeof PROPOSAL_STATUSES)[number]["id"];
export function isProposalStatus(v: unknown): v is ProposalStatus {
  return PROPOSAL_STATUSES.some((s) => s.id === v);
}
export function proposalStatusLabel(s: string): string {
  return PROPOSAL_STATUSES.find((x) => x.id === s)?.label ?? s;
}
/** Sent and waiting for the client (the link works, the client may decide; it can expire). */
export const PROPOSAL_OPEN: ProposalStatus[] = ["enviada", "visualizada", "em_negociacao"];
/** Nothing else happens to it (a recusada or expirada one may still get a new version). */
export const PROPOSAL_FINAL: ProposalStatus[] = ["aprovada", "cancelada"];

/** How the recurring part is charged. */
export const PROPOSAL_BILLING_PERIODS = [
  { id: "mensal", label: "Mensal", months: 1 },
  { id: "trimestral", label: "Trimestral", months: 3 },
  { id: "semestral", label: "Semestral", months: 6 },
  { id: "anual", label: "Anual", months: 12 },
] as const;
export type ProposalBillingPeriod = (typeof PROPOSAL_BILLING_PERIODS)[number]["id"];
export function isProposalBillingPeriod(v: unknown): v is ProposalBillingPeriod {
  return PROPOSAL_BILLING_PERIODS.some((s) => s.id === v);
}

/** How a proposal reached the client (registrar envio). */
export const PROPOSAL_CHANNELS = [
  { id: "link", label: "Link copiado" },
  { id: "whatsapp", label: "WhatsApp" },
  { id: "email", label: "E-mail" },
  { id: "pdf", label: "PDF entregue" },
  { id: "presencial", label: "Em reunião" },
] as const;
export type ProposalChannel = (typeof PROPOSAL_CHANNELS)[number]["id"];
export function isProposalChannel(v: unknown): v is ProposalChannel {
  return PROPOSAL_CHANNELS.some((s) => s.id === v);
}

export type ProposalItem = {
  /** A service from the catalog (Personalização → Serviços), or null for a custom one. */
  serviceId: string | null;
  name: string;
  description: string | null;
  quantity: number;
  unitCents: number;
  /** "mensal" (recurring) or "unico" (one-time). */
  billing: "mensal" | "unico";
  /** Discount on this line, in cents (already computed when typed as %). */
  discountCents: number;
  /** When typed as a percentage, that percentage (shown back as typed). */
  discountPct: number | null;
};

export type ProposalTotals = {
  /** Before discounts. */
  grossCents: number;
  discountCents: number;
  /** Recurring, per month, after discounts. */
  monthlyCents: number;
  /** One-time, after discounts. */
  oneTimeCents: number;
  /** monthly + one-time (the first charge). */
  totalCents: number;
  /** Discount over the gross value, 0–100 with one decimal. */
  discountPct: number;
};

export function lineGross(i: Pick<ProposalItem, "quantity" | "unitCents">): number {
  return Math.round(i.quantity * i.unitCents);
}
export function lineNet(i: Pick<ProposalItem, "quantity" | "unitCents" | "discountCents">): number {
  return lineGross(i) - i.discountCents;
}

export function proposalTotals(items: Pick<ProposalItem, "quantity" | "unitCents" | "discountCents" | "billing">[]): ProposalTotals {
  let gross = 0;
  let discount = 0;
  let monthly = 0;
  let oneTime = 0;
  for (const i of items) {
    gross += lineGross(i);
    discount += i.discountCents;
    if (i.billing === "mensal") monthly += lineNet(i);
    else oneTime += lineNet(i);
  }
  return {
    grossCents: gross,
    discountCents: discount,
    monthlyCents: monthly,
    oneTimeCents: oneTime,
    totalCents: monthly + oneTime,
    discountPct: gross > 0 ? Math.round((discount / gross) * 1000) / 10 : 0,
  };
}

/** "0007" — the number shown everywhere. */
export function proposalNumber(n: number): string {
  return String(n).padStart(4, "0");
}

/** What a version holds: everything the client sees, frozen. */
export type ProposalContent = {
  title: string;
  intro: string | null;
  issueDate: string;
  validUntil: string;
  dueDate: string | null;
  paymentTerms: string | null;
  billingPeriod: ProposalBillingPeriod;
  executionTerm: string | null;
  notes: string | null;
  items: ProposalItem[];
  totals: ProposalTotals;
  client: { contactName: string; companyName: string | null; cnpj: string | null; email: string | null };
  ownerName: string | null;
};

export type ProposalChange = { field: string; from: string | null; to: string | null };

export type CrmProposalVersion = {
  version: number;
  content: ProposalContent;
  contentHash: string;
  reason: string | null;
  changes: ProposalChange[];
  createdByName: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type CrmProposalEvent = {
  id: string;
  kind: string;
  version: number | null;
  payload: Record<string, unknown>;
  actorName: string | null;
  createdAt: string;
};

export type CrmProposalApproval = {
  id: string;
  version: number;
  decision: "aprovada" | "recusada";
  name: string;
  email: string | null;
  document: string | null;
  comment: string | null;
  contentHash: string;
  via: "cliente" | "equipe";
  recordedByName: string | null;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
};

export type CrmProposalSummary = {
  id: string;
  number: number;
  title: string;
  status: ProposalStatus;
  version: number;
  sentVersion: number | null;
  dealId: string;
  dealTitle: string;
  contactId: string;
  contactName: string;
  companyId: string | null;
  companyName: string | null;
  ownerId: string | null;
  ownerName: string | null;
  totalCents: number;
  monthlyCents: number;
  oneTimeCents: number;
  discountPct: number;
  validUntil: string;
  issueDate: string;
  /** The discount is above the limit and no Gestor authorized it yet. */
  discountPending: boolean;
  sentAt: string | null;
  viewedAt: string | null;
  decidedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type CrmProposalDetail = CrmProposalSummary & {
  content: ProposalContent;
  /** The current version was sent: editing it makes a new version (with the reason). */
  locked: boolean;
  discountLimitPct: number;
  discountAuthorizedPct: number | null;
  discountAuthorizedByName: string | null;
  link: { token: string; createdAt: string } | null;
  /** The contract formalized from it (evolução v1.0, item 8). */
  contract: { id: string; clientId: string; number: number } | null;
  versions: CrmProposalVersion[];
  events: CrmProposalEvent[];
  approvals: CrmProposalApproval[];
};

export type CrmProposalTemplate = {
  id: string;
  name: string;
  intro: string | null;
  paymentTerms: string | null;
  billingPeriod: ProposalBillingPeriod;
  executionTerm: string | null;
  notes: string | null;
  validDays: number;
  /** Services from the catalog (their reference value and billing come along). */
  serviceIds: string[];
  archivedAt: string | null;
};

/** Stable JSON (sorted keys) — what the content hash is taken from. */
export function canonicalJson(v: unknown): string {
  if (v === null || typeof v !== "object") return JSON.stringify(v ?? null);
  if (Array.isArray(v)) return `[${v.map(canonicalJson).join(",")}]`;
  const o = v as Record<string, unknown>;
  return `{${Object.keys(o)
    .filter((k) => o[k] !== undefined)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${canonicalJson(o[k])}`)
    .join(",")}}`;
}
