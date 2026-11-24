import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, requireContact } from "@/lib/crm-access";
import { listDiagnoses, saveDiagnosis } from "@/lib/crm-diagnostics";

export const runtime = "nodejs";

/** Every version of the contact's diagnóstico comercial, newest first (who can see the lead). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    await requireContact(actor, id, "view");
    return NextResponse.json({ diagnoses: await listDiagnoses(id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/diagnoses GET");
  }
}

/** Saves a new version (who works on the lead). */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await requireContact(actor, id, "act");
    requireCap(actor, "editPipeline");
    return NextResponse.json({ diagnosis: await saveDiagnosis(id, body, actor) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/diagnoses POST");
  }
}
