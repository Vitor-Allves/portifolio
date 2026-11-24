import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listFollowUp } from "@/lib/crm-clients";

export const runtime = "nodejs";

/** ?month=YYYY-MM (default: this month) → every client current that month and its acompanhamento, pending first. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json(await listFollowUp(actor, req.nextUrl.searchParams.get("month")));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/followup GET");
  }
}
