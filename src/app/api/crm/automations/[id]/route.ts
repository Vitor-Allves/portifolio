import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { updateAutomation, type AutomationPatch } from "@/lib/crm-automations";
import { automationDef } from "@/lib/crm-automation-defs";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

/** { status?: ativa|pausada|desativada, config?: {...} }. Administrador; audited. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as AutomationPatch | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "manageAutomations");
    const { before, after } = await updateAutomation(id, body, actor);
    const changed = Object.keys(after.config).filter((k) => JSON.stringify(after.config[k as keyof typeof after.config]) !== JSON.stringify(before.config[k as keyof typeof before.config]));
    if (before.status !== after.status || changed.length > 0) {
      await writeAudit({
        actorUserId: actor.userId,
        actorLabel: actor.userName,
        actorKind: "admin",
        action: "crm.automation_change",
        targetType: "crm_automation",
        targetId: id,
        targetLabel: automationDef(id)?.name ?? id,
        metadata: { from: before.status, to: after.status, ...(changed.length > 0 ? { changed } : {}) },
      });
    }
    return NextResponse.json({ automation: after });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/automations/[id] PATCH");
  }
}
