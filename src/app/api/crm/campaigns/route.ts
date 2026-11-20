import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { createCampaign, listCampaigns, type CampaignInput } from "@/lib/crm-campaigns";

export const runtime = "nodejs";

/** Every campaign with its numbers. Administrador, Gestor and Marketing. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "editCampaigns");
    return NextResponse.json({ campaigns: await listCampaigns() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns GET");
  }
}

/** New draft: { name, templateName?, templateLanguage?, templateBody?, params?, audience? }. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as CampaignInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "editCampaigns");
    return NextResponse.json({ id: await createCampaign(body, actor) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns POST");
  }
}
