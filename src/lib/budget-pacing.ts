// Pure math shared by the admin budget form and the live "Orçamento do mês"
// card — no server imports, safe in a client component.

export type PacingStatus = "no-ritmo" | "acima" | "abaixo";

export const PACING_LABEL: Record<PacingStatus, string> = {
  "no-ritmo": "No ritmo",
  acima: "Acima do ritmo",
  abaixo: "Abaixo do ritmo",
};

/** Projection to month-end = spend so far ÷ days elapsed × days in the month. */
export function projectedSpend(spendMonthToDate: number, dayOfMonth: number, daysInMonth: number): number {
  if (dayOfMonth <= 0) return 0;
  return (spendMonthToDate / dayOfMonth) * daysInMonth;
}

/** 90%–110% of budget = "no ritmo"; above is "acima", below is "abaixo". */
export function pacingStatus(projected: number, budget: number): PacingStatus {
  if (budget <= 0) return "acima";
  const ratio = projected / budget;
  if (ratio > 1.1) return "acima";
  if (ratio < 0.9) return "abaixo";
  return "no-ritmo";
}
