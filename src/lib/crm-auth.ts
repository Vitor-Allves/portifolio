// Server-only. The CRM is internal-team only: a client login (even with a
// valid session) never reaches it, and since Fase 3 each staff member acts
// under a CRM profile (crm-permissions.ts) that every route enforces.

import { NextResponse, type NextRequest } from "next/server";
import { sessionScopeFromRequest, hasDataAccess } from "./auth-context";
import { resolveAllowedAccountIds } from "./session-scope";
import { MetaApiError, MetaConfigError } from "./meta-ads";
import { DbConfigError } from "./db";
import { CrmInputError } from "./crm";
import { CrmConflictError, CrmForbiddenError, CrmNotFoundError } from "./crm-core";
import { crmSessionFor, type CrmSession } from "./crm-access";
import { WhatsAppApiError, WhatsAppConfigError } from "./whatsapp";
import { InvalidUsernameError, UsernameTakenError } from "./username-registry";
import { isRateLimited } from "./rate-limit";
import { verifyInternalUserPassword } from "./internal-users";

export type { CrmSession } from "./crm-access";

/** The acting staff member with their CRM profile, or the response to return right away (401/403). */
export async function crmActorFromRequest(req: NextRequest): Promise<CrmSession | NextResponse> {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  if (scope.kind !== "staff") return NextResponse.json({ error: "O CRM é exclusivo da equipe Legado." }, { status: 403 });
  const session = await crmSessionFor(scope.userId, scope.userName, scope.role);
  if (!session) return NextResponse.json({ error: "Seu perfil não tem acesso ao CRM." }, { status: 403 });
  return { ...session, intelligenceAccountIds: resolveAllowedAccountIds(scope) };
}

/** Maps the CRM's known error types to a pt-BR response; anything else is logged and becomes a generic 500. */
export function crmErrorResponse(err: unknown, where: string): NextResponse {
  if (err instanceof CrmInputError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof CrmForbiddenError) return NextResponse.json({ error: err.message }, { status: 403 });
  if (err instanceof CrmNotFoundError) return NextResponse.json({ error: err.message }, { status: 404 });
  if (err instanceof CrmConflictError) return NextResponse.json({ error: err.message, conflict: true }, { status: 409 });
  if (err instanceof UsernameTakenError) return NextResponse.json({ error: err.message }, { status: 409 });
  if (err instanceof InvalidUsernameError) return NextResponse.json({ error: err.message }, { status: 400 });
  if (err instanceof WhatsAppConfigError) {
    return NextResponse.json({ error: "O WhatsApp ainda não está conectado ao CRM (veja docs/whatsapp-crm-setup.md)." }, { status: 503 });
  }
  if (err instanceof WhatsAppApiError) return NextResponse.json({ error: err.message }, { status: 502 });
  if (err instanceof MetaConfigError) return NextResponse.json({ error: "O Meta Ads ainda não está configurado no Intelligence (veja docs/meta-ads-setup.md)." }, { status: 503 });
  if (err instanceof MetaApiError) {
    console.error(`[${where}]`, err);
    return NextResponse.json({ error: "Não foi possível buscar os números no Meta agora. Tente de novo em alguns minutos." }, { status: 502 });
  }
  if (err instanceof DbConfigError) return NextResponse.json({ error: "Banco de dados não configurado." }, { status: 503 });
  console.error(`[${where}]`, err);
  return NextResponse.json({ error: "Erro inesperado no CRM. Tente novamente." }, { status: 500 });
}

/**
 * Sensitive team actions (new login, new password, deactivation) ask the
 * acting administrator to confirm their own password, like the Intelligence
 * admin panel does. Throttled per person. null = confirmed.
 */
export async function confirmAdminPassword(s: CrmSession, password: unknown): Promise<NextResponse | null> {
  if (isRateLimited(`crm-admin-confirm:${s.userId}`, 10, 60_000)) {
    return NextResponse.json({ error: "Muitas tentativas. Aguarde um minuto e tente novamente." }, { status: 429 });
  }
  if (typeof password !== "string" || !password) return NextResponse.json({ error: "Confirme a sua senha para continuar." }, { status: 400 });
  if (!(await verifyInternalUserPassword(s.userId, password))) return NextResponse.json({ error: "Senha incorreta." }, { status: 401 });
  return null;
}
