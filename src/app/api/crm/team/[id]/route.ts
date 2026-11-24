import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { updateTeamMember, type TeamPatch } from "@/lib/crm-access";

export const runtime = "nodejs";

/**
 * { access?, permissions?, jobTitle?, department? } — Administrador only.
 * Profile and permission changes go to the audit trail with before → after.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as TeamPatch | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const change = await updateTeamMember(actor, id, body);
    const base = { actorUserId: actor.userId, actorLabel: actor.userName, actorKind: "admin" as const, targetType: "internal_user", targetId: id, targetLabel: change.name };
    if (change.access) await writeAudit({ ...base, action: "crm.role_change", metadata: { from: change.access.from, to: change.access.to } });
    if (change.permissions) await writeAudit({ ...base, action: "crm.permission_change", metadata: { from: change.permissions.from, to: change.permissions.to } });
    if (change.details) await writeAudit({ ...base, action: "crm.user_update", metadata: change.details });
    return NextResponse.json({ ok: true, access: change.access?.to, endedSessions: change.endedSessions ?? false });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id] PATCH");
  }
}
