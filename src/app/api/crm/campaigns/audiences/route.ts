import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { listSavedAudiences, saveAudience } from "@/lib/crm-campaigns";

export const runtime = "nodejs";

/** Saved audiences (públicos salvos): filters under a name, to reuse in new campaigns. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "editCampaigns");
    return NextResponse.json({ audiences: await listSavedAudiences() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/audiences GET");
  }
}

/** { name, audience } → saves the filters under that name; the same name again replaces them. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { name?: unknown; audience?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "editCampaigns");
    return NextResponse.json({ audience: await saveAudience(body.name, body.audience, actor) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/audiences POST");
  }
}
