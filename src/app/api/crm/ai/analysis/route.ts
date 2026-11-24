import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { analyze, type AnalysisInput } from "@/lib/crm-ai";

export const runtime = "nodejs";
// The AI's reading can take a few seconds (its client gives up at 45 s).
export const maxDuration = 60;

/**
 * { kind: "lead", contactId } | { kind: "dashboard", from, to, owner?, source?, segment?, stage? } |
 * { kind: "client", clientId, month } — plus generate: true to ask the AI.
 * Always answers with the facts and the system's calculations (what this
 * person may see); the AI's reading only when asked and available.
 */
export async function POST(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const body = (await req.json().catch(() => null)) as AnalysisInput | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    return NextResponse.json({ analysis: await analyze(actor, body) });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/ai/analysis POST");
  }
}
