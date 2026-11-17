import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listUnreadContacts } from "@/lib/crm";

export const runtime = "nodejs";

/** Contacts with unread WhatsApp messages. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ contacts: await listUnreadContacts() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/inbox GET");
  }
}
