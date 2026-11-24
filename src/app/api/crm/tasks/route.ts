import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, requireCompanyForTask, requireContact, requireOwnerChange, visibleTo } from "@/lib/crm-access";
import { createTask, listTasks, type NewTaskInput, type TaskFilters } from "@/lib/crm-tasks";

export const runtime = "nodejs";

const STATUSES = ["pending", "em_andamento", "done", "any"] as const;

/** ?status=pending|em_andamento|done|any&owner=all|mine|none|<id>&kind=&priority=&companyId=&from=ISO&to=ISO */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const date = (k: string) => {
    const v = p.get(k);
    const d = v ? new Date(v) : null;
    return d && !Number.isNaN(d.getTime()) ? d : undefined;
  };
  const status = STATUSES.find((s) => s === p.get("status")) ?? "pending";
  try {
    const tasks = await listTasks({
      status: status as TaskFilters["status"],
      owner: p.get("owner") ?? "all",
      currentUserId: actor.userId,
      kind: p.get("kind") || undefined,
      priority: p.get("priority") || undefined,
      companyId: p.get("companyId") || undefined,
      from: date("from"),
      to: date("to"),
      visibleTo: visibleTo(actor),
    });
    return NextResponse.json({ tasks });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/tasks GET");
  }
}

/** A task on a contact (contactId), on a company only (companyId), or an internal activity (neither). */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as NewTaskInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    if (typeof body.contactId === "string" && body.contactId) await requireContact(actor, body.contactId);
    else if (typeof body.companyId === "string" && body.companyId) await requireCompanyForTask(actor, body.companyId);
    requireCap(actor, "editPipeline");
    requireOwnerChange(actor, body.ownerId, null);
    return NextResponse.json({ id: await createTask(body, actor) }, { status: 201 });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/tasks POST");
  }
}
