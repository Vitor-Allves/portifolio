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

const CTA_LABELS: Record<string, string> = {
  SHOP_NOW: "Comprar agora",
  LEARN_MORE: "Saiba mais",
  SIGN_UP: "Cadastre-se",
  DOWNLOAD: "Baixar",
  CONTACT_US: "Fale conosco",
  SEND_MESSAGE: "Enviar mensagem",
  WHATSAPP_MESSAGE: "Enviar WhatsApp",
  SUBSCRIBE: "Assinar",
  BOOK_TRAVEL: "Reservar",
  GET_QUOTE: "Solicitar orçamento",
  APPLY_NOW: "Inscreva-se",
  GET_OFFER: "Ver oferta",
  CALL_NOW: "Ligar agora",
};

export function ctaLabel(cta: string): string {
  return CTA_LABELS[cta] ?? cta;
}

// Meta's ad relevance diagnostics — ranks this ad against other advertisers
// competing for the same audience. null (never delivered enough to rank, or
// Meta's own "UNKNOWN") is handled by callers, never mapped to a label here.
const QUALITY_RANKING_LABELS: Record<string, string> = {
  ABOVE_AVERAGE: "Qualidade acima da média",
  AVERAGE: "Qualidade na média",
  BELOW_AVERAGE_35: "Qualidade abaixo da média",
  BELOW_AVERAGE_20: "Qualidade bem abaixo da média",
  BELOW_AVERAGE_10: "Qualidade entre as piores 10%",
  BELOW_AVERAGE: "Qualidade abaixo da média",
};

export function qualityRankingLabel(ranking: string): string {
  return QUALITY_RANKING_LABELS[ranking] ?? ranking;
}
