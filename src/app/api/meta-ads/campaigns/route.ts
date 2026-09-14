import { NextRequest, NextResponse } from "next/server";
import { getDashboardData, isValidDatePreset, MetaApiError } from "@/lib/meta-ads";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const datePresetParam = req.nextUrl.searchParams.get("date_preset") ?? "last_30d";
  if (!isValidDatePreset(datePresetParam)) {
    return NextResponse.json({ error: "Período inválido." }, { status: 400 });
  }

  // Middleware already requires a valid session to reach this route — this
  // re-check only decides the scope (which accounts this session may see),
  // never bare pass/fail.
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  const allowedAccountIds = scope?.kind === "client" ? scope.accountIds : undefined;

  try {
    const data = await getDashboardData(datePresetParam, allowedAccountIds);
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/meta-ads/campaigns]", err);
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json(
      { error: "Não foi possível carregar os dados de campanhas da Meta agora." },
      { status }
    );
  }
}
