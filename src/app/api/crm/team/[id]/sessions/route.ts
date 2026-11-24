import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { confirmAdminPassword, crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { endSessions, requireCap } from "@/lib/crm-access";

export const runtime = "nodejs";

/** Encerrar sessões: signs the person out on every device (Administrador, confirming their own password). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { adminPassword?: unknown } | null;
  try {
    requireCap(actor, "manageTeam");
    const denied = await confirmAdminPassword(actor, body?.adminPassword);
    if (denied) return denied;
    const target = await endSessions(actor, id);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.session_end",
      targetType: "internal_user",
      targetId: id,
      targetLabel: target.name,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id]/sessions DELETE");
  }
}
