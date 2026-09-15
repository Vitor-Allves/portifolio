import { NextRequest, NextResponse } from "next/server";
import {
  getScopedReachWithComparison,
  isValidDatePreset,
  isValidDateRange,
  MAX_CUSTOM_RANGE_DAYS,
  MetaApiError,
  type Period,
} from "@/lib/meta-ads";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { resolveAllowedAccountIds } from "@/lib/session-scope";

export const runtime = "nodejs";

type ReachRequestBody = {
  period?: { kind?: string; preset?: string; range?: { since?: string; until?: string } };
  compare?: boolean;
  campaignIdsByAccount?: Record<string, string[]>;
};

function resolvePeriod(body: ReachRequestBody): Period | { error: string } {
  const period = body.period;
  if (!period || typeof period !== "object") return { error: "Período ausente." };

  if (period.kind === "custom") {
    const since = period.range?.since;
    const until = period.range?.until;
    if (!since || !until || !isValidDateRange({ since, until })) {
      return {
        error: `Período inválido. Use datas no formato AAAA-MM-DD, com início antes do fim e no máximo ${MAX_CUSTOM_RANGE_DAYS} dias de intervalo.`,
      };
    }
    return { kind: "custom", range: { since, until } };
  }

  if (typeof period.preset === "string" && isValidDatePreset(period.preset)) {
    return { kind: "preset", preset: period.preset };
  }
  return { error: "Período inválido." };
}

/**
 * Returns Meta's own deduplicated reach for an exact campaign-id subset per
 * account — called whenever the dashboard's campaign/ad set/objective/
 * status filters have narrowed the view away from "every campaign in this
 * account", so the Alcance KPI never keeps silently showing the whole
 * account's number for a filtered selection (summing each campaign's own
 * `reach` would double-count anyone reached by more than one of them).
 */
export async function POST(req: NextRequest) {
  let body: ReachRequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corpo da requisição inválido." }, { status: 400 });
  }

  const period = resolvePeriod(body);
  if ("error" in period) {
    return NextResponse.json({ error: period.error }, { status: 400 });
  }

  const campaignIdsByAccount = body.campaignIdsByAccount;
  if (!campaignIdsByAccount || typeof campaignIdsByAccount !== "object") {
    return NextResponse.json({ error: "campaignIdsByAccount ausente." }, { status: 400 });
  }
  for (const [accountId, ids] of Object.entries(campaignIdsByAccount)) {
    if (typeof accountId !== "string" || !Array.isArray(ids) || !ids.every((id) => typeof id === "string")) {
      return NextResponse.json({ error: "campaignIdsByAccount mal formado." }, { status: 400 });
    }
  }

  // The Edge middleware only checked that a plausible session cookie
  // exists — this is the authoritative, DB-backed check, exactly like
  // /api/meta-ads/campaigns. A restricted session can never trigger a
  // scoped reach lookup for an account outside its own allowed list.
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }
  const allowedAccountIds = resolveAllowedAccountIds(scope) ?? undefined;
  if (allowedAccountIds) {
    const allowed = new Set(allowedAccountIds);
    for (const accountId of Object.keys(campaignIdsByAccount)) {
      if (!allowed.has(accountId)) {
        return NextResponse.json({ error: "Conta fora do escopo permitido." }, { status: 403 });
      }
    }
  }

  const requestedAccountIds = Object.keys(campaignIdsByAccount);

  try {
    const { resolvedRange, currentReach, comparisonRange, previousReach } = await getScopedReachWithComparison(
      period,
      Boolean(body.compare),
      campaignIdsByAccount,
      allowedAccountIds
    );

    // getScopedReach silently drops an account whose own call failed rather
    // than throwing (one flaky account shouldn't fail every other account's
    // number) — surfaced here as an explicit list so the client shows "não
    // disponível" for exactly those, never a stale/consolidated stand-in.
    const failedAccountIds = requestedAccountIds.filter((id) => !currentReach.some((r) => r.accountId === id));

    return NextResponse.json({ resolvedRange, currentReach, comparisonRange, previousReach, failedAccountIds });
  } catch (err) {
    console.error("[api/meta-ads/reach]", err);
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json({ error: "Não foi possível calcular o alcance para este filtro agora." }, { status });
  }
}
