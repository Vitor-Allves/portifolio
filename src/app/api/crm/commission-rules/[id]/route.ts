import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { saveRule } from "@/lib/crm-finance";

export const runtime = "nodejs";

/** Edits a rule, or { archived: true | false }. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ rule: await saveRule(actor, id, body) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/commission-rules/[id] PATCH");
  }
}
