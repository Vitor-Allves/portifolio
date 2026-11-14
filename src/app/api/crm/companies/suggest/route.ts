import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { suggestCompanies } from "@/lib/crm-companies";

export const runtime = "nodejs";

/** Names for the "Empresa" field as the user types. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const q = req.nextUrl.searchParams.get("q")?.trim() ?? "";
  if (q.length < 2) return NextResponse.json({ companies: [] });
  try {
    return NextResponse.json({ companies: await suggestCompanies(q) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/companies/suggest GET");
  }
}
