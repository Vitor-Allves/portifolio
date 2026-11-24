import { NextRequest, NextResponse } from "next/server";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { contractPdf } from "@/lib/crm-operations";
import { proposalNumber } from "@/lib/crm-proposal-types";

export const runtime = "nodejs";

/** The contract as a document to review and sign (PDF), with the approved proposal's services when it came from one. */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string; contractId: string }> }) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const { id, contractId } = await params;
  try {
    const { bytes, number } = await contractPdf(actor, id, contractId);
    return new NextResponse(new Uint8Array(bytes), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="contrato-${proposalNumber(number)}.pdf"`,
        "Cache-Control": "private, no-store",
      },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/clients/[id]/contracts/[contractId]/pdf GET");
  }
}
