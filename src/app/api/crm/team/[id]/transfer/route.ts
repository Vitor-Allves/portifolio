import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { portfolioCounts, transferPortfolio } from "@/lib/crm-portfolio";

export const runtime = "nodejs";

/** What this person owns today (Administrador). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    requireCap(actor, "manageTeam");
    return NextResponse.json({ counts: await portfolioCounts(id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id]/transfer GET");
  }
}

/** Transferir carteira: { toUserId (null = sem responsável), preview? } — Administrador. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { toUserId?: unknown; preview?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const result = await transferPortfolio(actor, id, body.toUserId ?? null, body.preview === true);
    if (body.preview !== true) {
      await writeAudit({
        actorUserId: actor.userId,
        actorLabel: actor.userName,
        actorKind: "admin",
        action: "crm.portfolio_transfer",
        targetType: "internal_user",
        targetId: id,
        targetLabel: result.fromName,
        metadata: { to: result.toName ?? "Sem responsável", contacts: result.contacts, deals: result.deals, tasks: result.tasks, companies: result.companies },
      });
    }
    return NextResponse.json(result);
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id]/transfer POST");
  }
}
