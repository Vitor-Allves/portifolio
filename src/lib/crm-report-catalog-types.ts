// Relatórios (evolução v1.0, item 14): the reports the Relatórios section
// offers besides the Tabulação comercial, what each one filters by and what
// it returns. Shared by the server and the screen.

export const CRM_REPORTS = [
  {
    id: "funil",
    label: "Funil comercial",
    hint: "Oportunidades abertas por etapa agora, com a probabilidade e o valor ponderado, e as ganhas e perdidas no período.",
    period: true,
    source: true,
  },
  {
    id: "vendas",
    label: "Vendas por período",
    hint: "Cada oportunidade ganha no período: quando, de quem, a origem, o serviço e o valor negociado.",
    period: true,
    source: true,
  },
  {
    id: "vendedores",
    label: "Vendas por vendedor",
    hint: "Por pessoa: ganhos, valor vendido, ticket médio, perdas, conversão e propostas no período.",
    period: true,
    source: false,
  },
  {
    id: "propostas",
    label: "Propostas enviadas e aprovadas",
    hint: "Propostas enviadas pela primeira vez ou decididas no período, com a situação de cada uma e a taxa de aprovação.",
    period: true,
    source: false,
  },
  {
    id: "propostas_expiradas",
    label: "Propostas expiradas",
    hint: "Propostas que passaram da validade sem decisão, pela data de validade.",
    period: true,
    source: false,
  },
  {
    id: "perdas",
    label: "Motivos de perda",
    hint: "Perdas comerciais e sem conversão no período, por motivo (oportunidades futuras não contam).",
    period: true,
    source: true,
  },
  {
    id: "produtividade",
    label: "Produtividade",
    hint: "Por pessoa: leads, trabalhados, reuniões, follow-ups, propostas, vendas, perdas, conversão e tarefas no período.",
    period: true,
    source: false,
  },
  {
    id: "clientes",
    label: "Clientes ativos",
    hint: "Clientes em onboarding, ativos ou pausados hoje, com os contratos vigentes e a receita mensal.",
    period: false,
    source: false,
  },
  {
    id: "contratos_vencimento",
    label: "Contratos próximos do vencimento",
    hint: "Contratos vigentes que terminam nos próximos dias (e os que já passaram da data e seguem vigentes).",
    period: false,
    source: false,
    days: true,
  },
  {
    id: "receita",
    label: "Receita recorrente",
    hint: "Receita mensal contratada hoje (contratos mensais vigentes), por cliente.",
    period: false,
    source: false,
  },
  { id: "comissoes", label: "Comissões", hint: "Comissão de cada contrato vendido no período, pelas regras do Financeiro.", period: true, source: false },
  {
    id: "origens",
    label: "Resultados por origem",
    hint: "Por origem: leads, oportunidades, propostas, aprovações, vendas e valor vendido no período.",
    period: true,
    source: false,
  },
  {
    id: "anuncios",
    label: "Resultados por anúncio",
    hint: "Leads que chegaram por anúncio de clique para o WhatsApp no período, por anúncio, e o que viraram até hoje.",
    period: true,
    source: false,
  },
  {
    id: "campanhas",
    label: "Resultados das campanhas",
    hint: "Campanhas de WhatsApp iniciadas no período: envio, leitura, respostas, interessados e oportunidades.",
    period: true,
    source: false,
  },
] as const;

export type CrmReportId = (typeof CRM_REPORTS)[number]["id"];
export function isCrmReportId(v: unknown): v is CrmReportId {
  return CRM_REPORTS.some((r) => r.id === v);
}
export function crmReportDef(id: CrmReportId) {
  return CRM_REPORTS.find((r) => r.id === id)!;
}

/** How a column reads: money in cents, pct as a fraction (0.5 = 50%), date YYYY-MM-DD, days a signed count. */
export type CrmReportColumnKind = "text" | "int" | "money" | "pct" | "date" | "days";
export type CrmReportColumn = { label: string; kind: CrmReportColumnKind };
export type CrmReportCell = string | number | null;
export type CrmReportRow = { cells: CrmReportCell[]; contactId?: string | null; clientId?: string | null };

export type CrmReportResult = {
  id: CrmReportId;
  title: string;
  /** Inclusive Brasília days; null for reports about today. */
  from: string | null;
  to: string | null;
  /** The filters applied, in words. */
  filters: string[];
  summary: { label: string; kind: CrmReportColumnKind; value: CrmReportCell }[];
  columns: CrmReportColumn[];
  rows: CrmReportRow[];
  /** The column whose cell opens the row's lead / client (default: the first text column). */
  linkColumn?: number;
  /** A totals line under the table (same columns), or null. */
  totals: CrmReportCell[] | null;
  /** How it was counted. */
  note: string;
  /** More rows than the report shows (the summary counts them all). */
  truncated: boolean;
};

/** Most rows a report lists. */
export const REPORT_ROWS_LIMIT = 1000;

/**
 * A cell as text: "sheet" for the planilha (money as 1234,56, so it sums),
 * "print" for the screen and the PDF (R$ 1.234,56).
 */
export function reportCellText(kind: CrmReportColumnKind, v: CrmReportCell, mode: "sheet" | "print"): string {
  if (v === null || v === undefined || v === "") return mode === "sheet" ? "" : "—";
  if (typeof v === "string" && kind !== "date") return v;
  switch (kind) {
    case "money":
      return mode === "sheet"
        ? (Number(v) / 100).toFixed(2).replace(".", ",")
        : new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(Number(v) / 100);
    case "pct":
      return `${Math.round(Number(v) * 100)}%`;
    case "date":
      return String(v).slice(0, 10).split("-").reverse().join("/");
    case "days": {
      const d = Number(v);
      return mode === "sheet" ? String(d) : d < 0 ? `vencido há ${-d} d` : d === 0 ? "hoje" : `${d} d`;
    }
    default:
      return String(v);
  }
}
