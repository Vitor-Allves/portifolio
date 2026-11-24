import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { addCompanyTag, companyOwner, removeCompanyTag } from "@/lib/crm-companies";

export const runtime = "nodejs";

/** Applies a tag to a company: { tagId }. Same rule as editing the company. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { tagId?: unknown } | null;
  try {
    requireCap(actor, "editContacts");
    if (!(await companyOwner(id))) return NextResponse.json({ error: "Empresa não encontrada." }, { status: 404 });
    if (typeof body?.tagId !== "string" || !body.tagId) throw new CrmInputError("Escolha uma etiqueta.");
    return NextResponse.json({ ok: true, added: await addCompanyTag(id, body.tagId, actor) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/companies/[id]/tags POST");
  }
}

/** Removes a tag: ?tagId= */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const tagId = req.nextUrl.searchParams.get("tagId");
  try {
    requireCap(actor, "editContacts");
    if (!tagId) throw new CrmInputError("Escolha uma etiqueta.");
    return NextResponse.json({ ok: true, removed: await removeCompanyTag(id, tagId) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/companies/[id]/tags DELETE");
  }
}
