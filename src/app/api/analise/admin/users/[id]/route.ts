import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin, STAFF_ROLES, type StaffRole } from "@/lib/session-scope";
import {
  getInternalUserSummary,
  updateInternalUser,
  revokeInternalUser,
  countActiveFullAdmins,
} from "@/lib/internal-users";
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

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;

  let body: {
    name?: unknown;
    username?: unknown;
    role?: unknown;
    accountIds?: unknown;
    permissions?: unknown;
    email?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const existing = await getInternalUserSummary(id).catch((err) => {
    if (err instanceof DbConfigError) throw err;
    return null;
  });
  if (!existing) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  const role = body.role !== undefined
    ? (typeof body.role === "string" && STAFF_ROLES.includes(body.role as StaffRole) ? (body.role as StaffRole) : null)
    : undefined;
  if (body.role !== undefined && !role) {
    return NextResponse.json({ error: "Perfil de acesso inválido." }, { status: 400 });
  }

  // Can never demote/remove the last active administrador_geral — the
  // platform would otherwise have nobody left who can manage access at all.
  if (role && role !== "administrador_geral" && existing.role === "administrador_geral") {
    const remaining = await countActiveFullAdmins(id);
    if (remaining === 0) {
      return NextResponse.json(
        { error: "Não é possível remover o último administrador geral ativo." },
        { status: 409 }
      );
    }
  }

  const accountIds = body.accountIds !== undefined
    ? (Array.isArray(body.accountIds) ? body.accountIds.filter((v): v is string => typeof v === "string") : [])
    : undefined;
  const effectiveRole = role ?? existing.role;
  if (accountIds !== undefined && effectiveRole !== "administrador_geral" && accountIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma empresa autorizada." }, { status: 400 });
  }

  const permissions = body.permissions !== undefined ? sanitizePermissions(body.permissions) : undefined;
  const email = body.email !== undefined ? (typeof body.email === "string" && body.email.trim() ? body.email.trim() : null) : undefined;
  if (email && !email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }
  const name = typeof body.name === "string" ? body.name.trim() : undefined;
  if (body.name !== undefined && !name) {
    return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  }
  const username = typeof body.username === "string" ? body.username : undefined;

  try {
    await updateInternalUser(id, { name, username, role: role ?? undefined, accountIds, permissions, email });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    if (err instanceof UsernameTakenError || err instanceof InvalidUsernameError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[api/analise/admin/users/:id] PATCH", err);
    return NextResponse.json({ error: "Não foi possível atualizar o usuário." }, { status: 500 });
  }

  const changedFields = Object.keys(body);
  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: role !== undefined ? "user.role_change" : accountIds !== undefined ? "user.company_change" : permissions !== undefined ? "user.permissions_change" : username !== undefined ? "user.username_change" : "user.permissions_change",
    targetType: "internal_user",
    targetId: id,
    targetLabel: name ?? existing.name,
    metadata: { changedFields },
  });

  return NextResponse.json({ ok: true });
}

export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;

  const existing = await getInternalUserSummary(id).catch((err) => {
    if (err instanceof DbConfigError) throw err;
    return null;
  });
  if (!existing) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  if (existing.role === "administrador_geral") {
    const remaining = await countActiveFullAdmins(id);
    if (remaining === 0) {
      return NextResponse.json(
        { error: "Não é possível revogar o último administrador geral ativo." },
        { status: 409 }
      );
    }
  }

  try {
    await revokeInternalUser(id);
    await writeAudit({
      actorUserId: admin.userId,
      actorLabel: admin.userName,
      actorKind: "admin",
      action: "user.revoke",
      targetType: "internal_user",
      targetId: id,
      targetLabel: existing.name,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/users/:id] DELETE", err);
    return NextResponse.json({ error: "Não foi possível revogar o acesso." }, { status: 500 });
  }
}
