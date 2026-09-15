const currencyFormatter = new Intl.NumberFormat("pt-BR", {
  style: "currency",
  currency: "BRL",
});

const compactNumberFormatter = new Intl.NumberFormat("pt-BR", {
  notation: "compact",
  maximumFractionDigits: 1,
});

const integerFormatter = new Intl.NumberFormat("pt-BR");

export function formatCurrencyBRL(value: number): string {
  return currencyFormatter.format(value);
}

export function formatCompactNumber(value: number): string {
  return compactNumberFormatter.format(value);
}

export function formatInteger(value: number): string {
  return integerFormatter.format(Math.round(value));
}

export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

export function formatSignedPercent(value: number, digits = 1): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits)}%`;
}

/** For a metric that's itself already a percentage (CTR), the comparison delta must read in percentage points, not a relative "% of %" change. */
export function formatSignedPercentagePoints(value: number, digits = 2): string {
  const sign = value > 0 ? "+" : "";
  return `${sign}${value.toFixed(digits).replace(".", ",")} p.p.`;
}

/** Names the current selection ("Ativa, Pausada") instead of a bare count when it's short enough to read as a label — falls back to "2 de 8" once the names themselves would run too long for a filter pill/chip. */
export function formatSelectionSummary(
  selectedIds: Set<string>,
  options: { id: string; label: string }[],
  maxLength = 32
): string {
  const selected = options.filter((o) => selectedIds.has(o.id));
  const joined = selected.map((o) => o.label).join(", ");
  return joined.length > 0 && joined.length <= maxLength ? joined : `${selectedIds.size} de ${options.length}`;
}

export function formatShortDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "2-digit" }).format(
    new Date(year, month - 1, day)
  );
}
