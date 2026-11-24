import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getClient, updateContract, type ContractInput } from "@/lib/crm-clients";

export const runtime = "nodejs";

/** Edits a contract: only the fields sent change. Contracts are never deleted — cancel or end them. */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id, contractId } = await params;
  const body = (await req.json().catch(() => null)) as ContractInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await updateContract(actor, id, contractId, body);
    return NextResponse.json({ client: await getClient(actor, id) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/contracts/[contractId] PATCH");
  }
}
