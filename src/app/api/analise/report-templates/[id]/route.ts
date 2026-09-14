import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { isFullAdmin } from "@/lib/session-scope";
import { deleteReportTemplate } from "@/lib/report-templates";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

function requireAdmin(req: NextRequest): boolean {
  const scope = verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
  return isFullAdmin(scope);
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  if (!requireAdmin(req)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  const { id } = await params;

  try {
    await deleteReportTemplate(id);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/report-templates/:id] DELETE", err);
    return NextResponse.json({ error: "Não foi possível excluir o modelo." }, { status: 500 });
  }
}
