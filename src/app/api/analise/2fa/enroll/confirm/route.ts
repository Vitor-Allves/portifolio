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
import { verifyTotpCode } from "@/lib/totp";
import { confirmTotpEnrollment } from "@/lib/internal-users";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

const EXPIRED_ERROR = "Sessão de login expirada. Faça login novamente.";

/** Confirms enrollment with a live 6-digit code from the app the operator just scanned the QR with, flips totp_enabled on, and issues the first full session. */
export async function POST(req: NextRequest) {
  const pending = verifyPendingToken(req.cookies.get(ANALISE_PENDING_COOKIE)?.value);
  if (!pending || pending.stage !== "enroll") {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: 401 });
  }

  if (isRateLimited(`analise-2fa-enroll:${pending.userId}`, 5, 60_000)) {
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
    session_version: number;
    revoked_at: string | null;
  }>(`SELECT id, name, totp_secret_enc, session_version, revoked_at FROM internal_users WHERE id = $1`, [pending.userId]);
  const row = rows[0];
  if (!row || row.revoked_at || !row.totp_secret_enc) {
    return NextResponse.json({ error: EXPIRED_ERROR }, { status: 401 });
  }

  if (!verifyTotpCode(row.totp_secret_enc, code)) {
    return NextResponse.json({ error: "Código inválido." }, { status: 401 });
  }

  await confirmTotpEnrollment(row.id);
  await writeAudit({
    actorUserId: row.id,
    actorLabel: row.name,
    actorKind: "admin",
    action: "auth.2fa_enroll",
    targetType: "internal_user",
    targetId: row.id,
  });

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
