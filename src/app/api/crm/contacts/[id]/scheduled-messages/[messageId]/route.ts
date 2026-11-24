import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { cancelScheduled } from "@/lib/crm-scheduled-messages";

export const runtime = "nodejs";

/** Cancels a scheduled message that hasn't gone out yet. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string; messageId: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id, messageId } = await params;
  try {
    return NextResponse.json({ message: await cancelScheduled(actor, id, messageId) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/scheduled-messages/[messageId] DELETE");
  }
}
