import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { listInternalIndicatorIds, setInternalIndicatorIds } from "@/lib/internal-indicators";
import { sanitizeIndicatorIds } from "@/lib/report-indicators";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

async function requireFullAdmin(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) return null;
  return scope;
}

/** The global "uso interno" flag list — administrador_geral only, same as every other admin-only route in this codebase. */
export async function GET(req: NextRequest) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  try {
    const ids = await listInternalIndicatorIds();
    return NextResponse.json({ ids });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/internal-indicators] GET", err);
    return NextResponse.json({ error: "Não foi possível carregar os indicadores de uso interno." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  let body: { ids?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const ids = sanitizeIndicatorIds(body.ids);

  try {
    await setInternalIndicatorIds(ids);
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/internal-indicators] PUT", err);
    return NextResponse.json({ error: "Não foi possível salvar." }, { status: 500 });
  }

  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: "user.permissions_change",
    targetType: "report_internal_indicators",
    targetId: null,
    metadata: { ids },
  });

  return NextResponse.json({ ok: true, ids });
}
