// Operação dos clientes ativos (evolução v1.0, itens 8 e 9): the onboarding
// checklist, deliverables, satisfaction and the contract's extra details —
// types and lists shared by the server and the screens.

export const ONBOARDING_ITEMS = [
  { id: "reuniao_inicial", label: "Reunião inicial" },
  { id: "briefing", label: "Briefing" },
  { id: "documentacao", label: "Documentação" },
  { id: "acessos", label: "Acessos" },
  { id: "materiais", label: "Materiais" },
  { id: "responsaveis", label: "Definição de responsáveis" },
  { id: "cronograma", label: "Cronograma" },
  { id: "inicio_execucao", label: "Início da execução" },
] as const;

export const DELIVERABLE_STATUSES = [
  { id: "pendente", label: "Pendente" },
  { id: "em_andamento", label: "Em andamento" },
  { id: "entregue", label: "Entregue" },
  { id: "cancelado", label: "Cancelado" },
] as const;
export type DeliverableStatus = (typeof DELIVERABLE_STATUSES)[number]["id"];
export function isDeliverableStatus(v: unknown): v is DeliverableStatus {
  return DELIVERABLE_STATUSES.some((s) => s.id === v);
}

export const CONTRACT_RENEWALS = [
  { id: "automatica", label: "Renovação automática" },
  { id: "manual", label: "Renovação negociada" },
  { id: "sem_renovacao", label: "Sem renovação" },
] as const;
export type ContractRenewal = (typeof CONTRACT_RENEWALS)[number]["id"];
export function isContractRenewal(v: unknown): v is ContractRenewal {
  return CONTRACT_RENEWALS.some((s) => s.id === v);
}

export type CrmOnboardingItem = {
  id: string;
  item: string;
  label: string;
  ownerId: string | null;
  ownerName: string | null;
  dueOn: string | null;
  doneAt: string | null;
  doneByName: string | null;
  note: string | null;
};

export type CrmDeliverable = {
  id: string;
  contractId: string | null;
  service: string | null;
  title: string;
  description: string | null;
  ownerId: string | null;
  ownerName: string | null;
  dueOn: string | null;
  status: DeliverableStatus;
  /** Not delivered and past its date (Brasília). */
  late: boolean;
  deliveredAt: string | null;
  createdByName: string | null;
  updatedAt: string;
};

export type CrmSatisfaction = { id: string; score: number; comment: string | null; recordedByName: string | null; createdAt: string };

export type CrmClientOperation = {
  onboarding: CrmOnboardingItem[];
  deliverables: CrmDeliverable[];
  satisfaction: CrmSatisfaction[];
  /** Average of the recorded scores (0–10), one decimal. */
  satisfactionAvg: number | null;
};

/** 9–10 promotor, 7–8 neutro, 0–6 detrator (the usual NPS reading). */
export function satisfactionBand(score: number): "promotor" | "neutro" | "detrator" {
  return score >= 9 ? "promotor" : score >= 7 ? "neutro" : "detrator";
}
