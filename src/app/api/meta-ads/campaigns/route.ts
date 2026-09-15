import { NextRequest, NextResponse } from "next/server";
import {
  getDashboardData,
  isValidDatePreset,
  isValidDateRange,
  MAX_CUSTOM_RANGE_DAYS,
  MetaApiError,
  type Period,
} from "@/lib/meta-ads";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { resolveAllowedAccountIds } from "@/lib/session-scope";

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
  const compare = req.nextUrl.searchParams.get("compare") === "1";

  // The Edge middleware only checked that a plausible session cookie
  // exists — this is the authoritative, DB-backed check that decides both
  // whether this request may proceed at all and which accounts it may see.
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const allowedAccountIds = resolveAllowedAccountIds(scope) ?? undefined;

  try {
    const data = await getDashboardData(period, allowedAccountIds, { compare });
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
