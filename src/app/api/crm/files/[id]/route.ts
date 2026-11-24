import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { CrmNotFoundError } from "@/lib/crm-core";
import { archiveFile, fileOwner, readFile } from "@/lib/crm-files";
import { requireFileTarget } from "@/lib/crm-files-access";

export const runtime = "nodejs";

/** Downloads a file — only to who can see its record, always as an attachment. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    const owner = await fileOwner(id);
    if (!owner) throw new CrmNotFoundError("Arquivo não encontrado.");
    await requireFileTarget(actor, owner, "view");
    const f = await readFile(id);
    if (!f) throw new CrmNotFoundError("Arquivo não encontrado.");
    const ascii = f.name.replace(/[^\x20-\x7e]/g, "_");
    return new NextResponse(new Uint8Array(f.bytes), {
      headers: {
        "Content-Type": f.mime,
        "Content-Length": String(f.bytes.length),
        "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(f.name)}`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/files/[id] GET");
  }
}

/** Archives a file (nothing is deleted). */
export async function DELETE(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    const owner = await fileOwner(id);
    if (!owner) throw new CrmNotFoundError("Arquivo não encontrado.");
    await requireFileTarget(actor, owner, "act");
    await archiveFile(id, actor);
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/files/[id] DELETE");
  }
}
