import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap, requireOwnerChange, requireTask } from "@/lib/crm-access";
import { getTask, updateTask, type TaskPatch } from "@/lib/crm-tasks";

export const runtime = "nodejs";

/** The task with its own history. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    await requireTask(actor, id);
    const found = await getTask(id);
    if (!found) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    return NextResponse.json(found);
  } catch (err) {
    return crmErrorResponse(err, "api/crm/tasks/[id] GET");
  }
}

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  const body = (await req.json().catch(() => null)) as TaskPatch | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    const { ownerId } = await requireTask(actor, id);
    // Dismissing my own reminder is not editing the task: any profile may do it.
    const onlyDismiss = Object.keys(body).every((k) => k === "dismissReminder") && body.dismissReminder === true && ownerId === actor.userId;
    if (!onlyDismiss) requireCap(actor, "editPipeline");
    requireOwnerChange(actor, body.ownerId, ownerId);
    if (!(await updateTask(id, body, actor))) return NextResponse.json({ error: "Tarefa não encontrada." }, { status: 404 });
    return NextResponse.json({ ok: true });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/tasks/[id] PATCH");
  }
}
