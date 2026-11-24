import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { isOptionKind } from "@/lib/crm-catalog";
import { createOption, reorderOptions } from "@/lib/crm-options";
import { auditCatalog } from "../audit";

export const runtime = "nodejs";

/** New option: { kind, label, description?, color? }. Administrador only. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { kind?: unknown; label?: unknown; description?: unknown; color?: unknown } | null;
  try {
    requireCap(actor, "customize");
    if (!body || !isOptionKind(body.kind)) throw new CrmInputError("Lista inválida.");
    const option = await createOption(body.kind, body);
    await auditCatalog(actor, `${option.kind}:${option.id}`, option.label, { action: "created", kind: option.kind });
    return NextResponse.json({ option });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/catalog/options POST");
  }
}

/** New order: { kind, ids } top to bottom. */
export async function PUT(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { kind?: unknown; ids?: unknown } | null;
  try {
    requireCap(actor, "customize");
    if (!body || !isOptionKind(body.kind)) throw new CrmInputError("Lista inválida.");
    await reorderOptions(body.kind, body.ids);
    await auditCatalog(actor, body.kind, body.kind, { action: "reordered", kind: body.kind });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/catalog/options PUT");
  }
}
