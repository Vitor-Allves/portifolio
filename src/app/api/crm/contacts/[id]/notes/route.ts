import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { addNote } from "@/lib/crm";

export const runtime = "nodejs";

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { text?: unknown } | null;
  try {
    const found = await addNote(id, body?.text, actor);
    if (!found) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });
    return NextResponse.json({ ok: true }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/notes POST");
  }
}
