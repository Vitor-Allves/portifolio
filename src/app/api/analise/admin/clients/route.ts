import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { createClientAccess, listClientAccess } from "@/lib/client-access";
import { sanitizePermissions } from "@/lib/client-permissions";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

const DB_NOT_CONFIGURED_MESSAGE =
  "Banco de dados não configurado. Veja docs/client-access-setup.md.";

function requireAdmin(req: NextRequest): boolean {
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  return scope?.kind === "admin";
}

export async function GET(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const clients = await listClientAccess();
    return NextResponse.json({ clients });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    console.error("[api/analise/admin/clients] GET", err);
    return NextResponse.json({ error: "Não foi possível carregar os clientes." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  let body: { label?: unknown; accountIds?: unknown; permissions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const accountIds = Array.isArray(body.accountIds)
    ? body.accountIds.filter((id): id is string => typeof id === "string")
    : [];
  const permissions = sanitizePermissions(body.permissions);

  if (!label) {
    return NextResponse.json({ error: "Informe o nome do cliente." }, { status: 400 });
  }
  if (accountIds.length === 0) {
    return NextResponse.json(
      { error: "Selecione ao menos uma conta de anúncios." },
      { status: 400 }
    );
  }

  try {
    const { id, password } = await createClientAccess(label, accountIds, permissions);
    return NextResponse.json({ id, label, password });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    console.error("[api/analise/admin/clients] POST", err);
    return NextResponse.json({ error: "Não foi possível criar o acesso." }, { status: 500 });
  }
}
