import { NextRequest, NextResponse } from "next/server";
import { crmErrorResponse } from "@/lib/crm-auth";
import { recordView } from "@/lib/crm-proposals";
import { clientMeta, isTeam } from "@/lib/proposal-public-http";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

/**
 * Sent by the public page itself once it is open in a browser — link
 * previews (WhatsApp, e-mail) don't run it. The team's own visits don't count.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const meta = clientMeta(req);
  if (isRateLimited(`proposal-view:${meta.ip}`, 30)) return NextResponse.json({ ok: false }, { status: 429 });
  const body = (await req.json().catch(() => null)) as { version?: unknown } | null;
  try {
    if (await isTeam(req)) return NextResponse.json({ ok: true, counted: false });
    return NextResponse.json({ ok: true, counted: await recordView(token, { ...meta, version: body?.version }) });
  } catch (err) {
    return crmErrorResponse(err, "api/proposta/[token]/view POST");
  }
}
