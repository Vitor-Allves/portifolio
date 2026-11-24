import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { CrmInputError } from "@/lib/crm-core";
import { runScheduled } from "@/lib/crm-automations";
import { automationDef, type AutomationId } from "@/lib/crm-automation-defs";
import { writeAudit } from "@/lib/audit-log";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** "Rodar agora": the daily check, now, for one time rule ({ id }) or all. Administrador; audited. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => ({}))) as { id?: unknown } | null;
  try {
    requireCap(actor, "manageAutomations");
    if (isRateLimited(`crm-automation-run:${actor.userId}`, 12, 60_000)) {
      return NextResponse.json({ error: "Muitas execuções seguidas. Espere um minuto." }, { status: 429 });
    }
    let only: AutomationId | undefined;
    if (body?.id !== undefined) {
      const def = typeof body.id === "string" ? automationDef(body.id) : undefined;
      if (!def?.scheduled || !def.available) throw new CrmInputError("Só as automações de verificação diária rodam sob demanda.");
      only = def.id;
    }
    const results = await runScheduled(only);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.automation_run",
      targetType: "crm_automation",
      targetId: only ?? "todas",
      targetLabel: only ? automationDef(only)!.name : "Verificação diária",
      metadata: results,
    });
    return NextResponse.json({ results });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/automations/run POST");
  }
}
