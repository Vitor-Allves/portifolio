import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, requireContact } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { addContactTag, removeContactTag } from "@/lib/crm-options";

export const runtime = "nodejs";

/** Applies a tag: { tagId }. Same rule as editing the contact (Comercial: only their own / unowned). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { tagId?: unknown } | null;
  try {
    await requireContact(actor, id);
    requireCap(actor, "editContacts");
    if (typeof body?.tagId !== "string" || !body.tagId) throw new CrmInputError("Escolha uma etiqueta.");
    return NextResponse.json({ ok: true, added: await addContactTag(id, body.tagId, actor, "manual") });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/tags POST");
  }
}

/** Removes a tag: ?tagId= */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const tagId = req.nextUrl.searchParams.get("tagId");
  try {
    await requireContact(actor, id);
    requireCap(actor, "editContacts");
    if (!tagId) throw new CrmInputError("Escolha uma etiqueta.");
    return NextResponse.json({ ok: true, removed: await removeContactTag(id, tagId, actor) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/tags DELETE");
  }
}
