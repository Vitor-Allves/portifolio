import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { updateClientUser, revokeClientUser } from "@/lib/client-access";
import { UsernameTakenError, InvalidUsernameError } from "@/lib/username-registry";
import { sanitizePermissions } from "@/lib/client-permissions";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

async function requireFullAdmin(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) return null;
  return scope;
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id, userId } = await params;

  let body: { name?: unknown; username?: unknown; permissionsOverride?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name : undefined;
  const username = typeof body.username === "string" ? body.username : undefined;
  // Explicit null clears the override (inherit the company's permissions
  // again); omitted leaves it unchanged; an object sets a new override.
  const permissionsOverride =
    body.permissionsOverride === null ? null : body.permissionsOverride !== undefined ? sanitizePermissions(body.permissionsOverride) : undefined;

  try {
    await updateClientUser(id, userId, { name, username, permissionsOverride });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    if (err instanceof UsernameTakenError || err instanceof InvalidUsernameError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Não foi possível atualizar o usuário.";
    console.error("[api/analise/admin/clients/:id/users/:userId] PATCH", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: permissionsOverride !== undefined ? "user.permissions_change" : "user.username_change",
    targetType: "client_access_user",
    targetId: userId,
    metadata: { clientAccessId: id, changedFields: Object.keys(body) },
  });

  return NextResponse.json({ ok: true });
}

/** Revokes one named login under a company without affecting anyone else under it. */
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const { id, userId } = await params;

  try {
    await revokeClientUser(id, userId);
    await writeAudit({
      actorUserId: admin.userId,
      actorLabel: admin.userName,
      actorKind: "admin",
      action: "user.revoke",
      targetType: "client_access_user",
      targetId: userId,
      metadata: { clientAccessId: id },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/clients/:id/users/:userId] DELETE", err);
    return NextResponse.json({ error: "Não foi possível revogar o login." }, { status: 500 });
  }
}
