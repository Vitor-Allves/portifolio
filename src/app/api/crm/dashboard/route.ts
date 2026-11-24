import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listTeam } from "@/lib/crm";
import { dashboardParams, getDashboard } from "@/lib/crm-dashboard";

export const runtime = "nodejs";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (Brasília, inclusive)&owner=all|<id>&source&segment&stage. A Comercial always sees only their own numbers. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const q = dashboardParams(req.nextUrl.searchParams, actor);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
  try {
    return NextResponse.json({ dashboard: await getDashboard(q.from, q.to, q.filters, await listTeam(), q.viewer) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/dashboard GET");
  }
}
