import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { cancelCampaign, listCampaigns, pauseCampaign, resumeCampaign, sendBatch, startCampaign } from "@/lib/crm-campaigns";
import { listApprovedTemplates } from "@/lib/whatsapp";

export const runtime = "nodejs";
// Each call starts sends for ~5 s and returns; the browser calls again until
// done. The headroom covers one slow answer from Meta (20 s timeout).
export const maxDuration = 30;

/**
 * { action: "start" | "batch" | "pause" | "resume" | "cancel" } — Administrador
 * and Gestor only. "start" freezes the audience and is logged; "batch" sends
 * the next few messages and returns the progress.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown } | null;
  try {
    requireCap(actor, "sendCampaigns");
    switch (body?.action) {
      case "start": {
        const started = await startCampaign(id, actor, await listApprovedTemplates());
        await writeAudit({
          actorUserId: actor.userId,
          actorLabel: actor.userName,
          actorKind: "admin",
          action: "crm.campaign_send",
          targetType: "crm_campaign",
          targetId: id,
          targetLabel: started.name,
          metadata: { recipients: started.recipients, skipped: started.skipped },
        });
        return NextResponse.json({ ok: true, ...started });
      }
      case "batch":
        return NextResponse.json(await sendBatch(id, actor));
      case "pause":
        await pauseCampaign(id);
        break;
      case "resume":
        await resumeCampaign(id);
        break;
      case "cancel": {
        const name = await cancelCampaign(id);
        await writeAudit({
          actorUserId: actor.userId,
          actorLabel: actor.userName,
          actorKind: "admin",
          action: "crm.campaign_cancel",
          targetType: "crm_campaign",
          targetId: id,
          targetLabel: name,
        });
        break;
      }
      default:
        return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
    }
    const [summary] = await listCampaigns(id);
    return NextResponse.json({ ok: true, status: summary.status, counts: summary.counts, pauseReason: summary.pauseReason });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/campaigns/[id]/send POST");
  }
}
