import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { listAutomations, scheduleConfigured } from "@/lib/crm-automations";

export const runtime = "nodejs";

/** Every automation with its situação and parameters, and whether the daily check is set up. Administrador. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "manageAutomations");
    return NextResponse.json({ automations: await listAutomations(), schedule: { configured: scheduleConfigured() } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/automations GET");
  }
}
