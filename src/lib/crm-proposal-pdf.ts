// Server-only. A proposal as a PDF with Legado Enterprise's identity (the
// same header, fonts and colors as the CRM's reports): who it is for, the
// services with quantities, values and discounts, the totals, the
// conditions, and — when approved — who approved it, when, and the content's
// fingerprint (the same one kept with the approval).

import { NextResponse } from "next/server";
import { buildCrmPdf, brDateTime, type CrmPdfSection } from "./crm-pdf";
import { PROPOSAL_BILLING_PERIODS, lineGross, lineNet, proposalNumber, type ProposalContent } from "./crm-proposal-types";
import { formatCnpj } from "./crm-types";

const money = (cents: number) => (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (d: string) => d.split("-").reverse().join("/");
const qty = (n: number) => n.toLocaleString("pt-BR", { maximumFractionDigits: 2 });

export async function proposalPdf(p: {
  number: number;
  version: number;
  content: ProposalContent;
  contentHash: string;
  approval: { name: string; createdAt: string; version: number; email?: string | null; document?: string | null; via?: string } | null;
  /** Not sent yet: marked as a draft. */
  draft: boolean;
  generatedBy: string;
}): Promise<Uint8Array> {
  const c = p.content;
  const period = PROPOSAL_BILLING_PERIODS.find((x) => x.id === c.billingPeriod)?.label ?? c.billingPeriod;
  const sections: CrmPdfSection[] = [];
  if (c.intro) sections.push({ title: "Apresentação", paragraphs: c.intro.split(/\n{2,}/) });
  sections.push({
    title: "Serviços",
    head: ["Serviço", "Qtd.", "Valor unitário", "Desconto", "Total", "Cobrança"],
    rows: c.items.map((i) => [
      i.description ? `${i.name}\n${i.description}` : i.name,
      qty(i.quantity),
      money(i.unitCents),
      i.discountCents ? `${money(i.discountCents)}${i.discountPct !== null ? ` (${i.discountPct}%)` : ""}` : "—",
      money(lineNet(i)),
      i.billing === "mensal" ? "Mensal" : "Único",
    ]),
    right: [1, 2, 3, 4],
    empty: "Nenhum serviço.",
  });
  const totals: string[][] = [["Valor bruto", money(c.items.reduce((a, i) => a + lineGross(i), 0))]];
  if (c.totals.discountCents) totals.push(["Descontos", `− ${money(c.totals.discountCents)} (${c.totals.discountPct.toLocaleString("pt-BR")}%)`]);
  if (c.totals.monthlyCents) totals.push([`Recorrente (${period.toLowerCase()})`, `${money(c.totals.monthlyCents)} por mês`]);
  if (c.totals.oneTimeCents) totals.push(["Valor único", money(c.totals.oneTimeCents)]);
  totals.push(["Total da proposta", money(c.totals.totalCents)]);
  sections.push({ title: "Valores", head: ["", "Valor"], rows: totals, right: [1] });
  const cond: string[] = [];
  if (c.paymentTerms) cond.push(`Condições de pagamento: ${c.paymentTerms}`);
  if (c.totals.monthlyCents) cond.push(`Periodicidade de cobrança: ${period}`);
  if (c.dueDate) cond.push(`Vencimento: ${day(c.dueDate)}`);
  if (c.executionTerm) cond.push(`Prazo de execução: ${c.executionTerm}`);
  cond.push(`Validade desta proposta: até ${day(c.validUntil)}`);
  sections.push({ title: "Condições", paragraphs: cond });
  if (c.notes) sections.push({ title: "Observações", paragraphs: c.notes.split(/\n{2,}/) });
  if (p.approval) {
    sections.push({
      title: "Aprovação",
      paragraphs: [
        `Aprovada por ${p.approval.name}${p.approval.email ? ` (${p.approval.email})` : ""}${p.approval.document ? `, documento ${p.approval.document}` : ""}, em ${brDateTime(new Date(p.approval.createdAt))}, versão ${p.approval.version}${p.approval.via === "equipe" ? " (registrada pela equipe)" : " (aceite online)"}.`,
        `Código de verificação do conteúdo aprovado: ${p.contentHash}`,
        "Esta aprovação não substitui o contrato, quando ele for necessário.",
      ],
    });
  }
  return buildCrmPdf({
    title: `Proposta comercial nº ${proposalNumber(p.number)}${p.draft ? " (rascunho)" : ""}`,
    lines: [
      c.title,
      `Para: ${c.client.contactName}${c.client.companyName ? ` · ${c.client.companyName}` : ""}${c.client.cnpj ? ` · CNPJ ${formatCnpj(c.client.cnpj)}` : ""}`,
      `Emitida em ${day(c.issueDate)} · válida até ${day(c.validUntil)} · versão ${p.version}`,
      ...(c.ownerName ? [`Responsável comercial: ${c.ownerName}`] : []),
    ],
    sections,
    generatedBy: p.generatedBy,
    footerNote: "Proposta comercial — Legado Enterprise",
    headerLabel: "Proposta comercial",
  });
}

export function pdfResponse(bytes: Uint8Array, number: number, version: number): NextResponse {
  const name = `proposta-${proposalNumber(number)}-v${version}.pdf`;
  return new NextResponse(new Uint8Array(bytes), {
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="${name}"`,
      "Cache-Control": "private, no-store",
    },
  });
}
