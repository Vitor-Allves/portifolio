import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { addContract, getClient, type ContractInput } from "@/lib/crm-clients";

export const runtime = "nodejs";

/** { services, startsOn, endsOn?, value?, billing?, status?, notes? } → a new contract for the client. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as ContractInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const contractId = await addContract(actor, id, body);
    return NextResponse.json({ contractId, client: await getClient(actor, id) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/contracts POST");
  }
}
