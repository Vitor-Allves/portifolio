import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getOperation, updateOnboardingItem } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** { done?, ownerId?, dueOn?, note? } on one onboarding item. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; itemId: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id, itemId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await updateOnboardingItem(actor, id, itemId, body);
    return NextResponse.json({ operation: await getOperation(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/onboarding/[itemId] PATCH");
  }
}
