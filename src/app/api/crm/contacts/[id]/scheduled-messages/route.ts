import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listScheduled, scheduleMessage, type ScheduleInput } from "@/lib/crm-scheduled-messages";

export const runtime = "nodejs";

/** The contact's scheduled WhatsApp messages (evolução v1.0, item 11). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json({ messages: await listScheduled(actor, id) }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/scheduled-messages GET");
  }
}

/** Schedules a message: { kind: "text", body, sendAt } or { kind: "template", name, language, params, sendAt }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as ScheduleInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ message: await scheduleMessage(actor, id, body) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/scheduled-messages POST");
  }
}
