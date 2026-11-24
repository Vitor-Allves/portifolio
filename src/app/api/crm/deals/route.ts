import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { maskConversations, requireCap, requireContact, requireOwnerChange, visibleTo } from "@/lib/crm-access";
import { createDeal, listBoardDeals, type NewDealInput } from "@/lib/crm-deals";

export const runtime = "nodejs";

/** The funnel: open opportunities + those won/lost in the last 30 days. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ deals: await maskConversations(actor, await listBoardDeals(visibleTo(actor))) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/deals GET");
  }
}

export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as NewDealInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const { ownerId } = await requireContact(actor, String(body.contactId ?? ""));
    requireCap(actor, "editPipeline");
    requireOwnerChange(actor, body.ownerId, ownerId);
    return NextResponse.json({ id: await createDeal(body, actor) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/deals POST");
  }
}
