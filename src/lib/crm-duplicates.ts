// Server-only. Duplicidade (evolução v1.0, item 2.2): who already has a
// phone, e-mail, CNPJ or company name typed on a form, with the owner and the
// situation, so the screen warns before saving (saving checks again).

import { getDb } from "./db";
import { findDuplicate } from "./crm";
import { companyDuplicate } from "./crm-companies";
import { type CrmDuplicateInfo } from "./crm-core";
import { companyKey, normalizePhone } from "./crm-types";

export async function checkDuplicates(q: {
  phone?: string | null;
  email?: string | null;
  cnpj?: string | null;
  company?: string | null;
}): Promise<CrmDuplicateInfo[]> {
  const db = await getDb();
  const out: CrmDuplicateInfo[] = [];
  let phone: string | null = null;
  try {
    phone = q.phone ? normalizePhone(q.phone) : null;
  } catch {
    phone = null;
  }
  const email = q.email?.trim().toLowerCase() || null;
  if (phone) {
    const d = await findDuplicate(db, phone, null);
    if (d) out.push(d);
  }
  if (email) {
    const d = await findDuplicate(db, null, email);
    if (d && !out.some((x) => x.id === d.id)) out.push(d);
  }
  const cnpj = (q.cnpj ?? "").replace(/\D/g, "");
  if (cnpj.length === 14) {
    const d = await companyDuplicate(db, "cnpj", cnpj, null);
    if (d) out.push(d);
  }
  const key = q.company ? companyKey(q.company) : "";
  if (key) {
    const d = await companyDuplicate(db, "name", key, null);
    if (d && !out.some((x) => x.id === d.id)) out.push(d);
  }
  return out;
}
