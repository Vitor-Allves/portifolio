import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { authorizeDiscount } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** A Gestor authorizes the discount above the limit. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json((await authorizeDiscount(actor, id), { ok: true }));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id]/discount POST");
  }
}
