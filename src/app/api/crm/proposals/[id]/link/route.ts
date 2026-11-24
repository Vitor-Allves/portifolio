import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { setLink } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** Creates (or renews: the old one stops working) the public link. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json({ token: await setLink(actor, id, "create") });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id]/link POST");
  }
}

/** Turns the public link off. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    await setLink(actor, id, "revoke");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id]/link DELETE");
  }
}
