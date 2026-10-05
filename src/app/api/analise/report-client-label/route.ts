import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { resolveAllowedAccountIds } from "@/lib/session-scope";
import { resolveReportClients } from "@/lib/client-access";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

export type ReportClientLabelResponse = { label: string | null; isMultiClient: boolean };

/**
 * Who the live dashboard's "Falar com meu consultor" button should say this
 * is ABOUT, for the current account-filter selection — never the viewer's
 * own name. A client session always resolves to exactly its own company
 * (no DB round trip needed for that). A staff session resolves from the
 * Meta account ids actually in view, intersected with whatever that session
 * is itself allowed to see, so this can never reveal more than the caller's
 * own existing account-access boundary already does.
 */
export async function GET(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  if (scope.kind === "client") {
    return NextResponse.json({ label: scope.label, isMultiClient: false } satisfies ReportClientLabelResponse);
  }

  const requestedParam = req.nextUrl.searchParams.get("accountIds");
  const requested = requestedParam ? requestedParam.split(",").filter(Boolean) : null;
  const allowed = resolveAllowedAccountIds(scope); // null = unrestricted (administrador_geral)
  const effectiveIds = requested ? (allowed ? requested.filter((id) => allowed.includes(id)) : requested) : allowed ?? [];

  try {
    const resolution = await resolveReportClients(effectiveIds);
    if (resolution.kind === "single") {
      return NextResponse.json({ label: resolution.client.label, isMultiClient: false } satisfies ReportClientLabelResponse);
    }
    if (resolution.kind === "multiple") {
      return NextResponse.json({ label: null, isMultiClient: true } satisfies ReportClientLabelResponse);
    }
    return NextResponse.json({ label: null, isMultiClient: false } satisfies ReportClientLabelResponse);
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ label: null, isMultiClient: false } satisfies ReportClientLabelResponse);
    }
    console.error("[api/analise/report-client-label] GET", err);
    return NextResponse.json({ error: "Não foi possível apurar o cliente deste filtro." }, { status: 500 });
  }
}
