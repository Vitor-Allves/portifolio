import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { listRuns } from "@/lib/crm-automations";

export const runtime = "nodejs";

/** Run history, newest first. ?automation=&status=ok|ignorada|falha&page= */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  try {
    requireCap(actor, "manageAutomations");
    return NextResponse.json(
      await listRuns({ automationId: p.get("automation") || undefined, status: p.get("status") || undefined }, Math.max(1, Math.floor(Number(p.get("page")) || 1)))
    );
  } catch (err) {
    return crmErrorResponse(err, "api/crm/automations/runs GET");
  }
}
