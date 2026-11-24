import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { setDiscountLimit } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** { discountLimitPct }: the largest discount sent without a Gestor's authorization. Administrador. */
export async function PATCH(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ discountLimitPct: await setDiscountLimit(actor, body.discountLimitPct) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposal-settings PATCH");
  }
}
