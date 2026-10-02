import { NextRequest, NextResponse } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { getClientBudgetWithPrevious, upsertClientBudget } from "@/lib/client-budgets";
import { DbConfigError } from "@/lib/db";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

async function requireFullAdmin(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope) || !isFullAdmin(scope)) return null;
  return scope;
}

function currentYearMonth(): { year: number; month: number } {
  const now = new Date();
  return { year: now.getUTCFullYear(), month: now.getUTCMonth() + 1 };
}

/** Always the CURRENT month — the admin form only ever edits this month's budget (see BudgetCard.tsx, which is always about the current month regardless of the dashboard's own period filter). */
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;
  const { year, month } = currentYearMonth();

  try {
    const { current, previous } = await getClientBudgetWithPrevious(id, year, month);
    return NextResponse.json({ year, month, current, previous });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/clients/:id/budget] GET", err);
    return NextResponse.json({ error: "Não foi possível carregar o orçamento." }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const admin = await requireFullAdmin(req);
  if (!admin) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }
  const { id } = await params;

  let body: { amount?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }
  const amount = typeof body.amount === "number" && Number.isFinite(body.amount) && body.amount >= 0 ? body.amount : null;
  if (amount === null) {
    return NextResponse.json({ error: "Informe um valor de orçamento válido." }, { status: 400 });
  }

  const { year, month } = currentYearMonth();
  try {
    await upsertClientBudget(id, year, month, amount);
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
    }
    console.error("[api/analise/admin/clients/:id/budget] PUT", err);
    return NextResponse.json({ error: "Não foi possível salvar o orçamento." }, { status: 500 });
  }

  await writeAudit({
    actorUserId: admin.userId,
    actorLabel: admin.userName,
    actorKind: "admin",
    action: "user.permissions_change",
    targetType: "client_access",
    targetId: id,
    metadata: { changedFields: ["budget"], year, month, amount },
  });

  return NextResponse.json({ ok: true, year, month, amount });
}
