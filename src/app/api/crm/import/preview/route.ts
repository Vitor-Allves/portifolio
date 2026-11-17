import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { previewImport } from "@/lib/crm-import";
import type { CrmImportDefaults, CrmImportRow } from "@/lib/crm-types";

export const runtime = "nodejs";

/** Dry run of an import: what each row would become (novo / duplicado / erro). Writes nothing. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { rows?: CrmImportRow[]; defaults?: CrmImportDefaults } | null;
  if (!body || !Array.isArray(body.rows)) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    requireCap(actor, "importContacts");
    return NextResponse.json(await previewImport(body.rows, body.defaults ?? {}));
  } catch (err) {
    return crmErrorResponse(err, "api/crm/import/preview POST");
  }
}
