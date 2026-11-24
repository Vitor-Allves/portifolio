"use client";

// Small pieces shared by the contact, company and opportunity screens for
// the fields of Fase 1 · entrega 2 (temperatura, serviço, valores).

import { CRM_TEMPERATURES, companyStatusLabel, temperatureLabel, type CrmCompanyStatus, type CrmTemperature } from "@/lib/crm-types";
import { useCatalog } from "./crm-catalog-context";

/** Chip classes per temperature — literal strings so Tailwind keeps them. */
const TEMPERATURE_TONE: Record<CrmTemperature, string> = {
  frio: "bg-crm-accent/10 text-crm-accent border-crm-accent/25",
  morno: "bg-crm-amber/10 text-crm-amber border-crm-amber/30",
  quente: "bg-crm-red/10 text-crm-red border-crm-red/25",
};

export function TemperatureChip({ value, small = true }: { value: CrmTemperature | null; small?: boolean }) {
  if (!value) return null;
  return (
    <span
      title={`Temperatura: ${temperatureLabel(value)}`}
      className={`inline-flex items-center gap-1 rounded-full border font-semibold whitespace-nowrap ${small ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-[11.5px]"} ${TEMPERATURE_TONE[value]}`}
    >
      <span aria-hidden="true" className="h-1.5 w-1.5 rounded-full bg-current" />
      {temperatureLabel(value)}
    </span>
  );
}

export function TemperatureSelect({
  value,
  onChange,
  className,
  label = "Temperatura",
  emptyLabel = "Sem temperatura",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  label?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} className={className}>
      <option value="">{emptyLabel}</option>
      {CRM_TEMPERATURES.map((t) => (
        <option key={t.id} value={t.id}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

/** Select over Personalização → Serviços (plus the record's current value, even if archived). */
export function ServiceSelect({
  value,
  onChange,
  className,
  label = "Serviço",
  emptyLabel = "Sem serviço",
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  label?: string;
  emptyLabel?: string;
  disabled?: boolean;
}) {
  const { options } = useCatalog();
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} disabled={disabled} className={className}>
      <option value="">{emptyLabel}</option>
      {options("service", value || null).map((o) => (
        <option key={o.id} value={o.id}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

/** Centavos → what a person types: "3.500,50" (never "3.500,5"); whole values without decimals: "12.000". */
export function centsToInput(cents: number | null): string {
  if (cents === null) return "";
  const digits = cents % 100 ? 2 : 0;
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** "2026-12-20" → "20/12/2026". */
export function brDay(day: string | null): string {
  return day ? day.split("-").reverse().join("/") : "";
}

const COMPANY_STATUS_TONE: Record<CrmCompanyStatus, string> = {
  prospeccao: "bg-crm-accent/10 text-crm-accent border-crm-accent/25",
  negociacao: "bg-crm-amber/10 text-crm-amber border-crm-amber/30",
  cliente_ativo: "bg-crm-green/10 text-crm-green border-crm-green/25",
  ex_cliente: "bg-crm-sunken text-crm-dim border-crm-line",
  inativa: "bg-crm-sunken text-crm-faint border-crm-line",
};

/** Situação comercial of a company as a chip; nothing when not set. */
export function CompanyStatusChip({ value }: { value: CrmCompanyStatus | null }) {
  if (!value) return null;
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${COMPANY_STATUS_TONE[value]}`}>
      {companyStatusLabel(value)}
    </span>
  );
}
