import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest } from "@/lib/auth-context";

export const runtime = "nodejs";

/** Returns the caller's own identity — used by the header and by the forced-password-change/2FA gates on the client. Never includes anything about other accounts. */
export async function GET(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!scope) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  return NextResponse.json({
    kind: scope.kind,
    userId: scope.userId,
    username: scope.username,
    userName: scope.userName,
    role: scope.kind === "staff" ? scope.role : null,
    label: scope.kind === "client" ? scope.label : null,
    mustChangePassword: scope.mustChangePassword,
  });
}
