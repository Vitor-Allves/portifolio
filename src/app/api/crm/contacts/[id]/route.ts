import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getContactDetail, markRead, updateContact } from "@/lib/crm";

export const runtime = "nodejs";

// Opening a contact's panel = reading its conversation, so this also clears
// the unread counter (the panel polls this same route while open).
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    await markRead(id);
    const contact = await getContactDetail(id);
    if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    return NextResponse.json({ contact });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id] GET");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const found = await updateContact(id, body, actor);
    if (!found) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id] PATCH");
  }
}
