import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { personActivity } from "@/lib/crm-audit";

export const runtime = "nodejs";

/** Produtividade e histórico de atividades de uma pessoa (Administrador). ?days=7|30|90 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const days = [7, 30, 90].includes(Number(req.nextUrl.searchParams.get("days"))) ? Number(req.nextUrl.searchParams.get("days")) : 30;
  try {
    requireCap(actor, "manageTeam");
    return NextResponse.json({ activity: await personActivity(id, days) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/team/[id]/activity GET");
  }
}
