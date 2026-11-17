import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireMedia } from "@/lib/crm-access";
import { isKnownMedia } from "@/lib/crm";
import { fetchMedia } from "@/lib/whatsapp";

export const runtime = "nodejs";

// WhatsApp's media URLs need the access token, so images/audio from a
// conversation are streamed through here — and only media that actually
// belongs to a CRM message, never an arbitrary id.
export async function GET(req: NextRequest, { params }: { params: Promise<{ mediaId: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { mediaId } = await params;
  try {
    await requireMedia(actor, mediaId);
    if (!(await isKnownMedia(mediaId))) return NextResponse.json({ error: "Mídia não encontrada." }, { status: 404 });
    const media = await fetchMedia(mediaId);
    return new NextResponse(media.body, {
      headers: { "Content-Type": media.mime, "Cache-Control": "private, max-age=3600" },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/media GET");
  }
}
