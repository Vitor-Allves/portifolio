import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, visibleTo } from "@/lib/crm-access";
import { listAudienceMembers } from "@/lib/crm-campaigns";

export const runtime = "nodejs";

/** { audience, q?, page? } → who the filters would send to (50 per page), and who was taken out by hand. Reads only. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { audience?: unknown; q?: unknown; page?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "editCampaigns");
    return NextResponse.json(await listAudienceMembers(body.audience, body.q, Number(body.page) || 1, visibleTo(actor)));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/preview/list POST");
  }
}
