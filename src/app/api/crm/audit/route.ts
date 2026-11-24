import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { listAdminAudit, listCommercialChanges } from "@/lib/crm-audit";

export const runtime = "nodejs";

/**
 * Auditoria (Administrador). ?tab=admin (ações administrativas, audit_log
 * crm.*) | comercial (mudanças nos registros); filters actor, from, to
 * (YYYY-MM-DD, Brasília), action (admin) or kind (comercial), page.
 */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const get = (k: string) => p.get(k)?.trim() || undefined;
  const filters = {
    actor: get("actor"),
    from: get("from"),
    to: get("to"),
    page: Math.max(1, Math.floor(Number(p.get("page")) || 1)),
    pageSize: 50,
  };
  try {
    requireCap(actor, "manageTeam");
    if (p.get("tab") === "comercial") return NextResponse.json(await listCommercialChanges({ ...filters, kind: get("kind") }));
    return NextResponse.json(await listAdminAudit({ ...filters, action: get("action") }));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/audit GET");
  }
}
