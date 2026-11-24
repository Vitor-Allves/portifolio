import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { visibleTo } from "@/lib/crm-access";
import { listReminders } from "@/lib/crm-tasks";
import { listNotifications } from "@/lib/crm-automations";

export const runtime = "nodejs";

/** The bell: my reminders that are due, how many of my tasks are late, and my unread notices (automações). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    const [reminders, notifications] = await Promise.all([listReminders(actor.userId, visibleTo(actor)), listNotifications(actor.userId)]);
    return NextResponse.json({ ...reminders, notifications }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/reminders GET");
  }
}
