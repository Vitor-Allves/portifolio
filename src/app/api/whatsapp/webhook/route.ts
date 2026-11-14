import { NextRequest, NextResponse } from "next/server";
import { parseWebhook, verifyWebhookSignature } from "@/lib/whatsapp";
import { applyStatus, recordInbound } from "@/lib/crm";

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
    return new NextResponse(challenge, { status: 200, headers: { "Content-Type": "text/plain" } });
  }
  return NextResponse.json({ error: "Verificação inválida." }, { status: 403 });
}

export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(raw, req.headers.get("x-hub-signature-256"))) {
    return NextResponse.json({ error: "Assinatura inválida." }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "JSON inválido." }, { status: 400 });
  }

  const { messages, statuses } = parseWebhook(payload);
  try {
    // In order: a status for a message we just stored must find it.
    for (const message of messages) await recordInbound(message);
    for (const status of statuses) await applyStatus(status);
  } catch (err) {
    // A non-2xx makes Meta retry the delivery later; recordInbound ignores
    // a message it already stored, so a retry never duplicates anything.
    console.error("[api/whatsapp/webhook]", err);
    return NextResponse.json({ error: "Falha ao registrar." }, { status: 500 });
  }
  return NextResponse.json({ ok: true });
}
