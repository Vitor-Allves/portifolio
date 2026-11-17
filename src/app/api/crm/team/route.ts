import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listCrmTeam, requireCap } from "@/lib/crm-access";

export const runtime = "nodejs";

/** The staff and their CRM profile — Administrador only. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "manageTeam");
    return NextResponse.json({ team: await listCrmTeam() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team GET");
  }
}
