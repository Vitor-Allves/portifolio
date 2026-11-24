import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { changeStatus } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** { action: negociacao | aprovar | recusar | cancelar, reason, approverName?, approverEmail? } — what the team records by hand. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ status: await changeStatus(actor, id, body) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id]/status POST");
  }
}
