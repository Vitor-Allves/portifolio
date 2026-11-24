import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getClient } from "@/lib/crm-clients";
import { updateContractDetails } from "@/lib/crm-operations";

export const runtime = "nodejs";

/** The contract's extra details: payment terms, due day, term, renewal, cancellation rules, owners, signed document. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id, contractId } = await params;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await updateContractDetails(actor, id, contractId, body);
    return NextResponse.json({ client: await getClient(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/contracts/[contractId]/details PATCH");
  }
}
