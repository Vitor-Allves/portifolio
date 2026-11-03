import { NextRequest, NextResponse } from "next/server";
import { isValidDatePreset, isValidDateRange, MAX_CUSTOM_RANGE_DAYS, type Period } from "@/lib/meta-ads-types";
import { getGoogleAdsDashboardData, GoogleAdsApiError } from "@/lib/google-ads";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { resolveAllowedAccountIds } from "@/lib/session-scope";

export const runtime = "nodejs";
// Same multi-account fan-out shape as /api/meta-ads/campaigns — see the
// maxDuration comment there.
export const maxDuration = 60;

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

  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  // Same account_ids list as the Meta route — Google accounts are stored
  // there with the "gads_" prefix, and getGoogleAdsDashboardData only ever
  // matches its own prefixed ids against it.
  const allowedAccountIds = resolveAllowedAccountIds(scope) ?? undefined;

  try {
    const data = await getGoogleAdsDashboardData(period, allowedAccountIds, { compare });
    return NextResponse.json(data);
  } catch (err) {
    console.error("[api/google-ads/campaigns]", err);
    const status = err instanceof GoogleAdsApiError ? 502 : 500;
    // The raw API message (e.g. "developer token not approved") is what an
    // internal viewer needs to fix the setup; a client only gets the
    // generic sentence.
    const detail = scope.kind === "staff" && err instanceof GoogleAdsApiError ? ` (${err.message})` : "";
    return NextResponse.json(
      { error: `Não foi possível carregar os dados do Google Ads agora.${detail}` },
      { status }
    );
  }
}
