import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, requireContact, requireOwnerChange, visibleTo } from "@/lib/crm-access";
import { createTask, listTasks, type NewTaskInput } from "@/lib/crm-tasks";

export const runtime = "nodejs";

/** ?status=pending|done&owner=all|mine|none|<id>&from=ISO&to=ISO */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const date = (k: string) => {
    const v = p.get(k);
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  };
  try {
    const tasks = await listTasks({
      status: p.get("status") === "done" ? "done" : "pending",
      owner: p.get("owner") ?? "all",
      currentUserId: actor.userId,
      from: date("from"),
      to: date("to"),
      visibleTo: visibleTo(actor),
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/tasks GET");
  }
}

export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as NewTaskInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    await requireContact(actor, String(body.contactId ?? ""));
    requireCap(actor, "editPipeline");
    requireOwnerChange(actor, body.ownerId, null);
    return NextResponse.json({ id: await createTask(body, actor) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/tasks POST");
  }
}
