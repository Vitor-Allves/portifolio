import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { addClientNote, getClient } from "@/lib/crm-clients";

export const runtime = "nodejs";

/** { text } → "Registrar no histórico" of the client. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await addClientNote(actor, id, body.text);
    return NextResponse.json({ client: await getClient(actor, id) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/notes POST");
  }
}
