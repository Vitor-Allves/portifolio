import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { listAuditLog } from "@/lib/audit-log";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  try {
    const entries = await listAuditLog(200);
    return NextResponse.json({ entries });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/audit-log] GET", err);
    return NextResponse.json({ error: "Não foi possível carregar o histórico." }, { status: 500 });
  }
}
