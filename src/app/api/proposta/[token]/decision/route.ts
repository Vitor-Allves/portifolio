import { NextRequest, NextResponse } from "next/server";
import { crmErrorResponse } from "@/lib/crm-auth";
import { decidePublic } from "@/lib/crm-proposals";
import { clientMeta, isTeam } from "@/lib/proposal-public-http";
import { isRateLimited } from "@/lib/rate-limit";

export const runtime = "nodejs";

/** The client approves or refuses: { decision: aprovar | recusar, name, email, document?, comment?, version, contentHash, accept }. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const meta = clientMeta(req);
  if (isRateLimited(`proposal-decision:${meta.ip}`, 10, 10 * 60_000))
    return NextResponse.json({ error: "Muitas tentativas. Tente de novo em alguns minutos." }, { status: 429 });
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  try {
    if (await isTeam(req))
      return NextResponse.json({ error: "Você está conectado como equipe Legado: a resposta precisa vir do cliente (ou registre-a no CRM)." }, { status: 403 });
    return NextResponse.json({ status: await decidePublic(token, body, meta) });
  } catch (err) {
    return crmErrorResponse(err, "api/proposta/[token]/decision POST");
  }
}
