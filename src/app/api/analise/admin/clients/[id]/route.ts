import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { updateClientAccess, revokeClientAccess } from "@/lib/client-access";
import { sanitizePermissions } from "@/lib/client-permissions";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

async function requireFullAdmin(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) return null;
  return scope;
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;

  let body: { label?: unknown; accountIds?: unknown; permissions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label : undefined;
  const accountIds = body.accountIds !== undefined
    ? (Array.isArray(body.accountIds) ? body.accountIds.filter((v): v is string => typeof v === "string") : [])
    : undefined;
  const permissions = body.permissions !== undefined ? sanitizePermissions(body.permissions) : undefined;

  try {
    await updateClientAccess(id, { label, accountIds, permissions });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Não foi possível atualizar a empresa.";
    console.error("[api/analise/admin/clients/:id] PATCH", err);
    return NextResponse.json({ error: message }, { status: 400 });
  }

  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: accountIds !== undefined ? "user.company_change" : "user.permissions_change",
    targetType: "client_access",
    targetId: id,
    metadata: { changedFields: Object.keys(body) },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const { id } = await params;

  try {
    await revokeClientAccess(id);
    await writeAudit({
      actorUserId: admin.userId,
      actorLabel: admin.userName,
      actorKind: "admin",
      action: "user.revoke",
      targetType: "client_access",
      targetId: id,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/clients/:id] DELETE", err);
    return NextResponse.json({ error: "Não foi possível revogar o acesso." }, { status: 500 });
  }
}
