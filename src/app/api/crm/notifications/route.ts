import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { markNotificationsRead } from "@/lib/crm-automations";

export const runtime = "nodejs";

/** Marks my notices read: { ids: [...] } or { ids: "all" }. Only ever one's own. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { ids?: unknown } | null;
  try {
    return NextResponse.json({ read: await markNotificationsRead(actor.userId, body?.ids) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/notifications POST");
  }
}
