import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { getReportClientSelection } from "@/lib/report-client-selections";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

/**
 * "Lembrar esta seleção para este cliente" (Parte 1, regra (a)) — read side.
 * A client session always resolves to its own company; a staff session must
 * name which client via ?clientId= (the admin's own chosen recipient in the
 * Reports panel) — with no id, there's no single client to key on and the
 * drawer falls back to its own rule (b)/(c) defaulting instead.
 */
export async function GET(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  const clientId = scope.kind === "client" ? scope.clientAccessId : req.nextUrl.searchParams.get("clientId");
  if (!clientId) {
    return NextResponse.json({ selection: null });
  }

  try {
    const selection = await getReportClientSelection(clientId);
    return NextResponse.json({ selection });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ selection: null });
    }
    console.error("[api/analise/report-client-selection] GET", err);
    return NextResponse.json({ error: "Não foi possível carregar a última seleção." }, { status: 500 });
  }
}
