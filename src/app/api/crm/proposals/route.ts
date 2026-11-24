import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { createProposal, listProposals } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** Proposals this person may see: ?status&owner&q&dealId&contactId&page. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  try {
    const owner = p.get("owner");
    const result = await listProposals(actor, {
      status: p.get("status"),
      ownerId: owner === "mine" ? actor.userId : owner,
      q: p.get("q"),
      dealId: p.get("dealId"),
      contactId: p.get("contactId"),
      page: Number(p.get("page") ?? 1) || 1,
      pageSize: Number(p.get("pageSize") ?? 50) || 50,
    });
    return NextResponse.json(result);
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals GET");
  }
}

/** New proposal for an opportunity: { dealId, templateId?, ...fields }. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ id: await createProposal(actor, body) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals POST");
  }
}
