import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { isActionAllowed } from "@/lib/client-permissions";
import { deleteReportTemplate } from "@/lib/report-templates";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const scope = await sessionScopeFromRequest(req);
  const canManage =
    hasDataAccess(scope) &&
    (isFullAdmin(scope) || (scope.kind === "staff" && isActionAllowed(scope.permissions, "manage_report_templates")));
  if (!canManage) {
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
