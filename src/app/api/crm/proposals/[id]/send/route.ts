import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { sendProposal } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** Registers that the proposal was sent ({ channel: link | whatsapp | email | pdf | presencial }); the link is created if missing. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json(await sendProposal(actor, id, body.channel));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id]/send POST");
  }
}
