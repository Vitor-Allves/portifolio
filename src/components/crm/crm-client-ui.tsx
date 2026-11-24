"use client";

// Small pieces shared by the Clientes ativos list and the client panel.

import { clientStatusLabel, formatBRL, type CrmClientEvent, type CrmClientStatus, type CrmContractBilling } from "@/lib/crm-types";

const CLIENT_STATUS_TONE: Record<CrmClientStatus, string> = {
  onboarding: "bg-crm-accent/10 text-crm-accent border-crm-accent/25",
  ativo: "bg-crm-green/10 text-crm-green border-crm-green/25",
  pausado: "bg-crm-amber/10 text-crm-amber border-crm-amber/30",
  encerrado: "bg-crm-sunken text-crm-dim border-crm-line",
};

export function ClientStatusChip({ value }: { value: CrmClientStatus }) {
  return (
    <span className={`inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-medium ${CLIENT_STATUS_TONE[value]}`}>
      {clientStatusLabel(value)}
    </span>
  );
}

/** "Vence em 12 dias" / "Vence hoje" / "Vencido há 3 dias" / "Sem prazo", with a tone. */
export function contractDue(daysLeft: number | null, endsOn: string | null): { text: string; tone: string } {
  if (!endsOn || daysLeft === null) return { text: "Sem prazo", tone: "text-crm-faint" };
  if (daysLeft < 0) return { text: `Vencido há ${-daysLeft} ${daysLeft === -1 ? "dia" : "dias"}`, tone: "text-crm-red" };
  if (daysLeft === 0) return { text: "Vence hoje", tone: "text-crm-red" };
  return { text: `Vence em ${daysLeft} ${daysLeft === 1 ? "dia" : "dias"}`, tone: daysLeft <= 30 ? "text-crm-amber" : "text-crm-dim" };
}

/** "R$ 3.500/mês" or "R$ 12.000 (valor único)". */
export function contractValue(cents: number | null, billing: CrmContractBilling): string {
  if (cents === null) return "";
  return billing === "mensal" ? `${formatBRL(cents)}/mês` : `${formatBRL(cents)} (valor único)`;
}

type Change = { field: string; from: string | null; to: string | null };
const changesText = (changes: unknown) =>
  (Array.isArray(changes) ? (changes as Change[]) : [])
    .map((c) => (c.from === null && c.to === null ? `${c.field} atualizadas` : `${c.field}: ${c.from ?? "—"} → ${c.to ?? "—"}`))
    .join(" · ");

/** One line of the client's history. */
export function clientEventText(e: CrmClientEvent): string {
  const p = e.payload;
  const str = (v: unknown) => (typeof v === "string" ? v : "");
  switch (e.kind) {
    case "created":
      return `Virou cliente ${p.via === "oportunidade" ? `pela oportunidade ganha “${str(p.dealTitle)}”` : "a partir da empresa"}${p.status ? ` · ${str(p.status)}` : ""}${
        p.owner ? ` · responsável ${str(p.owner)}` : ""
      }`;
    case "status": {
      const closed = Number(p.closedContracts ?? 0);
      return `Situação: ${str(p.from)} → ${str(p.to)}${p.reason ? ` (${str(p.reason)})` : ""}${closed ? ` · ${closed} ${closed === 1 ? "contrato encerrado" : "contratos encerrados"}` : ""}`;
    }
    case "edited":
      return changesText(p.changes);
    case "contract_added": {
      const services = Array.isArray(p.services) && p.services.length ? (p.services as string[]).join(", ") : "sem serviço";
      const value = typeof p.value === "number" ? ` · ${contractValue(p.value, p.billing === "unico" ? "unico" : "mensal")}` : "";
      return `Novo contrato: ${services} · ${str(p.period)}${value}${p.dealTitle ? ` · da oportunidade “${str(p.dealTitle)}”` : ""}`;
    }
    case "contract_edited":
      return `${str(p.label) || "Contrato"} — ${changesText(p.changes) || "editado"}`;
    case "note":
      return str(p.text);
    case "report": {
      const fields = Array.isArray(p.fields) && p.action === "edited" ? `: ${(p.fields as string[]).join(", ").toLowerCase()}` : "";
      return `Acompanhamento de ${str(p.monthLabel)} ${p.action === "edited" ? "atualizado" : "registrado"}${fields}`;
    }
    case "onboarding":
      return p.action === "started" ? "Checklist de onboarding iniciado" : `Onboarding: ${str(p.label)} ${p.action === "done" ? "concluído" : "reaberto"}`;
    case "deliverable": {
      const st = (v: unknown) => ({ pendente: "Pendente", em_andamento: "Em andamento", entregue: "Entregue", cancelado: "Cancelado" })[str(v)] ?? str(v);
      return p.action === "created"
        ? `Novo entregável: ${str(p.title)}${p.dueOn ? ` · prazo ${str(p.dueOn).split("-").reverse().join("/")}` : ""}`
        : `Entregável ${str(p.title)}: ${st(p.from)} → ${st(p.to)}`;
    }
    case "satisfaction":
      return `Satisfação: nota ${String(p.score)}${p.comment ? ` — ${str(p.comment)}` : ""}`;
    case "contract_details":
      return `Contrato nº ${String(p.contractNumber ?? "").padStart(4, "0")} formalizado a partir da proposta nº ${String(p.proposalNumber ?? "").padStart(4, "0")}`;
    case "intelligence":
      return p.to
        ? `Ligado ao Legado Intelligence: ${str(p.to)}${p.from ? ` (antes: ${str(p.from)})` : ""}`
        : `Desligado do Legado Intelligence${p.from ? ` (era ${str(p.from)})` : ""}`;
    default:
      return "";
  }
}
