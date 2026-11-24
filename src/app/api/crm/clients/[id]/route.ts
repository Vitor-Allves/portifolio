import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getClient, updateClient, type ClientPatch } from "@/lib/crm-clients";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json({ client: await getClient(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id] GET");
  }
}

/** { ownerId?, status?, endReason?, endedOn?, startedOn?, notes? }. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as ClientPatch | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await updateClient(actor, id, body);
    return NextResponse.json({ client: await getClient(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id] PATCH");
  }
}
