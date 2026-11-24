import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getOperation } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** Onboarding checklist, deliverables and satisfaction of a client. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json({ operation: await getOperation(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/operation GET");
  }
}
