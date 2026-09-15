import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, ANALISE_PENDING_COOKIE } from "@/lib/analise-session-node";
import { sessionScopeFromRequest } from "@/lib/auth-context";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req).catch(() => null);
  if (scope) {
    await writeAudit({
      actorUserId: scope.userId,
      actorLabel: scope.userName,
      actorKind: scope.kind === "staff" ? "admin" : "client",
      action: "user.session_revoke",
      targetType: scope.kind === "staff" ? "internal_user" : "client_access_user",
      targetId: scope.userId,
      metadata: { self: true },
    });
  }

  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ANALISE_SESSION_COOKIE);
  res.cookies.delete(ANALISE_PENDING_COOKIE);
  return res;
}
