// Personalização do CRM (especificação v1.0, Fase 1): the editable lists and
// tags, shared by the server and the screens. Pure — no database, no env.
//
// The defaults below are the seed of schema v9 (departments: v11; priorities,
// the spec's task types and colors: v13). Codes (ids) never change
// once a record uses them; only labels, order and archiving do.

export const OPTION_KINDS = [
  {
    id: "stage",
    label: "Etapas do funil",
    singular: "etapa",
    hint: "As colunas do funil, em ordem, com a probabilidade de fechamento de cada uma. Novo lead, Venda fechada e Venda perdida são fixas; as demais podem ser renomeadas, reordenadas, criadas ou arquivadas (arquivar só sem oportunidades abertas nela).",
  },
  { id: "source", label: "Origens", singular: "origem", hint: "De onde o lead veio no cadastro. A origem original nunca é trocada depois." },
  { id: "segment", label: "Segmentos", singular: "segmento", hint: "Ramo de atuação de empresas e contatos." },
  { id: "service", label: "Serviços", singular: "serviço", hint: "O que a Legado oferece: usado em interesse do contato e nas oportunidades." },
  {
    id: "lost_reason",
    label: "Motivos de encerramento",
    singular: "motivo de encerramento",
    hint: "A tabulação de quem encerra uma oportunidade sem venda: perda comercial, sem conversão (ausência de resposta, contato inválido...) ou oportunidade futura (com data para retomar).",
  },
  { id: "won_reason", label: "Motivos de ganho", singular: "motivo de ganho", hint: "Por que fechamos o negócio." },
  { id: "task_kind", label: "Tipos de tarefa", singular: "tipo de tarefa", hint: "Tipos de tarefa e atividade da agenda. A cor aparece na agenda." },
  { id: "priority", label: "Prioridades", singular: "prioridade", hint: "Prioridade das tarefas, da mais para a menos urgente (a ordem conta nos filtros)." },
  { id: "department", label: "Departamentos", singular: "departamento", hint: "Áreas da equipe, usadas em Usuários e permissões." },
] as const;

export type OptionKind = (typeof OPTION_KINDS)[number]["id"];

export function isOptionKind(v: unknown): v is OptionKind {
  return OPTION_KINDS.some((k) => k.id === v);
}

type Seed = { id: string; label: string; locked?: boolean; color?: TagColor; meta?: Record<string, unknown> };

/** What an option means beyond its name, per list (crm_options.meta, v21). */
export type StageOutcome = "open" | "won" | "lost";
export type StageMeta = { probability: number; outcome: StageOutcome };
/** Tabulação (especificação v1.0 evolução, item 5): the group of a closing reason. "positivo" is a won opportunity. */
export const CLOSE_GROUPS = [
  { id: "positivo", label: "Resultado positivo" },
  { id: "negativo", label: "Perda comercial" },
  { id: "sem_conversao", label: "Sem conversão" },
  { id: "futuro", label: "Oportunidade futura" },
] as const;
export type CloseGroup = (typeof CLOSE_GROUPS)[number]["id"];
export type LostCloseGroup = Exclude<CloseGroup, "positivo">;
export function isLostCloseGroup(v: unknown): v is LostCloseGroup {
  return v === "negativo" || v === "sem_conversao" || v === "futuro";
}
export function closeGroupLabel(id: string | null | undefined): string {
  return CLOSE_GROUPS.find((g) => g.id === id)?.label ?? "Perda comercial";
}
/** The result of a won opportunity (tabulação positiva). */
export const WON_RESULTS = [
  { id: "venda_realizada", label: "Venda realizada" },
  { id: "proposta_aprovada", label: "Proposta aprovada" },
] as const;
export type WonResult = (typeof WON_RESULTS)[number]["id"];
export function isWonResult(v: unknown): v is WonResult {
  return WON_RESULTS.some((r) => r.id === v);
}

export const DEFAULT_OPTIONS: Record<OptionKind, Seed[]> = {
  // v21 (evolução): the funnel's stages. The first six codes are the old fixed
  // stages (renamed only), so no record is rewritten.
  stage: [
    { id: "novo", label: "Novo lead", locked: true, color: "cinza", meta: { probability: 5, outcome: "open" } },
    { id: "conversa", label: "Primeiro contato", color: "azul", meta: { probability: 10, outcome: "open" } },
    { id: "reuniao", label: "Em qualificação", color: "roxo", meta: { probability: 20, outcome: "open" } },
    { id: "diagnostico", label: "Diagnóstico realizado", color: "turquesa", meta: { probability: 35, outcome: "open" } },
    { id: "elaboracao", label: "Proposta em elaboração", color: "amarelo", meta: { probability: 45, outcome: "open" } },
    { id: "proposta", label: "Proposta enviada", color: "amarelo", meta: { probability: 55, outcome: "open" } },
    { id: "negociacao", label: "Em negociação", color: "azul", meta: { probability: 70, outcome: "open" } },
    { id: "aprovacao", label: "Aguardando aprovação", color: "verde", meta: { probability: 85, outcome: "open" } },
    { id: "ganho", label: "Venda fechada", locked: true, color: "verde", meta: { probability: 100, outcome: "won" } },
    { id: "perdido", label: "Venda perdida", locked: true, color: "vermelho", meta: { probability: 0, outcome: "lost" } },
  ],
  source: [
    { id: "anuncio", label: "Tráfego pago" },
    { id: "bni", label: "BNI" },
    { id: "site", label: "Site" },
    { id: "evento", label: "Evento" },
    { id: "indicacao", label: "Indicação" },
    { id: "prospeccao_manual", label: "Prospecção manual" },
    { id: "outro", label: "Outro", locked: true },
  ],
  segment: [],
  service: [],
  // The tabulação (v21): the first six are the v9 reasons, renamed to the
  // spec's wording only where nobody had renamed them.
  lost_reason: [
    { id: "sem_orcamento", label: "Falta de orçamento", meta: { group: "negativo" } },
    { id: "concorrente", label: "Fechamento com concorrente", meta: { group: "negativo" } },
    { id: "sem_resposta", label: "Sem retorno", meta: { group: "sem_conversao" } },
    { id: "sem_perfil", label: "Serviço incompatível", meta: { group: "negativo" } },
    { id: "adiou", label: "Momento inadequado", meta: { group: "negativo" } },
    { id: "outro", label: "Outro motivo", locked: true, meta: { group: "negativo" } },
    { id: "preco", label: "Perda por preço", meta: { group: "negativo" } },
    { id: "desistencia", label: "Desistência", meta: { group: "negativo" } },
    { id: "sem_interesse", label: "Sem interesse", meta: { group: "sem_conversao" } },
    { id: "contato_invalido", label: "Contato inválido", meta: { group: "sem_conversao" } },
    { id: "desqualificado", label: "Lead desqualificado", meta: { group: "sem_conversao" } },
    { id: "duplicado", label: "Contato duplicado", meta: { group: "sem_conversao" } },
    { id: "retornar", label: "Retornar posteriormente", meta: { group: "futuro" } },
    { id: "aguardando_decisao", label: "Aguardando decisão", meta: { group: "futuro" } },
    { id: "aguardando_orcamento", label: "Aguardando orçamento", meta: { group: "futuro" } },
    { id: "retomar_data", label: "Retomar em data programada", meta: { group: "futuro" } },
  ],
  won_reason: [
    { id: "resultado", label: "Confiança nos resultados apresentados" },
    { id: "indicacao", label: "Indicação de cliente" },
    { id: "preco", label: "Preço e condições" },
    { id: "atendimento", label: "Atendimento" },
    { id: "outro", label: "Outro motivo", locked: true },
  ],
  // The first five are the v9 seed; the rest (and every color) come with v13 (Fase 3).
  task_kind: [
    { id: "ligacao", label: "Ligação", color: "azul" },
    { id: "reuniao", label: "Reunião", color: "roxo" },
    { id: "whatsapp", label: "WhatsApp", color: "verde" },
    { id: "email", label: "E-mail", color: "turquesa" },
    { id: "tarefa", label: "Tarefa", locked: true, color: "cinza" },
    { id: "primeiro_contato", label: "Primeiro contato", color: "azul" },
    { id: "follow_up", label: "Follow-up", color: "turquesa" },
    { id: "preparacao_proposta", label: "Preparação de proposta", color: "amarelo" },
    { id: "envio_proposta", label: "Envio de proposta", color: "amarelo" },
    { id: "retorno_comercial", label: "Retorno comercial", color: "verde" },
    { id: "acompanhamento_cliente", label: "Acompanhamento de cliente", color: "verde" },
    { id: "atividade_interna", label: "Atividade interna", color: "cinza" },
  ],
  // Seeded by schema v13 (Fase 3). "media" is what a task gets when none is chosen.
  priority: [
    { id: "alta", label: "Alta", color: "vermelho" },
    { id: "media", label: "Média", locked: true, color: "amarelo" },
    { id: "baixa", label: "Baixa", color: "cinza" },
  ],
  // Seeded by schema v11 (Fase 2); editable like any list.
  department: [
    { id: "comercial", label: "Comercial" },
    { id: "marketing", label: "Marketing" },
    { id: "operacao", label: "Operação" },
    { id: "atendimento", label: "Atendimento" },
    { id: "diretoria", label: "Diretoria" },
  ],
};

/** What a record gets when its own value is missing or no longer valid. */
export const OPTION_FALLBACK: Partial<Record<OptionKind, string>> = { source: "outro", lost_reason: "outro", won_reason: "outro", task_kind: "tarefa", priority: "media" };

/** Lists whose options carry a color (agenda and chips). */
export const COLORED_KINDS: readonly OptionKind[] = ["stage", "task_kind", "priority"];

/** The v9 names of the reasons renamed by v21 (only renamed where still unchanged). */
export const LOST_REASON_OLD_LABELS: Record<string, string> = {
  sem_orcamento: "Sem orçamento",
  concorrente: "Escolheu outra empresa",
  sem_resposta: "Parou de responder",
  sem_perfil: "Sem perfil para o serviço",
  adiou: "Adiou o projeto",
};

export const TAG_CATEGORIES = [
  { id: "origem", label: "Origem", hint: "Todos os caminhos por onde o lead chegou (pode ter vários)." },
  { id: "acao", label: "Ação", hint: "O que foi feito com o lead." },
  { id: "classificacao", label: "Classificação", hint: "Situação do lead. Temperatura (frio, morno, quente) é um campo à parte." },
  { id: "atendimento", label: "Atendimento", hint: "Situação da conversa no WhatsApp (aguardando cliente, dúvida, suporte...)." },
] as const;

export type TagCategory = (typeof TAG_CATEGORIES)[number]["id"];

export function isTagCategory(v: unknown): v is TagCategory {
  return TAG_CATEGORIES.some((c) => c.id === v);
}

export const TAG_COLORS = [
  { id: "azul", label: "Azul" },
  { id: "verde", label: "Verde" },
  { id: "amarelo", label: "Amarelo" },
  { id: "vermelho", label: "Vermelho" },
  { id: "roxo", label: "Roxo" },
  { id: "turquesa", label: "Turquesa" },
  { id: "cinza", label: "Cinza" },
] as const;

export type TagColor = (typeof TAG_COLORS)[number]["id"];

export function isTagColor(v: unknown): v is TagColor {
  return TAG_COLORS.some((c) => c.id === v);
}

export const DEFAULT_TAGS: { id: string; category: TagCategory; label: string; color: TagColor }[] = [
  { id: "origem-trafego-pago", category: "origem", label: "Tráfego pago", color: "azul" },
  { id: "origem-indicacao", category: "origem", label: "Indicação", color: "verde" },
  { id: "origem-prospeccao-manual", category: "origem", label: "Prospecção manual", color: "roxo" },
  { id: "origem-site", category: "origem", label: "Site", color: "turquesa" },
  { id: "origem-evento", category: "origem", label: "Evento", color: "amarelo" },
  { id: "origem-bni", category: "origem", label: "BNI", color: "vermelho" },
  { id: "origem-outros", category: "origem", label: "Outros", color: "cinza" },
  { id: "acao-contato-manual", category: "acao", label: "Contato manual", color: "roxo" },
  { id: "acao-disparo-comercial", category: "acao", label: "Disparo comercial", color: "azul" },
  { id: "acao-formulario", category: "acao", label: "Formulário", color: "turquesa" },
  { id: "acao-campanha", category: "acao", label: "Campanha", color: "amarelo" },
  { id: "acao-retorno-espontaneo", category: "acao", label: "Retorno espontâneo", color: "verde" },
  { id: "classificacao-cliente-ativo", category: "classificacao", label: "Cliente ativo", color: "verde" },
  { id: "classificacao-em-negociacao", category: "classificacao", label: "Em negociação", color: "amarelo" },
  // v15 (Fase 4): etiquetas de atendimento.
  { id: "atendimento-aguardando-cliente", category: "atendimento", label: "Aguardando cliente", color: "amarelo" },
  { id: "atendimento-duvida", category: "atendimento", label: "Dúvida", color: "azul" },
  { id: "atendimento-suporte", category: "atendimento", label: "Suporte", color: "turquesa" },
  { id: "atendimento-reclamacao", category: "atendimento", label: "Reclamação", color: "vermelho" },
  { id: "atendimento-urgente", category: "atendimento", label: "Urgente", color: "roxo" },
];

/** How a tag got onto a contact. */
export const TAG_VIA = [
  { id: "manual", label: "manual" },
  { id: "importacao", label: "importação" },
  { id: "campanha", label: "campanha" },
  { id: "automacao", label: "automação" },
] as const;

export type TagVia = (typeof TAG_VIA)[number]["id"];

export type CrmOption = {
  kind: OptionKind;
  id: string;
  label: string;
  description: string | null;
  sort: number;
  locked: boolean;
  archived: boolean;
  /** Only for COLORED_KINDS (null elsewhere). */
  color: TagColor | null;
  /** Per-list attributes: stage → StageMeta; lost_reason → { group }; service → its catalog details. */
  meta: Record<string, unknown>;
};

/** A stage's meaning (probability, open / won / lost) from its option. */
export function stageMeta(o: Pick<CrmOption, "id" | "meta"> | undefined): StageMeta {
  const m = (o?.meta ?? {}) as Partial<StageMeta>;
  const outcome: StageOutcome = o?.id === "ganho" ? "won" : o?.id === "perdido" ? "lost" : "open";
  const p = typeof m.probability === "number" && m.probability >= 0 && m.probability <= 100 ? Math.round(m.probability) : outcome === "won" ? 100 : outcome === "lost" ? 0 : 10;
  return { probability: p, outcome };
}
/** The tabulação group of a closing reason. */
export function reasonGroup(o: Pick<CrmOption, "meta"> | undefined): LostCloseGroup {
  const g = (o?.meta as { group?: unknown } | undefined)?.group;
  return isLostCloseGroup(g) ? g : "negativo";
}
export type CrmTag = { id: string; category: TagCategory; label: string; description: string | null; color: TagColor; sort: number; archived: boolean };
/** Every option and tag, archived ones included (old records still need their labels). */
export type CrmCatalog = { options: CrmOption[]; tags: CrmTag[] };

/** For the Personalização screen: how many records use each option / tag. */
export type CrmCatalogUsage = { options: Record<string, number>; tags: Record<string, number> };
export const usageKey = (kind: string, id: string) => `${kind}:${id}`;

/** Accent/case/punctuation-insensitive key, for matching typed text to a label. */
export function foldLabel(text: string): string {
  return text
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** A stable code from a label: "Prospecção manual" → "prospeccao_manual". */
export function slugFromLabel(label: string): string {
  return foldLabel(label).replace(/ /g, "_").slice(0, 40) || "opcao";
}

export const CATALOG_DEFAULT: CrmCatalog = {
  options: (Object.entries(DEFAULT_OPTIONS) as [OptionKind, Seed[]][]).flatMap(([kind, list]) =>
    list.map((o, i) => ({
      kind,
      id: o.id,
      label: o.label,
      description: null,
      sort: i,
      locked: o.locked ?? false,
      archived: false,
      color: COLORED_KINDS.includes(kind) ? (o.color ?? "cinza") : null,
      meta: o.meta ?? {},
    }))
  ),
  tags: DEFAULT_TAGS.map((t, i) => ({ ...t, description: null, sort: i, archived: false })),
};
