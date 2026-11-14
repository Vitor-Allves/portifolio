import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { CrmInputError, getContactForSending, recordOutbound } from "@/lib/crm";
import { serviceWindowRemainingMs } from "@/lib/crm-types";
import { sendTemplate, sendText } from "@/lib/whatsapp";

export const runtime = "nodejs";

type SendBody =
  | { kind: "text"; body?: unknown }
  | { kind: "template"; name?: unknown; language?: unknown; params?: unknown };

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as SendBody | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });

  try {
    const contact = await getContactForSending(id);
    if (!contact) return NextResponse.json({ error: "Contato não encontrado." }, { status: 404 });

    if (body.kind === "text") {
      const text = typeof body.body === "string" ? body.body.trim() : "";
      if (!text) throw new CrmInputError("A mensagem está vazia.");
      if (text.length > 4096) throw new CrmInputError("Mensagem longa demais (máximo de 4.096 caracteres).");
      // Checked here too, not only in the UI: WhatsApp would reject it
      // anyway, but with a less clear error.
      if (serviceWindowRemainingMs(contact.lastInboundAt) === 0) {
        throw new CrmInputError("A janela de 24h está fechada — para falar com este contato, envie um modelo aprovado.");
      }
      const waMessageId = await sendText(contact.phone, text);
      await recordOutbound(id, { waMessageId, type: "text", body: text, templateName: null }, actor);
      return NextResponse.json({ ok: true });
    }

    if (body.kind === "template") {
      const name = typeof body.name === "string" ? body.name : "";
      const language = typeof body.language === "string" ? body.language : "";
      if (!name || !language) throw new CrmInputError("Escolha um modelo.");
      const values = Array.isArray(body.params) ? body.params.map((p) => String(p ?? "").trim()) : [];
      if (values.some((v) => !v)) throw new CrmInputError("Preencha todos os campos do modelo.");
      const waMessageId = await sendTemplate(contact.phone, name, language, values);
      await recordOutbound(id, { waMessageId, type: "template", body: values.length ? values.join(" · ") : null, templateName: name }, actor);
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Tipo de mensagem inválido." }, { status: 400 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/messages POST");
  }
}
