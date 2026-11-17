import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { updateDeal, type DealPatch } from "@/lib/crm-deals";

export const runtime = "nodejs";

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as DealPatch | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const result = await updateDeal(id, body, actor);
    if (!result) return NextResponse.json({ error: "Oportunidade não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true, stage: result.stage });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/deals/[id] PATCH");
  }
}
