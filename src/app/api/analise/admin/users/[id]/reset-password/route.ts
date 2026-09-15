import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { getInternalUserSummary, resetInternalUserPassword, verifyInternalUserPassword } from "@/lib/internal-users";
import { generatePassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * Administrative password reset — restricted to administrador_geral (never
 * implicitly available to anyone who can merely list users). Requires the
 * acting admin to re-confirm their OWN current password in the same
 * request (brief §4, step 2) before anything is changed. Either accepts an
 * admin-chosen temporary password or generates a strong one; either way it
 * is returned in the response exactly once, here, and never logged or
 * stored in plaintext anywhere. Immediately invalidates every existing
 * session for the target account and forces a change on next login.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await sessionScopeFromRequest(req);
  if (!hasDataAccess(admin) || !isFullAdmin(admin)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;

  if (isRateLimited(`analise-reset-password:${admin.userId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
  }

  let body: { adminPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown; generate?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";
  if (!adminPassword) {
    return NextResponse.json({ error: "Confirme sua senha para continuar." }, { status: 400 });
  }
  if (!(await verifyInternalUserPassword(admin.userId, adminPassword))) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  }

  const target = await getInternalUserSummary(id).catch((err) => {
    if (err instanceof DbConfigError) throw err;
    return null;
  });
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  let newPassword: string;
  if (body.generate) {
    newPassword = generatePassword();
  } else {
    const raw = typeof body.newPassword === "string" ? body.newPassword : "";
    const confirm = typeof body.confirmPassword === "string" ? body.confirmPassword : "";
    if (raw.length < MIN_PASSWORD_LENGTH) {
      return NextResponse.json({ error: `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
    }
    if (raw !== confirm) {
      return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
    }
    newPassword = raw;
  }

  try {
    await resetInternalUserPassword(id, newPassword);
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/users/:id/reset-password] POST", err);
    return NextResponse.json({ error: "Não foi possível redefinir a senha." }, { status: 500 });
  }

  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: "user.password_reset",
    targetType: "internal_user",
    targetId: id,
    targetLabel: target.name,
  });

  return NextResponse.json({ ok: true, password: newPassword });
}
