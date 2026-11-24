import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getClientMedia, linkIntelligence, syncClientMedia } from "@/lib/crm-media";

export const runtime = "nodejs";
// Synchronizing reads every one of the client's ad accounts from Meta, like the Intelligence's own dashboard.
export const maxDuration = 60;

type Ctx = { params: Promise<{ id: string }> };

/** ?month=YYYY-MM → the client's link to the Intelligence and the month's media numbers (latest sync and history). */
export async function GET(req: NextRequest, { params }: Ctx) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    return NextResponse.json({ media: await getClientMedia(actor, id, req.nextUrl.searchParams.get("month") ?? "") });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/media GET");
  }
}

/** { month: "YYYY-MM" } → reads the month's numbers from Meta (as the Intelligence does) and keeps them as a new sync. */
export async function POST(req: NextRequest, { params }: Ctx) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { month?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ media: await syncClientMedia(actor, id, body.month) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/media POST");
  }
}

/** { clientAccessId: string | null } → links the client to an Intelligence client (or undoes it). Administrador and Gestor. */
export async function PUT(req: NextRequest, { params }: Ctx) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { clientAccessId?: unknown } | null;
  if (!body || !("clientAccessId" in body)) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ media: await linkIntelligence(actor, id, body.clientAccessId) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/media PUT");
  }
}
