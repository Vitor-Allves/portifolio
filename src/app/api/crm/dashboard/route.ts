import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listTeam } from "@/lib/crm";
import { getDashboard, isDay } from "@/lib/crm-dashboard";

export const runtime = "nodejs";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (Brasília, inclusive)&owner=all|<id>. A Comercial always sees only their own numbers. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const from = p.get("from");
  const to = p.get("to");
  if (!isDay(from) || !isDay(to) || from > to) return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  if (Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`) > 366 * 86_400_000) {
    return NextResponse.json({ error: "Escolha um período de até um ano." }, { status: 400 });
  }
  const asked = p.get("owner");
  const ownerId = !actor.caps.seeAllLeads ? actor.userId : asked && asked !== "all" ? asked : null;
  try {
    return NextResponse.json({ dashboard: await getDashboard(from, to, ownerId, await listTeam()) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/dashboard GET");
  }
}
