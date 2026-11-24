import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { reportParams, runReport } from "@/lib/crm-report-catalog";
import { isCrmReportId, reportCellText, type CrmReportResult } from "@/lib/crm-report-catalog-types";
import { buildCrmPdf } from "@/lib/crm-pdf";
import { rowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";

const brDay = (d: string) => d.split("-").reverse().join("/");
const periodOf = (r: CrmReportResult) =>
  r.from && r.to ? `${brDay(r.from)} a ${brDay(r.to)}` : `Posição de ${new Date().toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`;
const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

/**
 * A report as ?format=csv (planilha) or ?format=pdf, with the screen's
 * filters and the same rules of who sees what. "Exportar relatórios"; audited.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!isCrmReportId(id)) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  const format = req.nextUrl.searchParams.get("format") === "pdf" ? "pdf" : "csv";
  try {
    requireCap(actor, "exportReports");
    const r = await runReport(actor, id, reportParams(actor, id, req.nextUrl.searchParams));
    const cells = (row: (string | number | null)[], mode: "sheet" | "print") => row.map((v, i) => reportCellText(r.columns[i].kind, v, mode));
    const name = `${slug(r.title)}-${r.from ?? new Date().toISOString().slice(0, 10)}${r.to && r.to !== r.from ? `-a-${r.to}` : ""}`;
    let body: BodyInit;
    let type: string;
    if (format === "csv") {
      body = `﻿${rowsToCsv([
        [r.title, periodOf(r), ...r.filters],
        [],
        ...r.summary.map((x) => [x.label, reportCellText(x.kind, x.value, "sheet")]),
        ...(r.summary.length ? [[]] : []),
        r.columns.map((c) => (c.kind === "money" ? `${c.label} (R$)` : c.label)),
        ...r.rows.map((x) => cells(x.cells, "sheet")),
        ...(r.totals ? [cells(r.totals, "sheet")] : []),
        [],
        [r.note],
        ...(r.truncated ? [["Lista limitada às primeiras linhas; os totais contam todas."]] : []),
      ])}`;
      type = "text/csv; charset=utf-8";
    } else {
      body = Buffer.from(
        await buildCrmPdf({
          title: r.title,
          lines: [periodOf(r), r.filters.join(" · ")],
          orientation: r.columns.length > 6 ? "landscape" : "portrait",
          generatedBy: actor.userName,
          headerLabel: "CRM · Relatórios",
          sections: [
            ...(r.summary.length
              ? [{ title: "Resumo", head: ["Indicador", "Valor"], rows: r.summary.map((x) => [x.label, reportCellText(x.kind, x.value, "print")]), right: [1] }]
              : []),
            {
              title: "Detalhe",
              note: r.note,
              head: r.columns.map((c) => c.label),
              rows: [...r.rows.map((x) => cells(x.cells, "print")), ...(r.totals ? [cells(r.totals, "print")] : [])],
              right: r.columns.flatMap((c, i) => (c.kind === "text" || c.kind === "date" ? [] : [i])),
              empty: "Nada no período com estes filtros.",
            },
          ],
        }),
      );
      type = "application/pdf";
    }
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.report_export",
      targetType: "crm_report",
      targetId: id,
      targetLabel: r.title,
      metadata: { what: r.title, format, from: r.from, to: r.to, filters: r.filters, rows: r.rows.length },
    });
    return new NextResponse(body, {
      headers: { "Content-Type": type, "Content-Disposition": `attachment; filename="${name}.${format}"`, "Cache-Control": "no-store" },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/reports/[id]/export GET");
  }
}
