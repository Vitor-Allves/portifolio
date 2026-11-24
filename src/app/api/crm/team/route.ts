import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { confirmAdminPassword, crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { createCrmUser, listCrmTeam, requireCap, type NewCrmUserInput } from "@/lib/crm-access";

export const runtime = "nodejs";

/** The staff, their CRM profile, exceptions, cargo and departamento — Administrador only. ?inactive=1 includes deactivated people. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "manageTeam");
    return NextResponse.json({ team: await listCrmTeam(req.nextUrl.searchParams.get("inactive") === "1") });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team GET");
  }
}

/**
 * New CRM-only login (Administrador, confirming their own password):
 * { name, username, email?, access, jobTitle?, department?, adminPassword }.
 * Returns the temporary password once; it must be changed on the first login.
 */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as (NewCrmUserInput & { adminPassword?: unknown }) | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "manageTeam");
    const denied = await confirmAdminPassword(actor, body.adminPassword);
    if (denied) return denied;
    const created = await createCrmUser(actor, body);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.user_create",
      targetType: "internal_user",
      targetId: created.id,
      targetLabel: typeof body.name === "string" ? body.name.trim() : created.username,
      metadata: { username: created.username, access: body.access, crmOnly: true },
    });
    return NextResponse.json(created, { status: 201, headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team POST");
  }
}
