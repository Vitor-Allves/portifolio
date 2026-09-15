import { NextRequest, NextResponse } from "next/server";
import { ANALISE_PENDING_COOKIE, verifyPendingToken } from "@/lib/analise-session-node";
import { getDb } from "@/lib/db";
import { startTotpEnrollment } from "@/lib/totp";
import { setTotpEnrollment } from "@/lib/internal-users";

export const runtime = "nodejs";

const EXPIRED_ERROR = "Sessão de login expirada. Faça login novamente.";

/** First login for an administrador_geral without 2FA yet: generates a fresh TOTP secret + QR + one-time recovery codes. Safe to call again before confirming — each call overwrites the not-yet-enabled secret. The recovery codes are returned in plaintext exactly once, here; only their hashes are ever persisted. */
export async function POST(req: NextRequest) {
  const pending = verifyPendingToken(req.cookies.get(ANALISE_PENDING_COOKIE)?.value);
  if (!pending || pending.stage !== "enroll") {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: 401 });
  }

  const db = await getDb();
  const { rows } = await db.query<{ username: string; totp_enabled: boolean; revoked_at: string | null }>(
    `SELECT username, totp_enabled, revoked_at FROM internal_users WHERE id = $1`,
    [pending.userId]
  );
  const row = rows[0];
  if (!row || row.revoked_at) {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: 401 });
  }
  if (row.totp_enabled) {
    return NextResponse.json({ error: "A autenticação em duas etapas já está configurada." }, { status: 400 });
  }

  const enrollment = await startTotpEnrollment(row.username);
  await setTotpEnrollment(pending.userId, enrollment.secretEnc, enrollment.recoveryCodeHashes);

  return NextResponse.json({
    otpauthUri: enrollment.otpauthUri,
    qrDataUrl: enrollment.qrDataUrl,
    recoveryCodes: enrollment.recoveryCodes,
  });
}
