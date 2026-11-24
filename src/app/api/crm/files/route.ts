import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { CrmInputError } from "@/lib/crm-core";
import { MAX_FILE_BYTES, attachFile, listFiles } from "@/lib/crm-files";
import { requireFileTarget, targetFrom } from "@/lib/crm-files-access";

export const runtime = "nodejs";

/** The files of a record: ?contactId | companyId | clientId (&archived=1 to include archived ones). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const target = targetFrom((k) => p.get(k));
  try {
    await requireFileTarget(actor, target, "view");
    return NextResponse.json({ files: await listFiles(target, p.get("archived") === "1") });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/files GET");
  }
}

/** Attaches a file (multipart: file + contactId | companyId | clientId, optional dealId). Up to 4 MB. */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    const length = Number(req.headers.get("content-length") ?? 0);
    if (length > MAX_FILE_BYTES + 64 * 1024) throw new CrmInputError("Arquivo grande demais: o limite é 4 MB.");
    const form = await req.formData().catch(() => null);
    if (!form) throw new CrmInputError("Envie o arquivo.");
    const target = targetFrom((k) => {
      const v = form.get(k);
      return typeof v === "string" ? v : null;
    });
    await requireFileTarget(actor, target, "act");
    const file = form.get("file");
    if (!file || typeof file === "string") throw new CrmInputError("Envie o arquivo.");
    if (file.size > MAX_FILE_BYTES) throw new CrmInputError("Arquivo grande demais: o limite é 4 MB.");
    const bytes = Buffer.from(await file.arrayBuffer());
    return NextResponse.json({ file: await attachFile(target, { name: file.name, bytes }, actor) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/files POST");
  }
}
