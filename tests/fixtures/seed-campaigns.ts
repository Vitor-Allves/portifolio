// Campaign fixture, on top of seed-base: a Marketing user and contacts
// covering every campaign rule (consent, unsubscribed, no phone, archived,
// a number the fake Meta API rejects). Never run against a real database.
import { getDb } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";

(async () => {
  const db = await getDb();
  await db.query(`INSERT INTO internal_users (id, name, password_hash, role, username, crm_role) VALUES ('u-maria', 'Maria Marketing', $1, 'analista', 'maria', 'marketing')`, [await hashPassword("crm-teste-123")]);
  await db.query(`INSERT INTO crm_companies (id, name, name_key) VALUES ('co-sol', 'Clínica Sol', 'clinica sol')`);
  const rows: [string, string, string | null, string | null, string, string, boolean, boolean, string | null][] = [
    // id, name, phone, owner, source, consent, optedOut, archived, company
    ["k1", "Gabriela Mota", "5515990000011", "u-vitor", "bni", "sim", false, false, "co-sol"],
    ["k2", "Henrique Alves", "5515990000012", "u-joao", "bni", "sim", false, false, null],
    ["k3", "Iara Nunes", "5515990000013", null, "bni", "sim", true, false, null],
    ["k4", "Jonas Pires", "5515990000014", null, "bni", "nao_informado", false, false, null],
    ["k5", "Karla Sem Fone", null, null, "bni", "sim", false, false, null],
    ["k6", "Lucas Erro", "5515990000099", null, "bni", "sim", false, false, null],
    ["k7", "Marina Arquivada", "5515990000017", null, "bni", "sim", false, true, null],
    ["k8", "Nina Costa", "5515990000018", "u-vitor", "site", "sim", false, false, null],
  ];
  for (const [id, name, phone, owner, source, consent, opted, archived, company] of rows) {
    await db.query(
      `INSERT INTO crm_contacts (id, name, phone, email, owner_id, source, consent_status, consent_at, opted_out_at, archived_at, company_id)
       VALUES ($1,$2,$3,$4,$5,$6,$7, CASE WHEN $7 = 'sim' THEN now() END, CASE WHEN $8 THEN now() END, CASE WHEN $9 THEN now() END, $10)`,
      [id, name, phone, phone ? null : `${id}@exemplo.com`, owner, source, consent, opted, archived, company]
    );
  }
  console.log("campaign fixture seeded");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
