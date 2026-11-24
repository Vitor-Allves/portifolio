import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { deleteSavedAudience } from "@/lib/crm-campaigns";

export const runtime = "nodejs";

/** Removes a saved audience. Campaigns that used it keep their own copy of the filters. */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    requireCap(actor, "editCampaigns");
    await deleteSavedAudience(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/audiences/[id] DELETE");
  }
}
