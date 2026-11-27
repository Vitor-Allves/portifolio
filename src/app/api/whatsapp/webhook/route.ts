import { NextRequest, NextResponse } from "next/server";
import { parseWebhook, sendText, verifyWebhookSignature } from "@/lib/whatsapp";
import { applyStatus, recordInbound, recordOutbound } from "@/lib/crm";
import { OPT_OUT_CONFIRMATION } from "@/lib/crm-campaign-rules";

export const runtime = "nodejs";

// Public on purpose (Meta calls it, there is no session) — kept outside the
// middleware matcher in src/proxy.ts. Authenticity comes from the verify
// token on the GET handshake and the app-secret signature on every POST.

/** Meta's one-time handshake when the webhook URL is saved in the app dashboard. */
export async function GET(req: NextRequest) {
  const mode = req.nextUrl.searchParams.get("hub.mode");
  const token = req.nextUrl.searchParams.get("hub.verify_token");
  const challenge = req.nextUrl.searchParams.get("hub.challenge");
  const expected = process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN;
  if (mode === "subscribe" && expected && token === expected && challenge) {
    console.info("[whatsapp/webhook] verificação aceita");
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  // Never the tokens themselves: only what helps tell why it failed.
  console.warn("[whatsapp/webhook] verificação recusada", { mode, configured: Boolean(expected), tokenSent: Boolean(token) });
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    console.warn("[whatsapp/webhook] assinatura inválida: confira WHATSAPP_APP_SECRET (chave secreta do app que envia o webhook)");
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { messages, statuses, ignored } = parseWebhook(payload, process.env.WHATSAPP_PHONE_NUMBER_ID);
  // Counts only: no phone numbers or texts in the logs.
  console.info("[whatsapp/webhook] entrega recebida", { messages: messages.length, statuses: statuses.length, ignoredOtherNumber: ignored });
  const optedOut: { contactId: string; phone: string }[] = [];
  try {
    // In order: a status for a message we just stored must find it.
    for (const message of messages) {
      const result = await recordInbound(message);
      if (result.optedOut) optedOut.push(result.optedOut);
    }
    for (const status of statuses) await applyStatus(status);
  } catch (err) {
    // A non-2xx makes Meta retry the delivery later; recordInbound ignores
    // a message it already stored, so a retry never duplicates anything.
    console.error("[api/whatsapp/webhook]", err);
    return NextResponse.json({ error: "Falha ao registrar." }, { status: 500 });
  }

  // Confirms the unsubscribe ("SAIR"). The lead just wrote, so the 24h window
  // is open. Best effort: the opt-out itself is already saved, and a failure
  // here must not make Meta redeliver the message.
  for (const o of optedOut) {
    try {
      const waMessageId = await sendText(o.phone, OPT_OUT_CONFIRMATION);
      await recordOutbound(o.contactId, { waMessageId, type: "text", body: OPT_OUT_CONFIRMATION, templateName: null }, null);
    } catch (err) {
      console.error("[api/whatsapp/webhook] opt-out confirmation", err);
    }
  }
  return NextResponse.json({ ok: true });
}
