import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { financeParams, getFinance } from "@/lib/crm-finance";

export const runtime = "nodejs";

/** Financeiro comercial for ?from&to (&owner): sold, revenue, forecast, charges, discounts, cancellations, commissions. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ finance: await getFinance(actor, financeParams(actor, req.nextUrl.searchParams)) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/finance GET");
  }
}
