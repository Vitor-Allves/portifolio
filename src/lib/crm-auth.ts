// Server-only. The CRM is internal-team only: a client login (even with a
// valid session) never reaches it.

import { NextResponse, type NextRequest } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "./auth-context";
import { DbConfigError } from "./db";
import { CrmInputError, type CrmActor } from "./crm";
import { WhatsAppApiError, WhatsAppConfigError } from "./whatsapp";

/** The acting staff member, or the response to return right away (401/403). */
export async function crmActorFromRequest(req: NextRequest): Promise<CrmActor | NextResponse> {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (scope.kind !== "staff") return NextResponse.json({ error: "O CRM é exclusivo da equipe Legado." }, { status: 403 });
  return { userId: scope.userId, userName: scope.userName };
}

/** Maps the CRM's known error types to a pt-BR response; anything else is logged and becomes a generic 500. */
export function crmErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof CrmInputError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof WhatsAppConfigError) {
    return NextResponse.json({ error: "O WhatsApp ainda não está conectado ao CRM (veja docs/whatsapp-crm-setup.md)." }, { status: 503 });
  }
  if (err instanceof WhatsAppApiError) return NextResponse.json({ error: err.message }, { status: 502 });
  if (err instanceof DbConfigError) return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  console.error(`[${where}]`, err);
  return NextResponse.json({ error: "Erro inesperado no CRM. Tente novamente." }, { status: 500 });
}
