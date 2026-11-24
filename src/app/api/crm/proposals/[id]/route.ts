import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getProposal, updateProposal } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** The proposal with every version, its timeline and the client's decisions. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json({ proposal: await getProposal(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id] GET");
  }
}

/** Saves it: a draft changes in place; a sent one becomes a new version ({ reason } required). */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json(await updateProposal(actor, id, body));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id] PATCH");
  }
}
