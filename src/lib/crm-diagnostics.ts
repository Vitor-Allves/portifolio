// Server-only. Diagnóstico comercial (evolução v1.0, item 2.3): a form on
// the contact (and, optionally, one of its opportunities) with what was
// learned about the lead. Every save is a new version; the earlier ones are
// kept and can be read (nothing is overwritten). Writing it is working on the
// lead (only who may act on it); reading follows the lead.

import { randomUUID } from "crypto";
import { getDb, withTransaction } from "./db";
import { CrmInputError, addEvent, cleanText, iso, type CrmActor } from "./crm-core";
import { parseMoneyToCents } from "./crm-types";
import { DIAGNOSIS_FIELDS, URGENCIES, type CrmDiagnosis, type DiagnosisData } from "./crm-diagnosis-fields";

export { DIAGNOSIS_FIELDS, URGENCIES, type CrmDiagnosis, type DiagnosisData };

/** Validates the form: at least the main need; money as R$; urgency from the list. */
export function parseDiagnosis(input: Record<string, unknown>): DiagnosisData {
  const out: DiagnosisData = {};
  for (const f of DIAGNOSIS_FIELDS) {
    const v = input[f.id];
    if (v === undefined || v === null || v === "") continue;
    if (f.kind === "money") {
      try {
        out[f.id] = parseMoneyToCents(v);
      } catch {
        throw new CrmInputError(`${f.label}: valor inválido.`);
      }
    } else if (f.kind === "urgency") {
      if (!URGENCIES.some((u) => u.id === v)) throw new CrmInputError("Urgência inválida.");
      out[f.id] = v as string;
    } else {
      out[f.id] = cleanText(v, f.kind === "line" ? 160 : 2000);
    }
  }
  if (!out.need) throw new CrmInputError("Informe a principal necessidade do lead.");
  return out;
}

type Row = {
  id: string;
  contact_id: string;
  deal_id: string | null;
  deal_title: string | null;
  version: number;
  data: DiagnosisData;
  created_by_name: string | null;
  created_at: Date;
};
const SELECT = `SELECT g.id, g.contact_id, g.deal_id, d.title AS deal_title, g.version, g.data, g.created_by_name, g.created_at
  FROM crm_diagnostics g LEFT JOIN crm_deals d ON d.id = g.deal_id`;
const map = (r: Row): CrmDiagnosis => ({
  id: r.id,
  contactId: r.contact_id,
  dealId: r.deal_id,
  dealTitle: r.deal_title,
  version: r.version,
  data: r.data,
  createdByName: r.created_by_name,
  createdAt: iso(r.created_at)!,
});

/** Every version of the contact's diagnosis, newest first. */
export async function listDiagnoses(contactId: string): Promise<CrmDiagnosis[]> {
  const db = await getDb();
  const { rows } = await db.query<Row>(`${SELECT} WHERE g.contact_id = $1 ORDER BY g.version DESC`, [contactId]);
  return rows.map(map);
}

/** Saves a new version (the previous ones stay). Returns it. */
export async function saveDiagnosis(contactId: string, input: Record<string, unknown>, actor: CrmActor): Promise<CrmDiagnosis> {
  const data = parseDiagnosis(input);
  const dealId = typeof input.dealId === "string" && input.dealId ? input.dealId : null;
  const id = randomUUID();
  await withTransaction(async (client) => {
    await client.query(`SELECT 1 FROM crm_contacts WHERE id = $1 FOR UPDATE`, [contactId]);
    if (dealId) {
      const d = await client.query(`SELECT 1 FROM crm_deals WHERE id = $1 AND contact_id = $2`, [dealId, contactId]);
      if (!d.rows.length) throw new CrmInputError("Oportunidade inválida para este contato.");
    }
    const v = await client.query<{ n: number }>(`SELECT COALESCE(max(version), 0) + 1 AS n FROM crm_diagnostics WHERE contact_id = $1`, [contactId]);
    const version = Number(v.rows[0].n);
    await client.query(
      `INSERT INTO crm_diagnostics (id, contact_id, deal_id, version, data, created_by, created_by_name) VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, contactId, dealId, version, JSON.stringify(data), actor?.userId ?? null, actor?.userName ?? null],
    );
    await addEvent(client, contactId, "diagnosis", { version, diagnosisId: id, dealId, need: data.need }, actor);
  });
  const db = await getDb();
  const { rows } = await db.query<Row>(`${SELECT} WHERE g.id = $1`, [id]);
  return map(rows[0]);
}
