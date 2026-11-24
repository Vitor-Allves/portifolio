import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { isOptionKind } from "@/lib/crm-catalog";
import { setOptionArchived, updateOption } from "@/lib/crm-options";
import { auditCatalog } from "../../../audit";

export const runtime = "nodejs";

/** { label?, description?, color?, meta? } and/or { archived: boolean }. Administrador only. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ kind: string; id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { kind, id } = await params;
  const body = (await req.json().catch(() => null)) as { label?: unknown; description?: unknown; color?: unknown; meta?: unknown; archived?: unknown } | null;
  try {
    requireCap(actor, "customize");
    if (!isOptionKind(kind) || !body) throw new CrmInputError("Requisição inválida.");
    let option;
    if (body.label !== undefined || body.description !== undefined || body.color !== undefined || body.meta !== undefined) {
      const r = await updateOption(kind, id, body);
      option = r.after;
      if (r.before !== r.after.label) {
        await auditCatalog(actor, `${kind}:${id}`, r.after.label, { action: "renamed", kind, from: r.before, to: r.after.label, records: r.renamedRecords });
      }
      if (JSON.stringify(r.metaBefore) !== JSON.stringify(r.after.meta)) {
        // Probabilidade de uma etapa, grupo de tabulação de um motivo, detalhes de um serviço.
        await auditCatalog(actor, `${kind}:${id}`, r.after.label, { action: "details", kind, from: r.metaBefore, to: r.after.meta });
      }
      if (r.colorBefore !== r.after.color) {
        await auditCatalog(actor, `${kind}:${id}`, r.after.label, { action: "recolored", kind, from: r.colorBefore, to: r.after.color });
      }
    }
    if (typeof body.archived === "boolean") {
      option = await setOptionArchived(kind, id, body.archived);
      await auditCatalog(actor, `${kind}:${id}`, option.label, { action: body.archived ? "archived" : "restored", kind });
    }
    if (!option) throw new CrmInputError("Nada para alterar.");
    return NextResponse.json({ option });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/catalog/options/[kind]/[id] PATCH");
  }
}
