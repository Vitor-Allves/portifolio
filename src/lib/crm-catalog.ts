// Personalização do CRM (especificação v1.0, Fase 1): the editable lists and
// tags, shared by the server and the screens. Pure — no database, no env.
//
// The defaults below are the seed of schema v9 (departments: v11). Codes (ids) never change
// once a record uses them; only labels, order and archiving do.

export const OPTION_KINDS = [
  { id: "source", label: "Origens", singular: "origem", hint: "De onde o lead veio no cadastro. A origem original nunca é trocada depois." },
  { id: "segment", label: "Segmentos", singular: "segmento", hint: "Ramo de atuação de empresas e contatos." },
  { id: "service", label: "Serviços", singular: "serviço", hint: "O que a Legado oferece: usado em interesse do contato e nas oportunidades." },
  { id: "lost_reason", label: "Motivos de perda", singular: "motivo de perda", hint: "Perguntado quando uma oportunidade vai para Perdido." },
  { id: "won_reason", label: "Motivos de ganho", singular: "motivo de ganho", hint: "Por que fechamos o negócio." },
  { id: "task_kind", label: "Tipos de tarefa", singular: "tipo de tarefa", hint: "Tipos de tarefa e atividade da agenda." },
  { id: "department", label: "Departamentos", singular: "departamento", hint: "Áreas da equipe, usadas em Usuários e permissões." },
] as const;

export type OptionKind = (typeof OPTION_KINDS)[number]["id"];

export function isOptionKind(v: unknown): v is OptionKind {
  return OPTION_KINDS.some((k) => k.id === v);
}

type Seed = { id: string; label: string; locked?: boolean };

export const DEFAULT_OPTIONS: Record<OptionKind, Seed[]> = {
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
  lost_reason: [
    { id: "sem_orcamento", label: "Sem orçamento" },
    { id: "concorrente", label: "Escolheu outra empresa" },
    { id: "sem_resposta", label: "Parou de responder" },
    { id: "sem_perfil", label: "Sem perfil para o serviço" },
    { id: "adiou", label: "Adiou o projeto" },
    { id: "outro", label: "Outro motivo", locked: true },
  ],
  won_reason: [
    { id: "resultado", label: "Confiança nos resultados apresentados" },
    { id: "indicacao", label: "Indicação de cliente" },
    { id: "preco", label: "Preço e condições" },
    { id: "atendimento", label: "Atendimento" },
    { id: "outro", label: "Outro motivo", locked: true },
  ],
  task_kind: [
    { id: "ligacao", label: "Ligação" },
    { id: "reuniao", label: "Reunião" },
    { id: "whatsapp", label: "WhatsApp" },
    { id: "email", label: "E-mail" },
    { id: "tarefa", label: "Tarefa", locked: true },
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
export const OPTION_FALLBACK: Partial<Record<OptionKind, string>> = { source: "outro", lost_reason: "outro", won_reason: "outro", task_kind: "tarefa" };

export const TAG_CATEGORIES = [
  { id: "origem", label: "Origem", hint: "Todos os caminhos por onde o lead chegou (pode ter vários)." },
  { id: "acao", label: "Ação", hint: "O que foi feito com o lead." },
  { id: "classificacao", label: "Classificação", hint: "Situação do lead. Temperatura (frio, morno, quente) é um campo à parte." },
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
];

/** How a tag got onto a contact. */
export const TAG_VIA = [
  { id: "manual", label: "manual" },
  { id: "importacao", label: "importação" },
  { id: "campanha", label: "campanha" },
  { id: "automacao", label: "automação" },
] as const;

export type TagVia = (typeof TAG_VIA)[number]["id"];

export type CrmOption = { kind: OptionKind; id: string; label: string; description: string | null; sort: number; locked: boolean; archived: boolean };
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
    list.map((o, i) => ({ kind, id: o.id, label: o.label, description: null, sort: i, locked: o.locked ?? false, archived: false }))
  ),
  tags: DEFAULT_TAGS.map((t, i) => ({ ...t, description: null, sort: i, archived: false })),
};
