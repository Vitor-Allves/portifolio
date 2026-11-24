import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { formalizeProposal } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** Approved proposal → sale registered, client and contract created from it, onboarding started. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json(await formalizeProposal(actor, id, body), { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id]/formalize POST");
  }
}
