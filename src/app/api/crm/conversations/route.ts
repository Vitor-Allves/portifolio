import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { visibleTo } from "@/lib/crm-access";
import { listConversations } from "@/lib/crm";

export const runtime = "nodejs";

/** WhatsApp conversations, newest first. ?q=&owner=all|mine|none|<id>&attendant=mine|none|<id>&stage=&tag=&unread=1&waiting=1&before=<cursor>&limit= */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const get = (k: string) => p.get(k)?.trim() || undefined;
  try {
    const result = await listConversations(
      {
        q: get("q"),
        owner: get("owner"),
        attendant: get("attendant"),
        tag: get("tag"),
        currentUserId: actor.userId,
        stage: get("stage"),
        unread: p.get("unread") === "1",
        waiting: p.get("waiting") === "1",
        visibleTo: visibleTo(actor),
      },
      { before: get("before"), limit: Number(p.get("limit")) || undefined }
    );
    return NextResponse.json(result);
  } catch (err) {
    return crmErrorResponse(err, "api/crm/conversations GET");
  }
}
