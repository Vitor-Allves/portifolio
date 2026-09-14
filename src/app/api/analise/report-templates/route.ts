import { NextRequest, NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "@/lib/analise-session-node";
import { isFullAdmin } from "@/lib/session-scope";
import { createReportTemplate, listReportTemplates } from "@/lib/report-templates";
import { sanitizeReportFilters } from "@/lib/report-templates-types";
import { DbConfigError } from "@/lib/db";

export const runtime = "nodejs";

const DB_NOT_CONFIGURED_MESSAGE =
  "Banco de dados não configurado. Veja docs/client-access-setup.md.";

function requireSession(req: NextRequest) {
  return verifySessionToken(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
}

/** Any authenticated session (admin, analyst, or client) can list templates — they're read-only presets to apply, not something a viewer manages. */
export async function GET(req: NextRequest) {
  if (!requireSession(req)) {
    return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  }

  try {
    const templates = await listReportTemplates();
    return NextResponse.json({ templates });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    console.error("[api/analise/report-templates] GET", err);
    return NextResponse.json({ error: "Não foi possível carregar os modelos." }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const scope = requireSession(req);
  if (!isFullAdmin(scope)) {
    return NextResponse.json({ error: "Acesso restrito." }, { status: 403 });
  }

  let body: { name?: unknown; filters?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const name = typeof body.name === "string" ? body.name.trim() : "";
  const filters = sanitizeReportFilters(body.filters);

  if (!name) {
    return NextResponse.json({ error: "Informe o nome do modelo." }, { status: 400 });
  }
  if (!filters) {
    return NextResponse.json({ error: "Filtros inválidos." }, { status: 400 });
  }

  try {
    const { id } = await createReportTemplate(name, filters);
    return NextResponse.json({ id, name, filters });
  } catch (err) {
    if (err instanceof DbConfigError) {
      return NextResponse.json({ error: DB_NOT_CONFIGURED_MESSAGE }, { status: 503 });
    }
    console.error("[api/analise/report-templates] POST", err);
    return NextResponse.json({ error: "Não foi possível criar o modelo." }, { status: 500 });
  }
}
