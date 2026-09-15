import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin, STAFF_ROLES, type StaffRole } from "@/lib/session-scope";
import { createInternalUser, listInternalUsers } from "@/lib/internal-users";
import { UsernameTakenError, InvalidUsernameError } from "@/lib/username-registry";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { sanitizePermissions } from "@/lib/client-permissions";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

const DB_NOT_CONFIGURED_MESSAGE = "Banco de dados não configurado. Veja docs/client-access-setup.md.";

async function requireFullAdmin(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) return null;
  return scope;
}

/** Equipe Legado — every non-revoked staff account, any role. Listing itself is restricted to administrador_geral (see brief §4: reset capability, and by extension management, must never be reachable "implicitly" just by having list access). */
export async function GET(req: NextRequest) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const users = await listInternalUsers();
    return NextResponse.json({ users });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    console.error("[api/analise/admin/users] GET", err);
    return NextResponse.json({ error: "Não foi possível carregar a equipe." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  let body: {
    name?: unknown;
    username?: unknown;
    password?: unknown;
    confirmPassword?: unknown;
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

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  const role = typeof body.role === "string" && STAFF_ROLES.includes(body.role as StaffRole) ? (body.role as StaffRole) : null;
  const accountIds = Array.isArray(body.accountIds) ? body.accountIds.filter((id): id is string => typeof id === "string") : [];
  const permissions = sanitizePermissions(body.permissions);
  const email = typeof body.email === "string" && body.email.trim() ? body.email.trim() : null;

  if (!name) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  if (!role) return NextResponse.json({ error: "Selecione o perfil de acesso." }, { status: 400 });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }
  // Every role except administrador_geral is scoped to explicit companies —
  // an empty list would silently mean "sees nothing", which is almost
  // certainly not what the admin intended when creating the account.
  if (role !== "administrador_geral" && accountIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma empresa autorizada." }, { status: 400 });
  }
  if (email && !email.includes("@")) {
    return NextResponse.json({ error: "E-mail inválido." }, { status: 400 });
  }

  try {
    const { id } = await createInternalUser({ name, username, password, role, accountIds, permissions, email });
    await writeAudit({
      actorUserId: admin.userId,
      actorLabel: admin.userName,
      actorKind: "admin",
      action: "user.create",
      targetType: "internal_user",
      targetId: id,
      targetLabel: name,
      metadata: { role, accountIds },
    });
    return NextResponse.json({ id });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    if (err instanceof UsernameTakenError || err instanceof InvalidUsernameError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Não foi possível criar o login.";
    console.error("[api/analise/admin/users] POST", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
