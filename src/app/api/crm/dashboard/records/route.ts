import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { dashboardParams, isDashboardMetric, listDashboardRecords } from "@/lib/crm-dashboard";

export const runtime = "nodejs";

/** ?metric=<indicador> plus the Painel's own filters → the records behind that number (up to 500; `total` is the full count). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const metric = p.get("metric");
  if (!isDashboardMetric(metric)) return NextResponse.json({ error: "Indicador inválido." }, { status: 400 });
  const q = dashboardParams(p, actor);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
  try {
    return NextResponse.json(await listDashboardRecords(metric, q.from, q.to, q.filters, q.viewer));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/dashboard/records GET");
  }
}
