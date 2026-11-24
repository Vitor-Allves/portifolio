import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { listTeam } from "@/lib/crm";
import { getCatalog } from "@/lib/crm-options";
import { getTabulationReport, tabulationParams } from "@/lib/crm-reports";
import { WON_RESULTS, closeGroupLabel } from "@/lib/crm-catalog";
import { buildCrmPdf, brDateTime } from "@/lib/crm-pdf";
import { rowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";

const brDay = (d: string) => d.split("-").reverse().join("/");
const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const brl = (cents: number) => new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(cents / 100);
const pct = (v: number | null) => (v === null ? "—" : `${Math.round(v * 100)}%`);

/**
 * Relatório de tabulação as ?format=csv (planilha) or ?format=pdf, with the
 * screen's filters. "Exportar relatórios" permission; audited.
 */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const q = tabulationParams(p, actor);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
  const format = p.get("format") === "pdf" ? "pdf" : "csv";
  try {
    requireCap(actor, "exportReports");
    const [r, catalog, team] = await Promise.all([getTabulationReport(q.from, q.to, q.filters), getCatalog(), listTeam()]);
    const label = (kind: string, id: string | null) => (id ? (catalog.options.find((o) => o.kind === kind && o.id === id)?.label ?? id) : "");
    const reasonLabel = (group: string, id: string | null) => (id ? label(group === "positivo" ? "won_reason" : "lost_reason", id) : "Sem motivo informado");
    const resultLabel = (id: string | null) => WON_RESULTS.find((x) => x.id === id)?.label ?? "";
    const f = q.filters;
    const filterLines = [
      f.ownerId ? `Vendedor: ${team.find((m) => m.id === f.ownerId)?.name ?? f.ownerId}` : "Todos os vendedores",
      f.source ? `Origem: ${label("source", f.source)}` : "",
      f.segment ? `Segmento: ${f.segment}` : "",
      f.service ? `Serviço: ${label("service", f.service)}` : "",
      f.group ? `Grupo: ${closeGroupLabel(f.group)}` : "",
      f.reason ? `Motivo: ${label("lost_reason", f.reason) || label("won_reason", f.reason)}` : "",
    ].filter(Boolean);
    const period = `${brDay(q.from)} a ${brDay(q.to)}`;
    const closedTotal = r.groups.reduce((a, g) => a + g.count, 0);

    let body: BodyInit;
    let type: string;
    let name: string;
    let rowsOut = r.rows.length;
    if (format === "csv") {
      const rows: string[][] = [
        ["Relatório de tabulação comercial", period, ...filterLines],
        [],
        ["Grupo", "Encerramentos", "Valor (R$)"],
        ...r.groups.map((g) => [closeGroupLabel(g.group), String(g.count), money(g.valueCents)]),
        ["Reabertas no período", String(r.reopened), ""],
        [],
        ["Grupo", "Motivo", "Encerramentos", "Valor (R$)"],
        ...r.reasons.map((x) => [closeGroupLabel(x.group), reasonLabel(x.group, x.reason), String(x.count), money(x.valueCents)]),
        [],
        ["Vendedor", "Positivo", "Perda comercial", "Sem conversão", "Oportunidade futura", "Conversão"],
        ...r.people.map((x) => [x.name, String(x.positivo), String(x.negativo), String(x.sem_conversao), String(x.futuro), pct(x.conversion)]),
        [],
        ["Encerrada em", "Oportunidade", "Contato", "Responsável", "Encerrada por", "Grupo", "Resultado", "Motivo", "Observação", "Retomar em", "Valor (R$)", "Origem", "Serviço"],
        ...r.rows.map((x) => [
          brDateTime(new Date(x.closedAt)),
          x.title,
          x.contactName,
          x.ownerName ?? "",
          x.closedByName ?? "",
          closeGroupLabel(x.group),
          resultLabel(x.wonResult),
          reasonLabel(x.group, x.reason),
          x.note ?? "",
          x.returnOn ? brDay(x.returnOn) : "",
          money(x.valueCents),
          label("source", x.source),
          label("service", x.service),
        ]),
        ...(r.total > r.rows.length ? [[`Mostrando ${r.rows.length} de ${r.total} encerramentos; filtre o período para ver os demais.`]] : []),
        [],
        ["Conversão = positivos ÷ (positivos + perdas comerciais + sem conversão). Oportunidades futuras não contam como perda."],
      ];
      body = `﻿${rowsToCsv(rows)}`;
      type = "text/csv; charset=utf-8";
      name = `crm-tabulacao-${q.from}-a-${q.to}.csv`;
    } else {
      const pdf = await buildCrmPdf({
        title: "Relatório de tabulação comercial",
        lines: [`Período: ${period} · ${closedTotal} encerramentos · ${r.reopened} reaberturas`, filterLines.join(" · ")],
        orientation: "landscape",
        generatedBy: actor.userName,
        sections: [
          {
            title: "Por grupo",
            head: ["Grupo", "Encerramentos", "Valor"],
            rows: r.groups.map((g) => [closeGroupLabel(g.group), String(g.count), brl(g.valueCents)]),
            right: [1, 2],
          },
          {
            title: "Por motivo",
            head: ["Grupo", "Motivo", "Encerramentos", "Valor"],
            rows: r.reasons.map((x) => [closeGroupLabel(x.group), reasonLabel(x.group, x.reason), String(x.count), brl(x.valueCents)]),
            right: [2, 3],
            empty: "Nenhum encerramento no período.",
          },
          {
            title: "Por vendedor",
            note: "Conversão = positivos ÷ (positivos + perdas comerciais + sem conversão). Oportunidades futuras não contam como perda.",
            head: ["Vendedor", "Positivo", "Perda comercial", "Sem conversão", "Oportunidade futura", "Conversão"],
            rows: r.people.map((x) => [x.name, String(x.positivo), String(x.negativo), String(x.sem_conversao), String(x.futuro), pct(x.conversion)]),
            right: [1, 2, 3, 4, 5],
            empty: "Nenhum encerramento no período.",
          },
          {
            title: "Encerramentos",
            note: r.total > r.rows.length ? `Mostrando ${r.rows.length} de ${r.total}; filtre o período para ver os demais.` : undefined,
            head: ["Data", "Oportunidade", "Responsável", "Encerrada por", "Grupo", "Motivo", "Observação", "Retomar", "Valor"],
            rows: r.rows.map((x) => [
              brDateTime(new Date(x.closedAt)).split(",")[0],
              `${x.title}\n${x.contactName}`,
              x.ownerName ?? "—",
              x.closedByName ?? "—",
              x.group === "positivo" ? resultLabel(x.wonResult) : closeGroupLabel(x.group),
              reasonLabel(x.group, x.reason),
              x.note ?? "",
              x.returnOn ? brDay(x.returnOn) : "",
              x.valueCents === null ? "" : brl(x.valueCents),
            ]),
            right: [8],
            empty: "Nenhum encerramento no período.",
          },
        ],
      });
      body = Buffer.from(pdf);
      type = "application/pdf";
      name = `crm-tabulacao-${q.from}-a-${q.to}.pdf`;
      rowsOut = r.rows.length;
    }
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.report_export",
      targetType: "crm_report",
      metadata: { what: "Tabulação comercial", format, from: q.from, to: q.to, rows: rowsOut, filters: { ...f } },
    });
    return new NextResponse(body, {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}"`, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/reports/tabulation/export GET");
  }
}
