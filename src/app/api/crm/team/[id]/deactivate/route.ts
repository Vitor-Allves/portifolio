import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { confirmAdminPassword, crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { deactivateCrmUser, requireCap } from "@/lib/crm-access";

export const runtime = "nodejs";

/** Deactivates a CRM-only login (Administrador, confirming their own password). Nothing they did is removed. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { adminPassword?: unknown } | null;
  try {
    requireCap(actor, "manageTeam");
    const denied = await confirmAdminPassword(actor, body?.adminPassword);
    if (denied) return denied;
    const target = await deactivateCrmUser(actor, id);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.user_deactivate",
      targetType: "internal_user",
      targetId: id,
      targetLabel: target.name,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id]/deactivate POST");
  }
}
