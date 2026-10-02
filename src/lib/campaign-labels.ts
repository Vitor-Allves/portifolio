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

// ---- Client-facing display names ----------------------------------------
// Internal naming conventions ("[LGD - João] [ENGAJAMENTO] [WHATS] - Pag.
// Grupo Facility") leak the team's own tags and account-manager names to the
// client. A "display name" strips exactly that internal scaffolding — never
// touches the id Meta actually uses, never renames anything upstream — for
// campaigns, ad sets and ads shown to a client. Admins still see the
// original alongside it (see buildDisplayNameMap's `original` field).

/** Strips every `[...]` tag and `(...)` internal annotation, a leading
 * `#<n> ` numbering prefix, and any separator left dangling at the edges
 * once those are gone — without ever touching text in the middle. */
function stripInternalTags(raw: string): string {
  return raw
    .replace(/^#\d+\s*/, "")
    .replace(/\[[^\]]*\]/g, " ")
    .replace(/\([^)]*\)/g, " ")
    .replace(/\s{2,}/g, " ")
    .replace(/^[\s\-·]+/, "")
    .replace(/[\s\-·]+$/, "")
    .trim();
}

/** Account name as shown to clients: without the internal "CA - " business-manager prefix. */
export function displayAccountName(accountName: string): string {
  return accountName.replace(/^CA\s*-\s*/i, "").trim();
}

/** The single-item display name — see buildDisplayNameMap for the version
 * that also de-duplicates identical results across a list. */
export function baseDisplayName(rawName: string, objective: string | null, accountName: string): string {
  const stripped = stripInternalTags(rawName);
  if (stripped.length > 0) return stripped;
  return `${objectiveLabel(objective)} · ${displayAccountName(accountName)}`;
}

/**
 * Resolves display names for a whole list at once (campaigns, ad sets or
 * ads shown together on one screen/export) so two items that collide after
 * stripping tags — or that both fall back to the same objective+account —
 * get " (2)", " (3)", ... appended, in order of appearance, rather than
 * silently becoming indistinguishable.
 */
export function buildDisplayNameMap<T extends { id: string; rawName: string; objective: string | null; accountName: string }>(
  items: T[]
): Map<string, string> {
  const seenCount = new Map<string, number>();
  const result = new Map<string, string>();
  for (const item of items) {
    const base = baseDisplayName(item.rawName, item.objective, item.accountName);
    const count = (seenCount.get(base) ?? 0) + 1;
    seenCount.set(base, count);
    result.set(item.id, count === 1 ? base : `${base} (${count})`);
  }
  return result;
}
