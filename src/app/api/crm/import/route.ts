import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { commitImport, listImports } from "@/lib/crm-import";
import type { CrmImportDefaults, CrmImportRow } from "@/lib/crm-types";

export const runtime = "nodejs";
// A few thousand rows go in bulk statements, but give slow networks room.
export const maxDuration = 60;

export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "importContacts");
    return NextResponse.json({ imports: await listImports() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/import GET");
  }
}

export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { fileName?: string; rows?: CrmImportRow[]; defaults?: CrmImportDefaults } | null;
  if (!body || !Array.isArray(body.rows)) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "importContacts");
    const result = await commitImport(body.fileName ?? "planilha", body.rows, body.defaults ?? {}, actor);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.import",
      targetType: "crm_import",
      targetId: result.importId,
      targetLabel: body.fileName ?? null,
      metadata: result.counts,
    });
    return NextResponse.json(result, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/import POST");
  }
}
