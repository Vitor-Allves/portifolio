import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { createClient, listClientSuggestions, listClients, type ClientInput } from "@/lib/crm-clients";

export const runtime = "nodejs";

/** Clientes ativos this person may see (filters: status, owner, service, renewal, q) and, for who may edit, what can become a client. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  try {
    const list = await listClients(actor, {
      status: p.get("status") || undefined,
      owner: p.get("owner") || undefined,
      service: p.get("service") || undefined,
      renewal: p.get("renewal") || undefined,
      q: p.get("q") || undefined,
    });
    return NextResponse.json({ ...list, suggestions: actor.caps.editClients ? await listClientSuggestions(actor) : null });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients GET");
  }
}

/** { companyId } or { dealId } (a won opportunity), plus ownerId, status, startedOn, notes, contract → the client (201 when new). */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as ClientInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const r = await createClient(actor, body);
    return NextResponse.json(r, { status: r.created ? 201 : 200 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients POST");
  }
}
