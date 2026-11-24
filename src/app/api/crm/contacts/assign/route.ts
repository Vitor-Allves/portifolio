import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { assignContacts, type AssignInput } from "@/lib/crm-portfolio";

export const runtime = "nodejs";

/**
 * Distribuir carteira: { ids | filters, ownerId, moveDeals?, moveTasks?, preview? }.
 * Needs "trocar o responsável de qualquer lead". preview: only counts.
 */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as AssignInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const result = await assignContacts(actor, body);
    if (!result.preview) {
      await writeAudit({
        actorUserId: actor.userId,
        actorLabel: actor.userName,
        actorKind: "admin",
        action: "crm.portfolio_assign",
        targetType: "internal_user",
        targetId: typeof body.ownerId === "string" && body.ownerId ? body.ownerId : null,
        targetLabel: result.toName ?? "Sem responsável",
        metadata: { contacts: result.contacts, deals: result.deals, tasks: result.tasks, by: Array.isArray(body.ids) ? "seleção" : "filtro" },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/assign POST");
  }
}
