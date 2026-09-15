import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { createClientUser } from "@/lib/client-access";
import { UsernameTakenError, InvalidUsernameError } from "@/lib/username-registry";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { sanitizePermissions } from "@/lib/client-permissions";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

async function requireFullAdmin(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) return null;
  return scope;
}

/** Adds a new named login under an existing company, with an admin-chosen initial password. Optionally overrides the company's default permissions for this one person. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;

  let body: { name?: unknown; username?: unknown; password?: unknown; confirmPassword?: unknown; permissionsOverride?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
  const permissionsOverride = body.permissionsOverride ? sanitizePermissions(body.permissionsOverride) : null;

  if (!name) return NextResponse.json({ error: "Informe o nome da pessoa." }, { status: 400 });
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
  }
  if (password !== confirmPassword) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }

  try {
    const { id: userId } = await createClientUser(id, { name, username, password, permissionsOverride });
    await writeAudit({
      actorUserId: admin.userId,
      actorLabel: admin.userName,
      actorKind: "admin",
      action: "user.create",
      targetType: "client_access_user",
      targetId: userId,
      targetLabel: name,
      metadata: { clientAccessId: id },
    });
    return NextResponse.json({ id: userId, name });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    if (err instanceof UsernameTakenError || err instanceof InvalidUsernameError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    const message = err instanceof Error ? err.message : "Não foi possível criar o login.";
    console.error("[api/analise/admin/clients/:id/users] POST", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
