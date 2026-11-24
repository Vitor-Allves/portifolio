import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { reportParams, runReport } from "@/lib/crm-report-catalog";
import { isCrmReportId } from "@/lib/crm-report-catalog-types";

export const runtime = "nodejs";

/** One report of Relatórios (evolução v1.0, item 14), with its filters. Who sees what: crm-report-catalog.ts. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  if (!isCrmReportId(id)) return NextResponse.json({ error: "Relatório não encontrado." }, { status: 404 });
  try {
    const report = await runReport(actor, id, reportParams(actor, id, req.nextUrl.searchParams));
    return NextResponse.json({ report }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/reports/[id] GET");
  }
}
