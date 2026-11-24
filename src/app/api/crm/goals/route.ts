import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getGoals, saveGoals, type GoalsInput } from "@/lib/crm-goals";

export const runtime = "nodejs";

/** ?month=YYYY-MM → the month's goals and what each line achieved (a Comercial: only their own). */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    return NextResponse.json({ goals: await getGoals(actor, req.nextUrl.searchParams.get("month") ?? "") });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/goals GET");
  }
}

/** { month, goals: [{ userId (null = equipe), metric, target }] } → sets or (blank/0) removes each goal. Administrador and Gestor. */
export async function PUT(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as GoalsInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ goals: await saveGoals(actor, body) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/goals PUT");
  }
}
