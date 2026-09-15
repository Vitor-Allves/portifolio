import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { createClientAccess, listClientAccess } from "@/lib/client-access";
import { sanitizePermissions } from "@/lib/client-permissions";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

const DB_NOT_CONFIGURED_MESSAGE = "Banco de dados não configurado. Veja docs/client-access-setup.md.";

async function requireFullAdmin(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) return null;
  return scope;
}

/** Clientes — every non-revoked company, each with its own list of people who access it. The company (empresa) and the people (pessoas) are deliberately distinct concepts here — see client-access-types.ts. */
export async function GET(req: NextRequest) {
  if (!(await requireFullAdmin(req))) {
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

/** Creates a new company — no login of its own. Add people under it via POST /clients/:id/users. */
export async function POST(req: NextRequest) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  let body: { label?: unknown; accountIds?: unknown; permissions?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const label = typeof body.label === "string" ? body.label.trim() : "";
  const accountIds = Array.isArray(body.accountIds) ? body.accountIds.filter((id): id is string => typeof id === "string") : [];
  const permissions = sanitizePermissions(body.permissions);

  if (!label) {
    return NextResponse.json({ error: "Informe o nome da empresa." }, { status: 400 });
  }
  if (accountIds.length === 0) {
    return NextResponse.json({ error: "Selecione ao menos uma conta de anúncios." }, { status: 400 });
  }

  try {
    const { id } = await createClientAccess(label, accountIds, permissions);
    await writeAudit({
      actorUserId: admin.userId,
      actorLabel: admin.userName,
      actorKind: "admin",
      action: "user.create",
      targetType: "client_access",
      targetId: id,
      targetLabel: label,
      metadata: { accountIds },
    });
    return NextResponse.json({ id, label });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    const message = err instanceof Error ? err.message : "Não foi possível criar a empresa.";
    console.error("[api/analise/admin/clients] POST", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
