import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { setCrmAccess } from "@/lib/crm-access";

export const runtime = "nodejs";

/** { access: "administrador" | "gestor" | "comercial" | "marketing" | "sem_acesso" } — Administrador only, logged in the audit trail. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { access?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const change = await setCrmAccess(actor, id, body.access);
    if (change.from !== change.to) {
      await writeAudit({
        actorUserId: actor.userId,
        actorLabel: actor.userName,
        actorKind: "admin",
        action: "crm.role_change",
        targetType: "internal_user",
        targetId: id,
        targetLabel: change.name,
        metadata: { from: change.from, to: change.to },
      });
    }
    return NextResponse.json({ ok: true, access: change.to });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id] PATCH");
  }
}
