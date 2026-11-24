import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getProductivity, productivityPeriod } from "@/lib/crm-goals";

export const runtime = "nodejs";

/** ?from=YYYY-MM-DD&to=YYYY-MM-DD (Brasília, inclusive) → each person's productivity (a Comercial: only their own). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  try {
    const [from, to] = productivityPeriod(p.get("from"), p.get("to"));
    return NextResponse.json({ productivity: await getProductivity(actor, from, to) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/productivity GET");
  }
}
