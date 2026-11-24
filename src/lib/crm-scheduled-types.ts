// Mensagens agendadas (evolução v1.0, item 11): what the conversation panel
// shows. Kept apart from the server module so the screens can import it.

export const SCHEDULED_STATUSES = ["pendente", "enviando", "enviada", "cancelada", "falhou"] as const;
export type CrmScheduledStatus = (typeof SCHEDULED_STATUSES)[number];

/** How far ahead a message can be scheduled. */
export const SCHEDULE_MAX_DAYS = 30;

export type CrmScheduledMessage = {
  id: string;
  contactId: string;
  kind: "text" | "template";
  body: string | null;
  templateName: string | null;
  templateLanguage: string | null;
  templateParams: string[];
  sendAt: string;
  status: CrmScheduledStatus;
  error: string | null;
  createdById: string | null;
  createdByName: string | null;
  createdAt: string;
  sentAt: string | null;
  canceledByName: string | null;
};

export const SCHEDULED_STATUS_LABEL: Record<CrmScheduledStatus, string> = {
  pendente: "Agendada",
  enviando: "Enviando",
  enviada: "Enviada",
  cancelada: "Cancelada",
  falhou: "Não enviada",
};
