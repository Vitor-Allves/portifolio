import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getOperation, startOnboarding } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** Starts the onboarding checklist (clients created before it existed). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    await startOnboarding(actor, id);
    return NextResponse.json({ operation: await getOperation(actor, id) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/onboarding POST");
  }
}
