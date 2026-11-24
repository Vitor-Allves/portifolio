import { NextRequest, NextResponse, after } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { visibleTo } from "@/lib/crm-access";
import { listReminders } from "@/lib/crm-tasks";
import { listNotifications } from "@/lib/crm-automations";
import { dispatchDueMessages, dueCheckWanted } from "@/lib/crm-scheduled-messages";

export const runtime = "nodejs";

/**
 * The bell: my reminders that are due, how many of my tasks are late, and my
 * unread notices (automações). Every open CRM polls it once a minute, so it
 * also sends the scheduled messages that are due — after answering (and at
 * most every 20 seconds per server instance), between the scheduler's runs.
 */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  if (dueCheckWanted()) {
    after(() => dispatchDueMessages().catch((err) => console.error("[crm/reminders] scheduled messages", err)));
  }
  try {
    const [reminders, notifications] = await Promise.all([listReminders(actor.userId, visibleTo(actor)), listNotifications(actor.userId)]);
    return NextResponse.json({ ...reminders, notifications }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/reminders GET");
  }
}
