import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { cancelTransfer, decideTransfer } from "@/lib/crm-transfers";

export const runtime = "nodejs";

/** Gestor / Administrador: { decision: "aprovar" | "recusar", note } (the note is required to refuse). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ transfer: await decideTransfer(actor, id, body) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/transfers/[id] PATCH");
  }
}

/** Whoever asked withdraws a pending request. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json({ transfer: await cancelTransfer(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/transfers/[id] DELETE");
  }
}
