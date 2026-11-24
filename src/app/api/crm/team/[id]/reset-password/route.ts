import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { confirmAdminPassword, crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, resetCrmUserPassword } from "@/lib/crm-access";

export const runtime = "nodejs";

/** New temporary password for a CRM-only login (Administrador, confirming their own password); shown once, never stored in the clear. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { adminPassword?: unknown } | null;
  try {
    requireCap(actor, "manageTeam");
    const denied = await confirmAdminPassword(actor, body?.adminPassword);
    if (denied) return denied;
    const { target, password } = await resetCrmUserPassword(actor, id);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.user_password_reset",
      targetType: "internal_user",
      targetId: id,
      targetLabel: target.name,
    });
    return NextResponse.json({ password }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id]/reset-password POST");
  }
}
