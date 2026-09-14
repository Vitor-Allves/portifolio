// Human-readable pt-BR labels for Meta's raw objective/status enums. Falls
// back to the raw value itself for any objective Meta adds later — never
// hides data behind an unmapped blank label.

const OBJECTIVE_LABELS: Record<string, string> = {
  OUTCOME_TRAFFIC: "Tráfego",
  OUTCOME_ENGAGEMENT: "Engajamento",
  OUTCOME_LEADS: "Geração de leads",
  OUTCOME_SALES: "Vendas",
  OUTCOME_AWARENESS: "Reconhecimento de marca",
  OUTCOME_APP_PROMOTION: "Promoção de app",
  LINK_CLICKS: "Cliques no link",
  CONVERSIONS: "Conversões",
  REACH: "Alcance",
  BRAND_AWARENESS: "Reconhecimento de marca",
  LEAD_GENERATION: "Geração de leads",
  MESSAGES: "Mensagens",
  VIDEO_VIEWS: "Visualizações de vídeo",
  POST_ENGAGEMENT: "Engajamento com publicação",
  APP_INSTALLS: "Instalação de app",
  PRODUCT_CATALOG_SALES: "Catálogo de produtos",
  STORE_VISITS: "Visitas à loja",
};

export function objectiveLabel(objective: string | null): string {
  if (!objective) return "Não informado";
  return OBJECTIVE_LABELS[objective] ?? objective;
}

const STATUS_LABELS: Record<string, string> = {
  ACTIVE: "Ativa",
  PAUSED: "Pausada",
  DELETED: "Excluída",
  ARCHIVED: "Arquivada",
  OTHER: "Outro",
};

export function statusLabel(status: string): string {
  return STATUS_LABELS[status] ?? status;
}
