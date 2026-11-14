import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listFacets } from "@/lib/crm";

export const runtime = "nodejs";

/** Segments and cities typed so far, for the filter dropdowns. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json(await listFacets());
  } catch (err) {
    return crmErrorResponse(err, "api/crm/facets GET");
  }
}
