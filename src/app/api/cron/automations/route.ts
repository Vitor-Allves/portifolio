import { NextRequest, NextResponse } from "next/server";
import { runScheduled } from "@/lib/crm-automations";
import { dispatchDueMessages } from "@/lib/crm-scheduled-messages";
import { cronDenied } from "@/lib/cron-auth";

export const runtime = "nodejs";

/**
 * The daily check of the time automations (Fase 3), called by the server's
 * scheduler with CRON_SECRET (see cron-auth). It also sends any scheduled
 * message that is due (evolução v1.0).
 */
export async function GET(req: NextRequest) {
  const denied = cronDenied(req, "Verificação diária não configurada.");
  if (denied) return denied;
  try {
    const results = await runScheduled();
    const scheduledMessages = await dispatchDueMessages();
    return NextResponse.json({ results, scheduledMessages }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cron/automations] failed", err);
    return NextResponse.json({ error: "Falha na verificação diária." }, { status: 500 });
  }
}
