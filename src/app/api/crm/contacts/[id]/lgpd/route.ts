import { NextRequest, NextResponse } from "next/server";
import { confirmAdminPassword, crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { anonymizeTitular, exportTitular } from "@/lib/crm-lgpd";

export const runtime = "nodejs";

const slug = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "") || "contato";

/** LGPD: everything the CRM keeps about the contact, as a JSON file for the titular. Administrador; audited. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    const { name, data } = await exportTitular(actor, id);
    return new NextResponse(JSON.stringify(data, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="dados-do-titular-${slug(name)}.json"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/lgpd GET");
  }
}

/** LGPD: { action: "anonymize", reason, password } — irreversible; the Administrador confirms with their password. Audited. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as { action?: unknown; reason?: unknown; password?: unknown } | null;
  if (body?.action !== "anonymize") return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "manageTeam");
    const denied = await confirmAdminPassword(actor, body.password);
    if (denied) return denied;
    return NextResponse.json({ ok: true, done: await anonymizeTitular(actor, id, body.reason) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/[id]/lgpd POST");
  }
}
