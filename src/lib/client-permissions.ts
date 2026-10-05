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
  | "primaryResult"
  | "costPerResult"
  | "spend"
  | "impressions"
  | "clicks"
  | "linkClicks"
  | "conversations"
  | "costPerConversation"
  | "ctr"
  | "cpc"
  | "cpm"
  | "reach"
  | "purchases"
  | "purchaseValue"
  | "roas"
  | "leads"
  | "addToCart"
  | "completeRegistrations"
  | "postEngagement"
  | "videoViews"
  | "videoCompletions"
  | "videoAvgWatchTimeSeconds"
  | "outboundClicks"
  | "uniqueClicks"
  | "estimatedAdRecallRate"
  | "estimatedAdRecallers";

export const CAMPAIGN_COLUMN_OPTIONS: { id: CampaignColumnId; label: string }[] = [
  { id: "account", label: "Conta" },
  { id: "status", label: "Status" },
  { id: "objective", label: "Objetivo" },
  { id: "primaryResult", label: "Resultado principal" },
  { id: "costPerResult", label: "Custo por resultado" },
  { id: "spend", label: "Investimento" },
  { id: "impressions", label: "Impressões" },
  { id: "clicks", label: "Cliques (todos)" },
  { id: "linkClicks", label: "Cliques no link" },
  { id: "conversations", label: "Conversa iniciada" },
  { id: "costPerConversation", label: "Custo por conversa iniciada" },
  { id: "ctr", label: "CTR" },
  { id: "cpc", label: "CPC" },
  { id: "cpm", label: "CPM" },
  { id: "reach", label: "Alcance" },
  { id: "purchases", label: "Compras (Pixel/CAPI)" },
  { id: "purchaseValue", label: "Valor de compra (Pixel/CAPI)" },
  { id: "roas", label: "ROAS (Pixel/CAPI)" },
  { id: "leads", label: "Leads (Pixel/CAPI)" },
  { id: "addToCart", label: "Adicionar ao carrinho (Pixel/CAPI)" },
  { id: "completeRegistrations", label: "Cadastro completo (Pixel/CAPI)" },
  { id: "postEngagement", label: "Engajamento com a publicação" },
  { id: "videoViews", label: "Visualizações de vídeo" },
  { id: "videoCompletions", label: "Vídeo assistido até o fim" },
  { id: "videoAvgWatchTimeSeconds", label: "Tempo médio assistido (vídeo)" },
  { id: "outboundClicks", label: "Cliques para fora da plataforma" },
  { id: "uniqueClicks", label: "Cliques únicos" },
  { id: "estimatedAdRecallRate", label: "Taxa de lembrança do anúncio" },
  { id: "estimatedAdRecallers", label: "Pessoas que lembrarão do anúncio" },
];

// "Visão geral" is deliberately excluded — it's the landing section and
// always stays reachable, so there's always somewhere for a client to land.
export type HideableSectionId = "campaigns" | "insights" | "reports" | "integrations";

export const HIDEABLE_SECTION_OPTIONS: { id: HideableSectionId; label: string }[] = [
  { id: "campaigns", label: "Campanhas" },
  { id: "insights", label: "Análises estratégicas" },
  { id: "reports", label: "Relatórios" },
  { id: "integrations", label: "Integrações" },
];

// The only two real actionable verbs this app has outside plain viewing —
// deliberately not a generic fictitious CRUD matrix. "Visualizar" is
// already covered by hiddenSections/hiddenColumns/hiddenFilters above.
export type ActionId = "manage_report_templates" | "export_reports";

export const ACTION_OPTIONS: { id: ActionId; label: string }[] = [
  { id: "manage_report_templates", label: "Criar/excluir modelos de relatório" },
  { id: "export_reports", label: "Gerar/exportar relatórios (PDF/CSV)" },
];

/** "Simplificado" or "Técnico" — see report-indicators.ts for the shared type (re-exported here to avoid a circular import, since report-indicators.ts itself imports CampaignColumnId from this file). */
export type ReportType = "simplificado" | "tecnico";

export type ClientPermissions = {
  hiddenFilters: FilterKey[];
  hiddenColumns: CampaignColumnId[];
  hiddenSections: HideableSectionId[];
  disabledActions: ActionId[];
  /**
   * Everything below is OPTIONAL and, when absent, resolved by role via
   * resolveReportSettings() rather than defaulted here — sanitizePermissions
   * has no notion of "which role is this", so an old row (saved before this
   * existed) reads as "use the sensible default for this role", never as a
   * hardcoded value baked into every already-stored permissions JSON.
   */
  reportTypesAllowed?: ReportType[];
  reportDefaultType?: ReportType;
  canBuildReport?: boolean;
  canIncludeInternalIndicators?: boolean;
  canMultiClientReport?: boolean;
  /** null/absent = "every indicator this permission set doesn't already hide" (computed at point of use, never snapshotted here). */
  reportDefaultIndicators?: string[] | null;
};

export const EMPTY_PERMISSIONS: ClientPermissions = {
  hiddenFilters: [],
  hiddenColumns: [],
  hiddenSections: [],
  disabledActions: [],
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
const VALID_ACTION_IDS = new Set(ACTION_OPTIONS.map((o) => o.id));
const VALID_REPORT_TYPES = new Set<ReportType>(["simplificado", "tecnico"]);

function pickValidReportTypes(value: unknown): ReportType[] | undefined {
  const picked = pickValid(value, VALID_REPORT_TYPES);
  return picked.length > 0 ? picked : undefined;
}

/** Normalizes arbitrary input (a JSONB column read, or a request body) into a well-formed ClientPermissions — unknown/invalid entries are dropped rather than rejected, so a future option removed from the lists above doesn't break existing rows. The report-settings fields stay undefined (never defaulted here — see resolveReportSettings) when absent or invalid, so an old row reads as "use this role's default", not a value baked in by this function. */
export function sanitizePermissions(input: unknown): ClientPermissions {
  const obj = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const reportDefaultType = obj.reportDefaultType === "simplificado" || obj.reportDefaultType === "tecnico" ? obj.reportDefaultType : undefined;
  const reportDefaultIndicators =
    obj.reportDefaultIndicators === null
      ? null
      : Array.isArray(obj.reportDefaultIndicators)
        ? obj.reportDefaultIndicators.filter((v): v is string => typeof v === "string")
        : undefined;
  return {
    hiddenFilters: pickValid(obj.hiddenFilters, VALID_FILTER_KEYS),
    hiddenColumns: pickValid(obj.hiddenColumns, VALID_COLUMN_IDS),
    hiddenSections: pickValid(obj.hiddenSections, VALID_SECTION_IDS),
    disabledActions: pickValid(obj.disabledActions, VALID_ACTION_IDS),
    reportTypesAllowed: pickValidReportTypes(obj.reportTypesAllowed),
    reportDefaultType,
    canBuildReport: typeof obj.canBuildReport === "boolean" ? obj.canBuildReport : undefined,
    canIncludeInternalIndicators: typeof obj.canIncludeInternalIndicators === "boolean" ? obj.canIncludeInternalIndicators : undefined,
    canMultiClientReport: typeof obj.canMultiClientReport === "boolean" ? obj.canMultiClientReport : undefined,
    reportDefaultIndicators,
  };
}

/** Role-based fallback for every report-settings field a stored ClientPermissions leaves unset — see the comment on ClientPermissions itself for why these aren't defaulted inside sanitizePermissions. `"client"` covers both a client session and a client company's own stored permissions; every staff role gets the same "administrador" defaults EXCEPT administrador_geral, which also defaults canIncludeInternalIndicators to true. */
export type ReportSettingsRoleKind = "administrador_geral" | "administrador" | "gestor" | "analista" | "client";

export type ResolvedReportSettings = {
  typesAllowed: ReportType[];
  defaultType: ReportType;
  canBuild: boolean;
  canIncludeInternal: boolean;
  canMultiClient: boolean;
  /** null = no explicit default saved — resolve to "every indicator this permission set doesn't already hide" at the point of use (the drawer, or the server when the viewer can't build their own selection). */
  defaultIndicators: string[] | null;
};

export function resolveReportSettings(permissions: ClientPermissions, roleKind: ReportSettingsRoleKind): ResolvedReportSettings {
  const isStaff = roleKind !== "client";
  const isFullAdminRole = roleKind === "administrador_geral";
  return {
    typesAllowed: permissions.reportTypesAllowed?.length ? permissions.reportTypesAllowed : isStaff ? ["simplificado", "tecnico"] : ["simplificado"],
    defaultType: permissions.reportDefaultType ?? "simplificado",
    canBuild: permissions.canBuildReport ?? isStaff,
    canIncludeInternal: permissions.canIncludeInternalIndicators ?? isFullAdminRole,
    canMultiClient: permissions.canMultiClientReport ?? isStaff,
    defaultIndicators: permissions.reportDefaultIndicators ?? null,
  };
}

export function isActionAllowed(permissions: ClientPermissions | null | undefined, action: ActionId): boolean {
  return !permissions?.disabledActions.includes(action);
}
