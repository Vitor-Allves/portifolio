import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { createTag, reorderTags, type TagInput } from "@/lib/crm-options";
import { auditCatalog } from "../audit";

export const runtime = "nodejs";

/** New tag: { category, label, color, description? }. Administrador only. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as TagInput | null;
  try {
    requireCap(actor, "customize");
    if (!body) throw new CrmInputError("Requisição inválida.");
    const tag = await createTag(body);
    await auditCatalog(actor, tag.id, tag.label, { action: "tag_created", category: tag.category });
    return NextResponse.json({ tag });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/catalog/tags POST");
  }
}

/** New order within a category: { category, ids }. */
export async function PUT(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { category?: unknown; ids?: unknown } | null;
  try {
    requireCap(actor, "customize");
    if (!body) throw new CrmInputError("Requisição inválida.");
    await reorderTags(body.category, body.ids);
    await auditCatalog(actor, String(body.category), String(body.category), { action: "tags_reordered" });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/catalog/tags PUT");
  }
}
