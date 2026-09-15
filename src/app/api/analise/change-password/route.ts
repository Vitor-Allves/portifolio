import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import { ANALISE_SESSION_COOKIE, SESSION_MAX_AGE_SECONDS, createSessionToken } from "@/lib/analise-session-node";
import { sessionScopeFromRequest } from "@/lib/auth-context";
import { MIN_PASSWORD_LENGTH } from "@/lib/password";
import { verifyInternalUserPassword, changeOwnInternalPassword } from "@/lib/internal-users";
import { verifyClientUserPassword, changeOwnClientPassword } from "@/lib/client-access";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * Self-service password change — the only mutation a session mid forced
 * password change is allowed to perform. Always requires the current
 * password (including the temporary one from a fresh account or an
 * admin reset), so a hijacked session token alone can't lock the real
 * owner out. Bumps session_version, invalidating every OTHER open session
 * for the account, and re-issues a fresh cookie for this one.
 */
export async function POST(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!scope) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (isRateLimited(`analise-change-password:${scope.userId}`, 5, 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
  }

  let body: { currentPassword?: unknown; newPassword?: unknown; confirmPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const currentPassword = typeof body.currentPassword === "string" ? body.currentPassword : "";
  const newPassword = typeof body.newPassword === "string" ? body.newPassword : "";
  const confirmPassword = typeof body.confirmPassword === "string" ? body.confirmPassword : "";

  if (!currentPassword) {
    return NextResponse.json({ error: "Informe a senha atual." }, { status: 400 });
  }
  if (newPassword.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json({ error: `A nova senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` }, { status: 400 });
  }
  if (newPassword !== confirmPassword) {
    return NextResponse.json({ error: "As senhas não coincidem." }, { status: 400 });
  }
  if (newPassword === currentPassword) {
    return NextResponse.json({ error: "A nova senha deve ser diferente da atual." }, { status: 400 });
  }

  const ok =
    scope.kind === "staff"
      ? await verifyInternalUserPassword(scope.userId, currentPassword)
      : await verifyClientUserPassword(scope.userId, currentPassword);
  if (!ok) {
    return NextResponse.json({ error: "Senha atual incorreta." }, { status: 401 });
  }

  const newSessionVersion =
    scope.kind === "staff"
      ? await changeOwnInternalPassword(scope.userId, newPassword)
      : await changeOwnClientPassword(scope.userId, newPassword);

  await writeAudit({
    actorUserId: scope.userId,
    actorLabel: scope.userName,
    actorKind: scope.kind === "staff" ? "admin" : "client",
    action: "user.password_change_self",
    targetType: scope.kind === "staff" ? "internal_user" : "client_access_user",
    targetId: scope.userId,
  });

  const token = createSessionToken(scope.kind, scope.userId, newSessionVersion);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ANALISE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  return res;
}
