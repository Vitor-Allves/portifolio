import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardData,
  isValidDatePreset,
  isValidDateRange,
  MAX_CUSTOM_RANGE_DAYS,
  MetaApiError,
  type Period,
} from "@/lib/meta-ads";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";

export const runtime = "nodejs";

function resolvePeriod(req: NextRequest): Period | { error: string } {
  const since = req.nextUrl.searchParams.get("since");
  const until = req.nextUrl.searchParams.get("until");

  if (since || until) {
    if (!since || !until || !isValidDateRange({ since, until })) {
      return {
        error: `Período inválido. Use datas no formato AAAA-MM-DD, com início antes do fim e no máximo ${MAX_CUSTOM_RANGE_DAYS} dias de intervalo.`,
      };
    }
    return { kind: "custom", range: { since, until } };
  }

  const datePresetParam = req.nextUrl.searchParams.get("date_preset") ?? "last_30d";
  if (!isValidDatePreset(datePresetParam)) {
    return { error: "Período inválido." };
  }
  return { kind: "preset", preset: datePresetParam };
}

export async function GET(req: NextRequest) {
  const period = resolvePeriod(req);
  if ("error" in period) {
    return NextResponse.json({ error: period.error }, { status: 400 });
  }

  // Middleware already requires a valid session to reach this route — this
  // re-check only decides the scope (which accounts this session may see),
  // never bare pass/fail.
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  const allowedAccountIds = scope?.kind === "client" ? scope.accountIds : undefined;

  try {
    const data = await getDashboardData(period, allowedAccountIds);
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
