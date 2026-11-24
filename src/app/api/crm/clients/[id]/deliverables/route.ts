import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getOperation, saveDeliverable } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** New deliverable: { title, description?, service?, contractId?, ownerId?, dueOn?, status? }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await saveDeliverable(actor, id, null, body);
    return NextResponse.json({ operation: await getOperation(actor, id) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/deliverables POST");
  }
}
