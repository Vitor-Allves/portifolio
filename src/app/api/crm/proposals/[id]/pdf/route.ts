import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { getProposal, recordPdf } from "@/lib/crm-proposals";
import { proposalPdf, pdfResponse } from "@/lib/crm-proposal-pdf";

export const runtime = "nodejs";

/** The proposal as a PDF (?version=N; default the current one). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id } = await params;
  try {
    const p = await getProposal(actor, id);
    const n = Number(req.nextUrl.searchParams.get("version") ?? p.version);
    const v = p.versions.find((x) => x.version === n);
    if (!v) return NextResponse.json({ error: "Versão não encontrada." }, { status: 404 });
    const approval = p.approvals.find((a) => a.version === v.version && a.decision === "aprovada") ?? null;
    const bytes = await proposalPdf({
      number: p.number,
      version: v.version,
      content: v.content,
      contentHash: v.contentHash,
      approval,
      draft: v.sentAt === null,
      generatedBy: actor.userName,
    });
    await recordPdf(actor, id, v.version);
    return pdfResponse(bytes, p.number, v.version);
  } catch (err) {
    return crmErrorResponse(err, "api/crm/proposals/[id]/pdf GET");
  }
}
