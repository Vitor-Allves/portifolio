// Server-only. Who may see / change the files of a record: the same rules as
// the record itself (crm-access.ts) — a contact's, its lead's; a company's,
// everyone sees them and who may work on the company changes them; an active
// client's, the clients screen and its owner.

import { getDb } from "./db";
import { CrmForbiddenError, CrmInputError, CrmNotFoundError } from "./crm-core";
import { canAct, canSee, requireCap, requireContact, type Access, type CrmSession } from "./crm-access";
import type { FileTarget } from "./crm-files";

export async function requireFileTarget(s: CrmSession, t: FileTarget, access: Access): Promise<void> {
  if (t.contactId) {
    await requireContact(s, t.contactId, access);
    if (access === "act") requireCap(s, "editContacts");
    return;
  }
  const db = await getDb();
  if (t.companyId) {
    const { rows } = await db.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_companies WHERE id = $1`, [t.companyId]);
    if (!rows[0]) throw new CrmNotFoundError("Empresa não encontrada.");
    if (access === "act") {
      requireCap(s, "editContacts");
      if (!canAct(s, rows[0].owner_id)) throw new CrmForbiddenError("Essa empresa está na carteira de outra pessoa.");
    }
    return;
  }
  if (t.clientId) {
    requireCap(s, "viewClients");
    const { rows } = await db.query<{ owner_id: string | null }>(`SELECT owner_id FROM crm_clients WHERE id = $1`, [t.clientId]);
    if (!rows[0] || !canSee(s, rows[0].owner_id)) throw new CrmNotFoundError("Cliente não encontrado.");
    if (access === "act") {
      requireCap(s, "editClients");
      if (!canAct(s, rows[0].owner_id)) throw new CrmForbiddenError("Este cliente é de outra pessoa: só o responsável (ou um Gestor) altera.");
    }
    return;
  }
  throw new CrmInputError("Escolha o contato, a empresa ou o cliente.");
}

export function targetFrom(get: (k: string) => string | null | undefined): FileTarget {
  const v = (k: string) => {
    const x = get(k);
    return typeof x === "string" && x ? x.slice(0, 80) : null;
  };
  return { contactId: v("contactId"), companyId: v("companyId"), clientId: v("clientId"), dealId: v("dealId") };
}
