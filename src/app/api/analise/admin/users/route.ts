import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { isFullAdmin, type InternalRole } from "@/lib/session-scope";
import { createInternalUser, listInternalUsers } from "@/lib/internal-users";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

const DB_NOT_CONFIGURED_MESSAGE =
  "Banco de dados não configurado. Veja docs/client-access-setup.md.";

function requireAdmin(req: NextRequest): boolean {
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  return isFullAdmin(scope);
}

const VALID_ROLES: readonly InternalRole[] = ["admin", "analyst"];

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
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
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  let body: { name?: unknown; email?: unknown; role?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const email = typeof body.email === "string" ? body.email.trim() : "";
  const role = typeof body.role === "string" && VALID_ROLES.includes(body.role as InternalRole)
    ? (body.role as InternalRole)
    : null;

  if (!name) {
    return NextResponse.json({ error: "Informe o nome." }, { status: 400 });
  }
  if (!email || !email.includes("@")) {
    return NextResponse.json({ error: "Informe um e-mail válido." }, { status: 400 });
  }
  if (!role) {
    return NextResponse.json({ error: "Selecione o nível de acesso." }, { status: 400 });
  }

  try {
    const { id, password } = await createInternalUser(name, email, role);
    return NextResponse.json({ id, name, email, role, password });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Não foi possível criar o login.";
    console.error("[api/analise/admin/users] POST", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
