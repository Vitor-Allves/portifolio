import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { getCatalog, getCatalogUsage } from "@/lib/crm-options";

export const runtime = "nodejs";

/** Every option and tag (archived ones too, for old records' labels). ?usage=1 adds how many records use each (Administrador). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    const catalog = await getCatalog();
    if (req.nextUrl.searchParams.get("usage") === "1") {
      requireCap(actor, "customize");
      return NextResponse.json({ catalog, usage: await getCatalogUsage() });
    }
    return NextResponse.json({ catalog });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/catalog GET");
  }
}
