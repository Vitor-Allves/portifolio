import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getTabulationReport, tabulationParams } from "@/lib/crm-reports";

export const runtime = "nodejs";

/** Relatório de tabulação: ?from&to&owner&source&segment&service&reason&group. A Comercial gets only their own. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const q = tabulationParams(req.nextUrl.searchParams, actor);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
  try {
    return NextResponse.json({ report: await getTabulationReport(q.from, q.to, q.filters) });
  } catch (err) {
    return crmErrorResponse(err, "crm reports tabulation");
  }
}
