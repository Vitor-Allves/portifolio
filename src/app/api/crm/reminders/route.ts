import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { visibleTo } from "@/lib/crm-access";
import { listReminders } from "@/lib/crm-tasks";

export const runtime = "nodejs";

/** The bell: my reminders that are due, and how many of my tasks are late. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json(await listReminders(actor.userId, visibleTo(actor)), { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/reminders GET");
  }
}
