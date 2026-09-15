import { NextRequest, NextResponse } from "next/server";
import { isRateLimited } from "@/lib/rate-limit";
import {
  ANALISE_SESSION_COOKIE,
  ANALISE_PENDING_COOKIE,
  SESSION_MAX_AGE_SECONDS,
  createSessionToken,
  verifyPendingToken,
} from "@/lib/analise-session-node";
import { getDb } from "@/lib/db";
import { verifyTotpCode, verifyRecoveryCode } from "@/lib/totp";
import { consumeRecoveryCode } from "@/lib/internal-users";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

const EXPIRED_ERROR = "Sessão de login expirada. Faça login novamente.";

/** Second step of an administrador_geral login: exchanges a valid pending cookie + TOTP code (or single-use recovery code) for a full session. */
export async function POST(req: NextRequest) {
  const pending = verifyPendingToken(req.cookies.get(ANALISE_PENDING_COOKIE)?.value);
  if (!pending || pending.stage !== "verify") {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: 401 });
  }

  if (isRateLimited(`analise-2fa:${pending.userId}`, 5, 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
  }

  let code: unknown;
  try {
    const body = (await req.json()) as { code?: unknown };
    code = body.code;
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  if (typeof code !== "string" || !code.trim()) {
    return NextResponse.json({ error: "Informe o código." }, { status: 400 });
  }

  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    name: string;
    totp_secret_enc: string | null;
    totp_recovery_hashes: string[];
    session_version: number;
    revoked_at: string | null;
  }>(
    `SELECT id, name, totp_secret_enc, totp_recovery_hashes, session_version, revoked_at
     FROM internal_users WHERE id = $1`,
    [pending.userId]
  );
  const row = rows[0];
  if (!row || row.revoked_at || !row.totp_secret_enc) {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: 401 });
  }

  let ok = verifyTotpCode(row.totp_secret_enc, code);
  let usedRecoveryCode = false;
  if (!ok) {
    const idx = verifyRecoveryCode(code, row.totp_recovery_hashes);
    if (idx >= 0) {
      ok = true;
      usedRecoveryCode = true;
      await consumeRecoveryCode(row.id, row.totp_recovery_hashes.filter((_, i) => i !== idx));
    }
  }

  if (!ok) {
    return NextResponse.json({ error: "Código inválido." }, { status: 401 });
  }

  if (usedRecoveryCode) {
    await writeAudit({
      actorUserId: row.id,
      actorLabel: row.name,
      actorKind: "admin",
      action: "auth.2fa_enroll",
      targetType: "internal_user",
      targetId: row.id,
      metadata: { event: "recovery_code_used" },
    });
  }

  const token = createSessionToken("staff", row.id, row.session_version);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(ANALISE_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: SESSION_MAX_AGE_SECONDS,
  });
  res.cookies.delete(ANALISE_PENDING_COOKIE);
  return res;
}
