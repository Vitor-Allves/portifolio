import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getOperation, saveDeliverable } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** Edits a deliverable (only the fields sent). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; deliverableId: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id, deliverableId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await saveDeliverable(actor, id, deliverableId, body);
    return NextResponse.json({ operation: await getOperation(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/deliverables/[deliverableId] PATCH");
  }
}
