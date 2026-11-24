import { NextRequest, NextResponse } from "next/server";
import { getPublicProposal } from "@/lib/crm-proposals";
import { proposalPdf, pdfResponse } from "@/lib/crm-proposal-pdf";
import { clientMeta } from "@/lib/proposal-public-http";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** The version on the client's screen, as a PDF. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (isRateLimited(`proposal-pdf:${clientMeta(req).ip}`, 20)) return NextResponse.json({ error: "Muitas tentativas." }, { status: 429 });
  const p = await getPublicProposal(token);
  if (!p || !p.content || p.version === null) return NextResponse.json({ error: "Proposta não encontrada." }, { status: 404 });
  const bytes = await proposalPdf({
    number: Number(p.number),
    version: p.version,
    content: p.content,
    contentHash: p.contentHash ?? "",
    approval: p.decision?.decision === "aprovada" ? { name: p.decision.name, createdAt: p.decision.createdAt, version: p.decision.version } : null,
    draft: false,
    generatedBy: "Legado Enterprise",
  });
  return pdfResponse(bytes, Number(p.number), p.version);
}
