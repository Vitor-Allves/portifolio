import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { deleteDraft, getCampaign, updateCampaign, type CampaignInput } from "@/lib/crm-campaigns";

export const runtime = "nodejs";

export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    requireCap(actor, "editCampaigns");
    return NextResponse.json({ campaign: await getCampaign(id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/[id] GET");
  }
}

/** Edits a draft (same body as POST /campaigns). A campaign already sending can't change. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as CampaignInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "editCampaigns");
    await updateCampaign(id, body);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/[id] PATCH");
  }
}

/** Deletes a draft. A campaign that was sent stays, for the record. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    requireCap(actor, "editCampaigns");
    const name = await deleteDraft(id);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.campaign_delete",
      targetType: "crm_campaign",
      targetId: id,
      targetLabel: name,
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/[id] DELETE");
  }
}
