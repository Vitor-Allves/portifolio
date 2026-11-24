// The diagnóstico comercial's fields (evolução v1.0, item 2.3) — pure, shared
// by the server (crm-diagnostics.ts) and the screens.

/** The form's fields, in the spec's order. */
export const DIAGNOSIS_FIELDS = [
  { id: "need", label: "Principal necessidade", kind: "text" },
  { id: "problem", label: "Problema identificado", kind: "text" },
  { id: "goal", label: "Objetivo desejado", kind: "text" },
  { id: "currentServices", label: "Serviços utilizados atualmente", kind: "text" },
  { id: "currentInvestment", label: "Investimento atual (R$/mês)", kind: "money" },
  { id: "budget", label: "Orçamento disponível (R$/mês)", kind: "money" },
  { id: "urgency", label: "Urgência da contratação", kind: "urgency" },
  { id: "decisionMaker", label: "Responsável pela decisão", kind: "line" },
  { id: "objections", label: "Objeções comerciais", kind: "text" },
  { id: "competitors", label: "Concorrentes envolvidos", kind: "text" },
  { id: "nextSteps", label: "Próximos passos", kind: "text" },
] as const;
export type DiagnosisFieldId = (typeof DIAGNOSIS_FIELDS)[number]["id"];
export const URGENCIES = [
  { id: "alta", label: "Alta (este mês)" },
  { id: "media", label: "Média (próximos 3 meses)" },
  { id: "baixa", label: "Baixa (sem prazo)" },
] as const;

/** Stored values: texts, money in centavos, urgency code. */
export type DiagnosisData = Partial<Record<DiagnosisFieldId, string | number | null>>;

export type CrmDiagnosis = {
  id: string;
  contactId: string;
  dealId: string | null;
  dealTitle: string | null;
  version: number;
  data: DiagnosisData;
  createdByName: string | null;
  createdAt: string;
};
