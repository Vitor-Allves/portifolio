import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listApprovedTemplates } from "@/lib/whatsapp";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ templates: await listApprovedTemplates() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/templates GET");
  }
}
