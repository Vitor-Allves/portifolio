// Financeiro comercial e comissões (evolução v1.0, item 10): what the screen
// and the exports show. Gerencial: the CRM calculates, it doesn't bill or pay.

export type CrmCommissionRule = {
  id: string;
  name: string;
  /** null = every salesperson. */
  userId: string | null;
  userName: string | null;
  /** A service of the catalog, or null = any service. */
  service: string | null;
  /** "mensal" (the monthly part), "unico" (one-time part), or null = both. */
  billing: "mensal" | "unico" | null;
  percent: number;
  /** For the monthly part: how many monthly payments count (1 = the first). */
  months: number;
  archivedAt: string | null;
};

export type CrmCommissionRow = {
  contractId: string;
  contractNumber: number;
  clientId: string;
  clientName: string;
  sellerId: string | null;
  sellerName: string | null;
  soldOn: string;
  monthlyCents: number;
  oneTimeCents: number;
  /** Rule names applied to the monthly and the one-time part. */
  monthlyRule: string | null;
  oneTimeRule: string | null;
  commissionCents: number;
};

export type CrmInstallment = { month: string; clientId: string; clientName: string; contractNumber: number; kind: "mensal" | "unico"; cents: number };

export type CrmFinance = {
  from: string;
  to: string;
  ownerId: string | null;
  /** Won opportunities in the period (negotiated value, else the estimate). */
  sold: { count: number; cents: number };
  /** Contracts sold in the period: new monthly revenue and one-time revenue. */
  newMonthlyCents: number;
  oneTimeCents: number;
  /** Today: vigente contracts and their monthly revenue. */
  active: { contracts: number; monthlyCents: number };
  /** Open opportunities: total and weighted by probability. */
  pipeline: { cents: number; weightedCents: number };
  /** What vigente monthly contracts will bill in the next 12 months (until each one ends). */
  contractedNext12Cents: number;
  /** Discounts of the proposals approved in the period. */
  discounts: { proposals: number; cents: number; avgPct: number };
  /** Contracts cancelled or ended in the period. */
  cancellations: {
    count: number;
    monthlyCents: number;
    rows: { contractNumber: number; clientName: string; status: string; monthlyCents: number; on: string }[];
  };
  /** Lost in the period: opportunities (estimated value) and cancelled monthly revenue. */
  lost: { deals: number; dealsCents: number };
  /** Next 6 months of expected charges. */
  installments: CrmInstallment[];
  commissions: {
    rows: CrmCommissionRow[];
    bySeller: { sellerId: string | null; sellerName: string | null; contracts: number; commissionCents: number }[];
    totalCents: number;
  };
};
