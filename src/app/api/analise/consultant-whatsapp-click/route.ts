import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest } from "@/lib/auth-context";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

/**
 * Fire-and-forget event log for the "Falar com meu consultor" button —
 * records that the button was clicked (date, viewer, screen), never the
 * WhatsApp conversation itself. The client calls this with
 * navigator.sendBeacon/fetch(keepalive) without awaiting it, so it can
 * never delay or block the wa.me navigation it accompanies.
 */
export async function POST(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!scope) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  let body: { screen?: unknown };
  try {
    body = await req.json();
  } catch {
    body = {};
  }
  const screen = typeof body.screen === "string" ? body.screen.slice(0, 60) : "desconhecida";

  await writeAudit({
    actorUserId: scope.userId,
    actorLabel: scope.userName,
    actorKind: scope.kind === "staff" ? "admin" : "client",
    action: "consultant.whatsapp_click",
    targetType: "dashboard_screen",
    targetLabel: screen,
  });

  return NextResponse.json({ ok: true });
}
