import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getClient, saveReport, type ReportInput } from "@/lib/crm-clients";

export const runtime = "nodejs";

/** { month: "YYYY-MM", services, activities, results, attention, nextActions, ownerId, expectedUpdatedAt? } → saves that month's acompanhamento. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as ReportInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await saveReport(actor, id, body);
    return NextResponse.json({ client: await getClient(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/reports POST");
  }
}
