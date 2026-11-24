import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, requireContact } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { assumeConversation, endConversation, transferConversation } from "@/lib/crm-conversations";

export const runtime = "nodejs";

/** Atendimento da conversa: { action: "assume" } | { action: "transfer", toUserId } | { action: "end" }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown; toUserId?: unknown } | null;
  try {
    await requireContact(actor, id);
    requireCap(actor, "sendWhatsApp");
    if (body?.action === "assume") await assumeConversation(actor, id);
    else if (body?.action === "end") await endConversation(actor, id);
    else if (body?.action === "transfer") return NextResponse.json({ ok: true, ...(await transferConversation(actor, id, body.toUserId)) });
    else throw new CrmInputError("Ação inválida.");
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/attendance POST");
  }
}
