// Base fixture (DATABASE_URL must point at an empty test database): three
// CRM users (password crm-teste-123) and known contacts, opportunities,
// events and tasks around October 2026, so every Painel number can be
// checked by hand. Never run against a real database.
import { getDb } from "../../src/lib/db";
import { hashPassword } from "../../src/lib/password";

(async () => {
  const db = await getDb();
  const hash = await hashPassword("crm-teste-123");
  for (const [id, name, role, username] of [
    ["u-vitor", "Vitor", "gestor", "vitor"],
    ["u-joao", "João", "analista", "joao"],
    ["u-admin", "Beatriz Admin", "administrador", "admin"],
  ]) {
    await db.query(`INSERT INTO internal_users (id, name, password_hash, role, username) VALUES ($1,$2,$3,$4,$5)`, [id, name, hash, role, username]);
  }
  await db.query(`UPDATE internal_users SET crm_role = CASE role WHEN 'gestor' THEN 'gestor' WHEN 'analista' THEN 'comercial' ELSE 'administrador' END`);
  const t = (d: string) => `${d}T12:00:00-03:00`;
  const contacts = [
    ["c1", "Ana Ribeiro", "5515990000001", "u-vitor", "indicacao", "2026-10-03", null],
    ["c2", "Bruno Souza", "5515990000002", "u-joao", "bni", "2026-10-10", null],
    ["c3", "Carla Dias", "5515990000003", "u-joao", "anuncio", "2026-10-20", null],
    ["c4", "Davi Lima", "5515990000004", "u-vitor", "anuncio", "2026-09-15", null],
    ["c5", "Eva Prado", "5515990000005", null, "site", "2026-10-25", null],
    ["c6", "Fábio Arquivado", "5515990000006", "u-vitor", "anuncio", "2026-10-05", "2026-10-30"],
  ];
  for (const [id, name, phone, owner, source, created, archived] of contacts) {
    await db.query(
      `INSERT INTO crm_contacts (id, name, phone, owner_id, source, stage, created_at, updated_at, stage_changed_at, archived_at)
       VALUES ($1,$2,$3,$4,$5,'novo',$6,$6,$6,$7)`,
      [id, name, phone, owner, source, t(created as string), archived ? t(archived as string) : null]
    );
  }
  const deals = [
    // id, contact, owner, stage, value, created, closed, lost_reason
    ["d1", "c1", "u-vitor", "ganho", 500000, "2026-10-03", "2026-10-13", null],
    ["d2", "c2", "u-joao", "perdido", 200000, "2026-10-10", "2026-10-20", "concorrente"],
    ["d3", "c3", "u-joao", "proposta", 300000, "2026-10-20", null, null],
    ["d4", "c4", "u-vitor", "ganho", null, "2026-09-15", "2026-09-25", null],
    ["d5", "c5", null, "novo", null, "2026-10-25", null, null],
    ["d6", "c1", "u-vitor", "reuniao", 100000, "2026-10-15", null, null],
    ["d7", "c6", "u-vitor", "ganho", 999, "2026-10-05", "2026-10-14", null],
  ];
  for (const [id, contact, owner, stage, value, created, closed, reason] of deals) {
    await db.query(
      `INSERT INTO crm_deals (id, contact_id, title, value_cents, stage, owner_id, stage_changed_at, closed_at, lost_reason, created_at, updated_at)
       VALUES ($1,$2,$1,$3,$4,$5,$6,$7,$8,$6,$6)`,
      [id, contact, value, stage, owner, t(created as string), closed ? t(closed as string) : null, reason]
    );
  }
  let seq = 0;
  const ev = (contact: string, kind: string, payload: object, day: string) =>
    db.query(`INSERT INTO crm_events (id, contact_id, kind, payload, user_id, created_at) VALUES ($1,$2,$3,$4,'u-vitor',$5)`, [
      `e${++seq}`, contact, kind, JSON.stringify(payload), t(day),
    ]);
  for (const [d, c, day] of [["d1", "c1", "2026-10-03"], ["d2", "c2", "2026-10-10"], ["d3", "c3", "2026-10-20"], ["d5", "c5", "2026-10-25"], ["d6", "c1", "2026-10-15"], ["d4", "c4", "2026-09-15"], ["d7", "c6", "2026-10-05"]]) {
    await ev(c, "deal", { action: "created", dealId: d, stage: "novo" }, day);
  }
  await ev("c2", "stage", { from: "novo", to: "reuniao", dealId: "d2" }, "2026-10-12");
  await ev("c2", "stage", { from: "reuniao", to: "proposta", dealId: "d2" }, "2026-10-15");
  await ev("c2", "stage", { from: "proposta", to: "perdido", dealId: "d2" }, "2026-10-20");
  await ev("c3", "stage", { from: "novo", to: "proposta", dealId: "d3" }, "2026-10-22");
  await ev("c1", "stage", { from: "novo", to: "reuniao", dealId: "d6" }, "2026-10-16");
  await ev("c1", "stage", { from: "novo", to: "ganho", dealId: "d1" }, "2026-10-13");
  await ev("c4", "stage", { from: "novo", to: "reuniao" }, "2026-09-20"); // legacy, no dealId
  await ev("c6", "stage", { from: "novo", to: "reuniao", dealId: "d7" }, "2026-10-14"); // archived contact
  const tasks = [
    // id, contact, owner, due, all_day, done, canceled
    ["t1", "c1", "u-vitor", t("2026-10-05"), true, t("2026-10-05"), null],
    ["t2", "c2", "u-joao", t("2026-10-21"), true, t("2026-10-21"), null],
    ["t3", "c4", "u-vitor", t("2026-09-10"), true, t("2026-09-10"), null],
    ["t4", "c3", "u-joao", t("2026-10-01"), true, null, null],
    ["t5", "c1", "u-vitor", "TODAY", true, null, null],
    ["t6", "c3", "u-joao", t("2026-10-08"), true, t("2026-10-08"), t("2026-10-08")],
  ];
  for (const [id, contact, owner, due, allDay, done, canceled] of tasks) {
    await db.query(
      `INSERT INTO crm_tasks (id, contact_id, kind, title, due_at, all_day, owner_id, done_at, canceled_at)
       VALUES ($1,$2,'tarefa',$1, CASE WHEN $3 = 'TODAY' THEN ((now() AT TIME ZONE 'America/Sao_Paulo')::date + time '12:00') AT TIME ZONE 'America/Sao_Paulo' ELSE $3::timestamptz END, $4, $5, $6, $7)`,
      [id, contact, due, allDay, owner, done, canceled]
    );
  }
  console.log("base fixture seeded");
  process.exit(0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
