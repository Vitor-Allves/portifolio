import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { resetClientUserPassword } from "@/lib/client-access";
import { verifyInternalUserPassword } from "@/lib/internal-users";
import { generatePassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

/** Same administrative reset flow as for staff accounts — restricted to administrador_geral, requires the acting admin's own password, returns the new password exactly once. */
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; userId: string }> }
) {
  const admin = await sessionScopeFromRequest(req);
  if (!hasDataAccess(admin) || !isFullAdmin(admin)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id, userId } = await params;

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
  if (!adminPassword || !(await verifyInternalUserPassword(admin.userId, adminPassword))) {
    return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
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
    await resetClientUserPassword(id, userId, newPassword);
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/clients/:id/users/:userId/reset-password] POST", err);
    return NextResponse.json({ error: "Não foi possível redefinir a senha." }, { status: 500 });
  }

  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: "user.password_reset",
    targetType: "client_access_user",
    targetId: userId,
    metadata: { clientAccessId: id },
  });

  return NextResponse.json({ ok: true, password: newPassword });
}
