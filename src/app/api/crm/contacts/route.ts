import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { createContact, listContacts, type NewContactInput } from "@/lib/crm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ contacts: await listContacts() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts GET");
  }
}

export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as NewContactInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const id = await createContact(body, actor);
    return NextResponse.json({ id }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts POST");
  }
}
