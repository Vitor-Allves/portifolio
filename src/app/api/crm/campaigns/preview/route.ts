import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { previewAudience } from "@/lib/crm-campaigns";

export const runtime = "nodejs";

/** { audience, params?, templateBody? } → how many receive it, who's left out and why, and sample messages. Reads only. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { audience?: unknown; params?: unknown; templateBody?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "editCampaigns");
    return NextResponse.json({ preview: await previewAudience(body.audience, body.params, body.templateBody) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/preview POST");
  }
}
