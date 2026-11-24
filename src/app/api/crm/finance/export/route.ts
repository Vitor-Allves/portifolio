import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { writeAudit } from "@/lib/audit-log";
import { financeParams, getFinance } from "@/lib/crm-finance";
import { buildCrmPdf } from "@/lib/crm-pdf";

export const runtime = "nodejs";

const money = (c: number) => (c / 100).toFixed(2).replace(".", ",");
const brl = (c: number) => (c / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const day = (d: string) => d.split("-").reverse().join("/");
const month = (m: string) => m.split("-").reverse().join("/");
const csvCell = (v: string) => (/[";\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);

/** The Financeiro as ?format=csv (planilha) or pdf, same filters as the screen; audited. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "exportReports");
    const q = financeParams(actor, req.nextUrl.searchParams);
    const f = await getFinance(actor, q);
    const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
    const period = `${day(f.from)} a ${day(f.to)}`;
    const summary: [string, string][] = [
      ["Valor vendido", `${brl(f.sold.cents)} (${f.sold.count} vendas)`],
      ["Nova receita mensal", brl(f.newMonthlyCents)],
      ["Receita de serviços pontuais", brl(f.oneTimeCents)],
      ["Receita recorrente mensal (hoje)", `${brl(f.active.monthlyCents)} (${f.active.contracts} contratos ativos)`],
      ["Contratado para os próximos 12 meses", brl(f.contractedNext12Cents)],
      ["Funil aberto (ponderado)", `${brl(f.pipeline.cents)} (${brl(f.pipeline.weightedCents)})`],
      ["Descontos em propostas aprovadas", `${brl(f.discounts.cents)} (${f.discounts.proposals} propostas, média ${f.discounts.avgPct}%)`],
      ["Cancelamentos", `${f.cancellations.count} (${brl(f.cancellations.monthlyCents)}/mês)`],
      ["Receita perdida no funil", `${brl(f.lost.dealsCents)} (${f.lost.deals} oportunidades)`],
      ["Comissões do período", brl(f.commissions.totalCents)],
    ];
    let body: BodyInit;
    let type: string;
    let name: string;
    if (format === "csv") {
      const rows: string[][] = [
        ["Financeiro comercial", period],
        [],
        ["Indicador", "Valor"],
        ...summary,
        [],
        ["Comissões", "Contrato", "Cliente", "Vendedor", "Vendido em", "Mensal (R$)", "Único (R$)", "Regra (mensal)", "Regra (único)", "Comissão (R$)"],
        ...f.commissions.rows.map((r) => [
          "",
          String(r.contractNumber).padStart(4, "0"),
          r.clientName,
          r.sellerName ?? "",
          day(r.soldOn),
          money(r.monthlyCents),
          money(r.oneTimeCents),
          r.monthlyRule ?? "",
          r.oneTimeRule ?? "",
          money(r.commissionCents),
        ]),
        [],
        ["Parcelas previstas", "Mês", "Cliente", "Contrato", "Tipo", "Valor (R$)"],
        ...f.installments.map((i) => [
          "",
          month(i.month),
          i.clientName,
          String(i.contractNumber).padStart(4, "0"),
          i.kind === "mensal" ? "Mensalidade" : "Valor único",
          money(i.cents),
        ]),
      ];
      body = "\uFEFF" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
      type = "text/csv; charset=utf-8";
      name = `financeiro-${f.from}-a-${f.to}.csv`;
    } else {
      const bytes = await buildCrmPdf({
        title: "Financeiro comercial",
        lines: [`Período: ${period}`, "Gerencial: valores calculados com os dados do CRM (não é faturamento)."],
        sections: [
          { title: "Resumo", head: ["Indicador", "Valor"], rows: summary, right: [1] },
          {
            title: "Comissões",
            head: ["Contrato", "Cliente", "Vendedor", "Mensal", "Único", "Comissão"],
            rows: f.commissions.rows.map((r) => [
              String(r.contractNumber).padStart(4, "0"),
              r.clientName,
              r.sellerName ?? "—",
              brl(r.monthlyCents),
              brl(r.oneTimeCents),
              brl(r.commissionCents),
            ]),
            right: [3, 4, 5],
            empty: "Nenhum contrato vendido no período.",
          },
          {
            title: "Parcelas previstas (próximos 6 meses)",
            head: ["Mês", "Cliente", "Contrato", "Tipo", "Valor"],
            rows: f.installments.map((i) => [
              month(i.month),
              i.clientName,
              String(i.contractNumber).padStart(4, "0"),
              i.kind === "mensal" ? "Mensalidade" : "Valor único",
              brl(i.cents),
            ]),
            right: [4],
            empty: "Nenhuma parcela prevista.",
          },
        ],
        generatedBy: actor.userName,
        orientation: "landscape",
      });
      body = new Uint8Array(bytes);
      type = "application/pdf";
      name = `financeiro-${f.from}-a-${f.to}.pdf`;
    }
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.report_export",
      targetType: "crm_report",
      targetId: "financeiro",
      targetLabel: "Financeiro comercial",
      metadata: { format, from: f.from, to: f.to, ownerId: f.ownerId, rows: f.commissions.rows.length },
    });
    return new NextResponse(body, {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "private, no-store" },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/finance/export GET");
  }
}
