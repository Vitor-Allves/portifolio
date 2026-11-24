import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listIntelligenceClients } from "@/lib/crm-media";

export const runtime = "nodejs";

/** The Legado Intelligence clients this person may link to an active client (within their Intelligence access). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ clients: await listIntelligenceClients(actor) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/intelligence/clients GET");
  }
}
