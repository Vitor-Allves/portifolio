import { NextRequest, NextResponse } from "next/server";
import { dispatchDueMessages } from "@/lib/crm-scheduled-messages";
import { cronDenied } from "@/lib/cron-auth";

export const runtime = "nodejs";

/**
 * Sends the scheduled WhatsApp messages that are due (evolução v1.0, item
 * 11). Meant for a frequent schedule (every few minutes), called by the
 * server's scheduler with CRON_SECRET (see cron-auth). Between its runs the
 * CRM's own bell polling sends them too.
 */
export async function GET(req: NextRequest) {
  const denied = cronDenied(req, "Envio de mensagens agendadas não configurado.");
  if (denied) return denied;
  try {
    return NextResponse.json({ scheduledMessages: await dispatchDueMessages() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cron/scheduled-messages] failed", err);
    return NextResponse.json({ error: "Falha no envio das mensagens agendadas." }, { status: 500 });
  }
}
