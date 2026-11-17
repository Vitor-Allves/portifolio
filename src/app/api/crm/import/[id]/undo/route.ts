import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { undoImport } from "@/lib/crm-import";

export const runtime = "nodejs";

/** Removes the contacts an import created that nobody has worked on since; the rest stay. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    requireCap(actor, "importContacts");
    const result = await undoImport(id, actor);
    if (!result) return NextResponse.json({ error: "Importação não encontrada ou já desfeita." }, { status: 404 });
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.import_undo",
      targetType: "crm_import",
      targetId: id,
      metadata: result,
    });
    return NextResponse.json(result);
  } catch (err) {
    return crmErrorResponse(err, "api/crm/import/[id]/undo POST");
  }
}
