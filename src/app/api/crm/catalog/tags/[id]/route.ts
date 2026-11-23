import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { setTagArchived, updateTag, type TagInput } from "@/lib/crm-options";
import { auditCatalog } from "../../audit";

export const runtime = "nodejs";

/** { category?, label?, color?, description? } and/or { archived: boolean }. Administrador only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as (TagInput & { archived?: unknown }) | null;
  try {
    requireCap(actor, "customize");
    if (!body) throw new CrmInputError("Requisição inválida.");
    let tag;
    if (body.category !== undefined || body.label !== undefined || body.color !== undefined || body.description !== undefined) {
      const r = await updateTag(id, body);
      tag = r.after;
      await auditCatalog(actor, id, r.after.label, {
        action: "tag_edited",
        from: { label: r.before.label, category: r.before.category, color: r.before.color },
        to: { label: r.after.label, category: r.after.category, color: r.after.color },
      });
    }
    if (typeof body.archived === "boolean") {
      tag = await setTagArchived(id, body.archived);
      await auditCatalog(actor, id, tag.label, { action: body.archived ? "tag_archived" : "tag_restored" });
    }
    if (!tag) throw new CrmInputError("Nada para alterar.");
    return NextResponse.json({ tag });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/catalog/tags/[id] PATCH");
  }
}
