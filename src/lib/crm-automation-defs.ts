// Automações do CRM (especificação v1.0, módulo 9): the ten rules the spec
// lists, each with its trigger, condition, action and the parameters an
// Administrador may adjust (prazo, responsável, tipo de tarefa...). Pure —
// shared by the server and the screens. Automations never send messages:
// they create tasks, reminders, history lines and notices in the bell.

export const AUTOMATION_STATUSES = [
  { id: "ativa", label: "Ativa" },
  { id: "pausada", label: "Pausada" },
  { id: "desativada", label: "Desativada" },
] as const;
export type AutomationStatus = (typeof AUTOMATION_STATUSES)[number]["id"];
export function isAutomationStatus(v: unknown): v is AutomationStatus {
  return AUTOMATION_STATUSES.some((s) => s.id === v);
}

export type AutomationId =
  | "novo_lead"
  | "lead_atribuido"
  | "lead_sem_movimentacao"
  | "reuniao_agendada"
  | "proposta_enviada"
  | "lead_sem_resposta"
  | "cliente_onboarding"
  | "renovacao_contrato"
  | "cliente_sem_atualizacao"
  | "resposta_campanha";

/** Every adjustable parameter; each automation uses some of them (`fields`). */
export type AutomationConfig = {
  /** crm_options id (task_kind). */
  taskKind?: string;
  title?: string;
  /** Task due this many days after the trigger (0 = same day). */
  dueDays?: number;
  /** crm_options id (priority). */
  priority?: string;
  /** Who gets the task / notice: "lead" = the lead's (or opportunity's) owner, or a user id. */
  owner?: string;
  /** When the lead has no owner: a user id, or null = nobody (task without owner / no notice). */
  fallbackOwnerId?: string | null;
  /** Days without movement / without an answer / before a contract ends (scheduled checks). */
  days?: number;
  /** From this day of the month on, a client without the month's acompanhamento gets a task (1–28). */
  dayOfMonth?: number;
  /** Meeting reminder, minutes before (all-day meetings: 08:00 that day). */
  reminderMinutes?: number;
  /** Temperature to set on a campaign reply ("" = leave as is). */
  temperature?: string;
  notifyOwner?: boolean;
  /** Only leads from these origins ([] = all). */
  sources?: string[];
};

export type AutomationField = keyof AutomationConfig;

export type AutomationDef = {
  id: AutomationId;
  /** The spec's number (1–10). */
  number: number;
  name: string;
  trigger: string;
  condition: string;
  action: string;
  /** Runs on the daily check instead of on an event. */
  scheduled: boolean;
  /** false = not ready to be turned on yet. */
  available: boolean;
  fields: AutomationField[];
  defaults: AutomationConfig;
};

export const AUTOMATION_DEFS: AutomationDef[] = [
  {
    id: "novo_lead",
    number: 1,
    name: "Novo lead: tarefa de primeiro contato",
    trigger: "Um lead novo entra no CRM (cadastro manual ou primeira mensagem no WhatsApp).",
    condition: "Origem: todas ou só as escolhidas. Importações de planilha ficam de fora.",
    action: "Cria a tarefa de primeiro contato na oportunidade aberta do lead.",
    scheduled: false,
    available: true,
    fields: ["taskKind", "title", "dueDays", "priority", "owner", "fallbackOwnerId", "sources"],
    defaults: { taskKind: "primeiro_contato", title: "Primeiro contato", dueDays: 0, priority: "alta", owner: "lead", fallbackOwnerId: null, sources: [] },
  },
  {
    id: "lead_atribuido",
    number: 2,
    name: "Lead atribuído: avisar o responsável",
    trigger: "O responsável de um lead muda (no cadastro, no contato, em lote ou na transferência de carteira).",
    condition: "Não avisa quem atribuiu o lead a si mesmo. Em lote, um só aviso por pessoa.",
    action: "Aviso no sino do novo responsável.",
    scheduled: false,
    available: true,
    fields: [],
    defaults: {},
  },
  {
    id: "lead_sem_movimentacao",
    number: 3,
    name: "Lead sem movimentação: alerta",
    trigger: "Verificação diária.",
    condition: "Oportunidade aberta parada na mesma etapa há X dias, sem mensagem nem tarefa concluída nesse período.",
    action: "Alerta no sino do responsável, uma vez para cada parada.",
    scheduled: true,
    available: true,
    fields: ["days", "owner", "fallbackOwnerId"],
    defaults: { days: 7, owner: "lead", fallbackOwnerId: null },
  },
  {
    id: "reuniao_agendada",
    number: 4,
    name: "Reunião agendada: lembrete",
    trigger: "Uma tarefa de reunião é criada com data.",
    condition: "Só quando quem criou não escolheu um lembrete.",
    action: "Põe o lembrete no sino do responsável (reunião de dia todo: no dia, às 8h).",
    scheduled: false,
    available: true,
    fields: ["taskKind", "reminderMinutes"],
    defaults: { taskKind: "reuniao", reminderMinutes: 60 },
  },
  {
    id: "proposta_enviada",
    number: 5,
    name: "Proposta enviada: follow-up",
    trigger: "Uma oportunidade entra em Proposta enviada.",
    condition: "A oportunidade ainda não tem uma tarefa pendente desse tipo.",
    action: "Cria a tarefa de follow-up para daqui a X dias.",
    scheduled: false,
    available: true,
    fields: ["taskKind", "title", "dueDays", "priority", "owner", "fallbackOwnerId"],
    defaults: { taskKind: "follow_up", title: "Follow-up da proposta", dueDays: 3, priority: "media", owner: "lead", fallbackOwnerId: null },
  },
  {
    id: "lead_sem_resposta",
    number: 6,
    name: "Lead sem resposta: tarefa de acompanhamento",
    trigger: "Verificação diária.",
    condition:
      "A última mensagem da conversa foi nossa (não de campanha), há X dias ou mais, sem resposta; o lead tem oportunidade aberta e nenhuma tarefa pendente.",
    action: "Cria a tarefa de acompanhamento para hoje.",
    scheduled: true,
    available: true,
    fields: ["days", "taskKind", "title", "priority", "owner", "fallbackOwnerId"],
    defaults: { days: 3, taskKind: "follow_up", title: "Retomar contato (sem resposta)", priority: "media", owner: "lead", fallbackOwnerId: null },
  },
  {
    id: "cliente_onboarding",
    number: 7,
    name: "Lead convertido em cliente: onboarding",
    trigger: "Uma oportunidade é ganha.",
    condition: "O contato tem empresa. Se a empresa já é cliente, a oportunidade vira um contrato novo dela (sem onboarding).",
    action: "Cadastra o cliente em Onboarding (serviço e valor negociado como contrato) e cria a tarefa de onboarding para o responsável.",
    scheduled: false,
    available: true,
    fields: ["taskKind", "title", "dueDays", "priority", "fallbackOwnerId"],
    defaults: { taskKind: "acompanhamento_cliente", title: "Onboarding do cliente", dueDays: 2, priority: "alta", fallbackOwnerId: null },
  },
  {
    id: "renovacao_contrato",
    number: 8,
    name: "Contrato perto da renovação: alerta",
    trigger: "Verificação diária.",
    condition: "Contrato vigente de um cliente que termina nos próximos X dias.",
    action: "Aviso no sino do responsável pelo cliente, uma vez para cada data de fim.",
    scheduled: true,
    available: true,
    fields: ["days", "fallbackOwnerId"],
    defaults: { days: 30, fallbackOwnerId: null },
  },
  {
    id: "cliente_sem_atualizacao",
    number: 9,
    name: "Cliente sem atualização mensal: tarefa",
    trigger: "Verificação diária, a partir do dia X do mês.",
    condition: "Cliente em Onboarding ou Ativo sem o acompanhamento do mês registrado.",
    action: "Cria a tarefa de atualização para o responsável pelo cliente, uma por mês.",
    scheduled: true,
    available: true,
    fields: ["dayOfMonth", "taskKind", "title", "priority", "fallbackOwnerId"],
    defaults: { dayOfMonth: 25, taskKind: "acompanhamento_cliente", title: "Atualizar o acompanhamento do mês", priority: "media", fallbackOwnerId: null },
  },
  {
    id: "resposta_campanha",
    number: 10,
    name: "Resposta de campanha: registrar e sinalizar interesse",
    trigger: "O contato responde no WhatsApp até 3 dias depois de receber uma campanha.",
    condition: "Só a primeira resposta a cada campanha.",
    action: "Registra no histórico do contato, marca a temperatura e avisa o responsável.",
    scheduled: false,
    available: true,
    fields: ["temperature", "notifyOwner"],
    defaults: { temperature: "quente", notifyOwner: true },
  },
];

export function automationDef(id: string): AutomationDef | undefined {
  return AUTOMATION_DEFS.find((a) => a.id === id);
}

/** An automation as the screens see it. */
export type CrmAutomation = {
  id: AutomationId;
  status: AutomationStatus;
  /** Defaults merged with what was saved. */
  config: AutomationConfig;
  lastRunAt: string | null;
  lastRunSummary: AutomationRunSummary | null;
  updatedByName: string | null;
  updatedAt: string;
};

export type AutomationRunSummary = { ok: number; ignored: number; failed: number; more: boolean };

export type CrmAutomationRun = {
  id: string;
  automationId: AutomationId;
  status: "ok" | "ignorada" | "falha";
  detail: string | null;
  contactId: string | null;
  contactName: string | null;
  at: string;
};

export type CrmNotification = {
  id: string;
  kind: string;
  title: string;
  body: string | null;
  contactId: string | null;
  /** A notice about a client of Clientes ativos (opens the client). */
  clientId: string | null;
  at: string;
};

/** Daily check: is the scheduled run set up on the server (CRON_SECRET), and when did it last run. */
export type AutomationSchedule = { configured: boolean };
