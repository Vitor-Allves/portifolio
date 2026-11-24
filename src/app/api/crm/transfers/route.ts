import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { listTransfers, requestTransfer, type CrmTransferStatus } from "@/lib/crm-transfers";

export const runtime = "nodejs";

const STATUSES = ["pendente", "aprovada", "recusada", "cancelada", "todas"];

/** Transfer requests this person may see (?status=pendente|aprovada|recusada|cancelada|todas). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const status = req.nextUrl.searchParams.get("status") ?? "todas";
  try {
    return NextResponse.json({ transfers: await listTransfers(actor, (STATUSES.includes(status) ? status : "todas") as CrmTransferStatus | "todas") });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/transfers GET");
  }
}

/** Asks for a lead: { contactId, reason, toOwnerId? } (default: for oneself). */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ transfer: await requestTransfer(actor, body) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/transfers POST");
  }
}
