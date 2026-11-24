import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getDiscountLimit, listTemplates, saveTemplate } from "@/lib/crm-proposals";

export const runtime = "nodejs";

/** Proposal templates (?archived=1 adds the archived ones) and the discount limit. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ templates: await listTemplates(req.nextUrl.searchParams.get("archived") === "1"), discountLimitPct: await getDiscountLimit() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposal-templates GET");
  }
}

/** New template (Administrador). */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ template: await saveTemplate(actor, null, body) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposal-templates POST");
  }
}
