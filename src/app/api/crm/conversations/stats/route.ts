import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { visibleTo } from "@/lib/crm-access";
import { responseStats } from "@/lib/crm-conversations";

export const runtime = "nodejs";

/** Tempo de resposta (?days=7|30), on the leads this profile sees. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json(await responseStats(Number(req.nextUrl.searchParams.get("days")) || 7, visibleTo(actor)));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/conversations/stats GET");
  }
}
