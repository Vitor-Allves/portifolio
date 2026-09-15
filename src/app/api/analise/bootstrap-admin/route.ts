import { NextRequest, NextResponse } from "next/server";
import { randomUUID, timingSafeEqual } from "crypto";
import { getDb, withTransaction, DbConfigError } from "@/lib/db";
import { hashPassword, MIN_PASSWORD_LENGTH } from "@/lib/password";
import { isValidUsername, USERNAME_RULES_HELP } from "@/lib/username";
import { claimUsernameTx, UsernameTakenError } from "@/lib/username-registry";
import { writeAudit } from "@/lib/audit-log";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) {
    timingSafeEqual(bufA, bufA);
    return false;
  }
  return timingSafeEqual(bufA, bufB);
}

function clientKey(req: NextRequest): string {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/**
 * Self-terminating, one-time route: creates the very first administrador_geral
 * account, authorized by the legacy ANALYTICS_DASHBOARD_PASSWORD env var —
 * this route is what finally lets that variable stop being a standing login
 * credential. It never authenticates a dashboard session on its own and is
 * never checked by /api/analise/login. It only works while zero
 * administrador_geral rows exist; once the first one is created, every
 * subsequent call is rejected regardless of the password supplied, so it
 * can never be replayed to mint a second super-admin or serve as a
 * standing backdoor. The created account still goes through the normal
 * mandatory 2FA enrollment on its first real login.
 */
export async function POST(req: NextRequest) {
  const bootstrapPassword = process.env.ANALYTICS_DASHBOARD_PASSWORD;
  if (!bootstrapPassword) {
    return NextResponse.json(
      { error: "Inicialização não disponível: variável de ambiente não configurada." },
      { status: 503 }
    );
  }

  if (isRateLimited(`bootstrap-admin:${clientKey(req)}`, 5, 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto." }, { status: 429 });
  }

  let db;
  try {
    db = await getDb();
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    throw err;
  }

  const { rows: guardRows } = await db.query<{ count: string }>(
    `SELECT count(*)::text AS count FROM internal_users WHERE role = 'administrador_geral' AND revoked_at IS NULL`
  );
  if (Number(guardRows[0]?.count ?? "0") > 0) {
    return NextResponse.json({ error: "Inicialização já concluída." }, { status: 403 });
  }

  let body: { bootstrapPassword?: unknown; name?: unknown; username?: unknown; password?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  if (typeof body.bootstrapPassword !== "string" || !safeEqual(body.bootstrapPassword, bootstrapPassword)) {
    return NextResponse.json({ error: "Senha de inicialização incorreta." }, { status: 401 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const username = typeof body.username === "string" ? body.username : "";
  const password = typeof body.password === "string" ? body.password : "";

  if (!name) return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  if (!isValidUsername(username)) {
    return NextResponse.json({ error: USERNAME_RULES_HELP }, { status: 400 });
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    return NextResponse.json(
      { error: `A senha deve ter ao menos ${MIN_PASSWORD_LENGTH} caracteres.` },
      { status: 400 }
    );
  }

  const id = randomUUID();
  const passwordHash = await hashPassword(password);

  try {
    await withTransaction(async (client) => {
      // Re-checked inside the transaction to close the race against the
      // pre-check above.
      const guard = await client.query<{ count: string }>(
        `SELECT count(*)::text AS count FROM internal_users WHERE role = 'administrador_geral' AND revoked_at IS NULL`
      );
      if (Number(guard.rows[0]?.count ?? "0") > 0) {
        throw new Error("ALREADY_BOOTSTRAPPED");
      }
      const claimedUsername = await claimUsernameTx(client, username, "internal_users", id);
      await client.query(
        `INSERT INTO internal_users (id, name, username, password_hash, role, must_change_password)
         VALUES ($1,$2,$3,$4,'administrador_geral', false)`,
        [id, name, claimedUsername, passwordHash]
      );
    });
  } catch (err) {
    if (err instanceof Error && err.message === "ALREADY_BOOTSTRAPPED") {
      return NextResponse.json({ error: "Inicialização já concluída." }, { status: 403 });
    }
    if (err instanceof UsernameTakenError) {
      return NextResponse.json({ error: err.message }, { status: 409 });
    }
    console.error("[bootstrap-admin] POST", err);
    return NextResponse.json({ error: "Não foi possível concluir a inicialização." }, { status: 500 });
  }

  await writeAudit({
    actorUserId: id,
    actorLabel: name,
    actorKind: "system",
    action: "user.create",
    targetType: "internal_user",
    targetId: id,
    targetLabel: name,
    metadata: { bootstrap: true, role: "administrador_geral" },
  });

  return NextResponse.json({ ok: true });
}
