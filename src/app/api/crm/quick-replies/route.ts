import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { createQuickReply, listQuickReplies } from "@/lib/crm";

export const runtime = "nodejs";

export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ quickReplies: await listQuickReplies() });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/quick-replies GET");
  }
}

export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as { title?: unknown; body?: unknown } | null;
  try {
    const quickReply = await createQuickReply(body?.title, body?.body, actor);
    return NextResponse.json({ quickReply }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/quick-replies POST");
  }
}
