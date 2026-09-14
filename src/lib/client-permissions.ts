// Plain types + option lists for per-client granular permissions — what a
// client login can see beyond the existing account-level restriction. No
// "use client", no server-only imports (crypto/db): safe from the admin
// form, the dashboard components, and client-access.ts (server) alike.

export type FilterKey = "campaign" | "adSet" | "objective" | "status" | "compare";

export const FILTER_OPTIONS: { id: FilterKey; label: string }[] = [
  { id: "campaign", label: "Campanha" },
  { id: "adSet", label: "Conjunto" },
  { id: "objective", label: "Objetivo" },
  { id: "status", label: "Status" },
  { id: "compare", label: "Comparar período anterior" },
];

// Mirrors CampaignsTable's own ColumnId — kept as the source of truth here
// so admin-configured hidden columns can never name one that doesn't exist.
export type CampaignColumnId =
  | "account"
  | "status"
  | "objective"
  | "spend"
  | "impressions"
  | "clicks"
  | "linkClicks"
  | "costPerConversation"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach";

export const CAMPAIGN_COLUMN_OPTIONS: { id: CampaignColumnId; label: string }[] = [
  { id: "account", label: "Conta" },
  { id: "status", label: "Status" },
  { id: "objective", label: "Objetivo" },
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques (todos)" },
  { id: "linkClicks", label: "Conversa iniciada" },
  { id: "costPerConversation", label: "Custo por conversa iniciada" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
  { id: "reach", label: "Alcance" },
];

// "Visão geral" is deliberately excluded — it's the landing section and
// always stays reachable, so there's always somewhere for a client to land.
export type HideableSectionId = "campaigns" | "insights" | "reports" | "integrations";

export const HIDEABLE_SECTION_OPTIONS: { id: HideableSectionId; label: string }[] = [
  { id: "campaigns", label: "Campanhas" },
  { id: "insights", label: "Análises com IA" },
  { id: "reports", label: "Relatórios" },
  { id: "integrations", label: "Integrações" },
];

export type ClientPermissions = {
  hiddenFilters: FilterKey[];
  hiddenColumns: CampaignColumnId[];
  hiddenSections: HideableSectionId[];
};

export const EMPTY_PERMISSIONS: ClientPermissions = {
  hiddenFilters: [],
  hiddenColumns: [],
  hiddenSections: [],
};

function pickValid<T extends string>(value: unknown, valid: ReadonlySet<T>): T[] {
  if (!Array.isArray(value)) return [];
  const seen = new Set<T>();
  for (const v of value) {
    if (typeof v === "string" && valid.has(v as T)) seen.add(v as T);
  }
  return [...seen];
}

const VALID_FILTER_KEYS = new Set(FILTER_OPTIONS.map((o) => o.id));
const VALID_COLUMN_IDS = new Set(CAMPAIGN_COLUMN_OPTIONS.map((o) => o.id));
const VALID_SECTION_IDS = new Set(HIDEABLE_SECTION_OPTIONS.map((o) => o.id));

/** Normalizes arbitrary input (a JSONB column read, or a request body) into a well-formed ClientPermissions — unknown/invalid entries are dropped rather than rejected, so a future option removed from the lists above doesn't break existing rows. */
export function sanitizePermissions(input: unknown): ClientPermissions {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return {
    hiddenFilters: pickValid(obj.hiddenFilters, VALID_FILTER_KEYS),
    hiddenColumns: pickValid(obj.hiddenColumns, VALID_COLUMN_IDS),
    hiddenSections: pickValid(obj.hiddenSections, VALID_SECTION_IDS),
  };
}
