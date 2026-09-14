import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { isFullAdmin } from "@/lib/session-scope";
import { createClientUser } from "@/lib/client-access";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest): boolean {
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  return isFullAdmin(scope);
}

/** Adds a new named login under an existing client, sharing its account/permission scope. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const { id } = await params;

  let body: { name?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  if (!name) {
    return NextResponse.json({ error: "Informe o nome da pessoa." }, { status: 400 });
  }

  try {
    const { id: userId, name: userName, password } = await createClientUser(id, name);
    return NextResponse.json({ id: userId, name: userName, password });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/clients/:id/users] POST", err);
    return NextResponse.json({ error: "Não foi possível criar o login." }, { status: 500 });
  }
}
