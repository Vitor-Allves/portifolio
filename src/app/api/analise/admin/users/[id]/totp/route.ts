import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { getInternalUserSummary, resetTotp, verifyInternalUserPassword } from "@/lib/internal-users";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

/** Administrative 2FA reset — for a colleague who lost their authenticator device. Clears their current secret/recovery codes and invalidates their sessions; they walk through enrollment again on next login. Requires the acting admin's own password, same as a password reset. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await sessionScopeFromRequest(req);
  if (!hasDataAccess(admin) || !isFullAdmin(admin)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;

  let body: { adminPassword?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const adminPassword = typeof body.adminPassword === "string" ? body.adminPassword : "";
  if (!adminPassword || !(await verifyInternalUserPassword(admin.userId, adminPassword))) {
    return NextResponse.json({ error: "Confirme sua senha para continuar." }, { status: 401 });
  }

  const target = await getInternalUserSummary(id).catch((err) => {
    if (err instanceof DbConfigError) throw err;
    return null;
  });
  if (!target) {
    return NextResponse.json({ error: "Usuário não encontrado." }, { status: 404 });
  }

  try {
    await resetTotp(id);
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/users/:id/totp] DELETE", err);
    return NextResponse.json({ error: "Não foi possível redefinir o 2FA." }, { status: 500 });
  }

  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: "auth.2fa_reset_by_admin",
    targetType: "internal_user",
    targetId: id,
    targetLabel: target.name,
  });

  return NextResponse.json({ ok: true });
}
