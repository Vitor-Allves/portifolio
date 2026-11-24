import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { checkDuplicates } from "@/lib/crm-duplicates";

export const runtime = "nodejs";

/**
 * Before saving a new lead or company: ?phone&email&cnpj&company → who
 * already has them, with the owner and the situation (evolução v1.0, item 2.2).
 */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  try {
    return NextResponse.json({
      duplicates: await checkDuplicates({ phone: p.get("phone"), email: p.get("email"), cnpj: p.get("cnpj"), company: p.get("company") }),
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/duplicates GET");
  }
}
