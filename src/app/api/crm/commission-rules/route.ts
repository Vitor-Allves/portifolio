import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { listRules, saveRule } from "@/lib/crm-finance";

export const runtime = "nodejs";

/** The commission rules (whoever sees contract values reads them). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "seeContractValues");
    return NextResponse.json({ rules: await listRules() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/commission-rules GET");
  }
}

/** New rule: { name, userId?, service?, billing?, percent, months? }. Gestor / Administrador. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ rule: await saveRule(actor, null, body) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/commission-rules POST");
  }
}
