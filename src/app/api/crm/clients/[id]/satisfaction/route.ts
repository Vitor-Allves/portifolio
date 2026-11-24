import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { addSatisfaction, getOperation } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** Records the client's satisfaction: { score 0–10, comment? }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await addSatisfaction(actor, id, body);
    return NextResponse.json({ operation: await getOperation(actor, id) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/satisfaction POST");
  }
}
