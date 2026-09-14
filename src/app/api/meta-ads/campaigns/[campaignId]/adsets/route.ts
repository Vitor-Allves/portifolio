import { NextRequest, NextResponse } from "next/server";
import {
  getAccessTokenForAccount,
  getCampaignAdSets,
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

export async function GET(req: NextRequest, { params }: { params: Promise<{ campaignId: string }> }) {
  const { campaignId } = await params;
  const accountId = req.nextUrl.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ error: "Parâmetro accountId é obrigatório." }, { status: 400 });
  }

  const period = resolvePeriod(req);
  if ("error" in period) {
    return NextResponse.json({ error: period.error }, { status: 400 });
  }

  // Same scoping rule as /api/meta-ads/campaigns: a client session only ever
  // reads the ad sets of an account it's already allowed to see.
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  if (scope?.kind === "client" && !scope.accountIds.includes(accountId)) {
    return NextResponse.json({ error: "Conta não autorizada para esta sessão." }, { status: 403 });
  }

  try {
    const accessToken = await getAccessTokenForAccount(accountId);
    if (!accessToken) {
      return NextResponse.json({ error: "Conta de anúncio não encontrada." }, { status: 404 });
    }
    const adSets = await getCampaignAdSets(campaignId, period, accessToken);
    return NextResponse.json({ adSets });
  } catch (err) {
    console.error("[api/meta-ads/campaigns/:id/adsets]", err);
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json(
      { error: "Não foi possível carregar os conjuntos de anúncios agora." },
      { status }
    );
  }
}
