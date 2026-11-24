// Fase 6 · entrega 2 in the browser, on base + campaign fixtures: the Gestor
// sets this month's goals, sees the progress (with the expected pace), copies
// them into the next month, finds the goals card on the Painel; productivity
// per person in a period; a Comercial sees only their own line and can't
// edit or export; phone and dark theme.
import { go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const month = await sql(`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`);
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const name = (m) => MONTHS[Number(m.slice(5, 7)) - 1];
const next = (m) => {
  const [y, mm] = m.split("-").map(Number);
  return mm === 12 ? `${y + 1}-01` : `${y}-${String(mm + 1).padStart(2, "0")}`;
};
// This month's leads (the campaign fixture's contacts are created today): the team's and Vitor's.
const teamLeads = Number(await sql(`SELECT count(*) FROM crm_contacts WHERE archived_at IS NULL AND to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $1`, [month]));
const vitorLeads = Number(
  await sql(`SELECT count(*) FROM crm_contacts WHERE archived_at IS NULL AND owner_id = 'u-vitor' AND to_char(created_at AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM') = $1`, [month])
);

const { page: g } = await login(browser, "vitor", { errors });
await go(g, "Metas e produtividade");
await g.getByRole("heading", { level: 1, name: "Metas e produtividade" }).waitFor();
const goals = g.getByRole("region", { name: "Metas do mês" });
await goals.getByText(`Nenhuma meta definida para ${name(month)}`, { exact: false }).waitFor();
ok(true, "no goals yet this month");

// ---- set this month's goals ----
await goals.getByRole("button", { name: "Editar metas" }).click();
await goals.getByLabel("Meta de leads cadastrados — equipe").fill("10");
await goals.getByLabel("Meta de negócios ganhos — equipe").fill("3");
await goals.getByLabel("Meta de valor vendido — equipe").fill("20.000");
await goals.getByLabel("Meta de leads cadastrados — Vitor").fill("4");
await goals.getByLabel("Meta de reuniões agendadas — João").fill("2");
await shot(g, "f6e2-editar-metas");
await goals.getByRole("button", { name: "Salvar metas" }).click();
await goals.getByText("Metas salvas.").waitFor();
const team = goals.getByRole("article", { name: "Metas da equipe" });
const bar = (scope, label) => scope.getByRole("progressbar", { name: label });
ok(
  (await bar(team, "Leads cadastrados — equipe").getAttribute("aria-valuetext")).startsWith(`${teamLeads} de 10 (${Math.round((teamLeads / 10) * 100)}%)`),
  `team: ${teamLeads} of 10 leads (${await bar(team, "Leads cadastrados — equipe").getAttribute("aria-valuetext")})`
);
ok(/ de R\$\s20\smil/.test(await bar(team, "Valor vendido — equipe").getAttribute("aria-valuetext")), "team: valor vendido against R$ 20 mil");
const vitor = goals.getByRole("article", { name: "Metas de Vitor" });
ok((await bar(vitor, "Leads cadastrados — Vitor").getAttribute("aria-valuetext")).startsWith(`${vitorLeads} de 4`), `Vitor: ${vitorLeads} of 4 leads`);
ok(await vitor.getByText("Vitor (você)").isVisible(), "the Gestor's own card says so");
ok(await goals.getByText(/Metas alteradas por Vitor/).isVisible(), "who changed the goals last");
ok((await goals.getByText(/% do mês decorrido/).count()) <= 1, "the month's pace is shown (except on its last day)");
await shot(g, "f6e2-metas");

// ---- copy into next month ----
await goals.getByRole("button", { name: "Próximo mês" }).click();
await goals.getByText(`Nenhuma meta definida para ${name(next(month))}`, { exact: false }).waitFor();
await goals.getByRole("button", { name: "Editar metas" }).click();
await goals.getByRole("button", { name: `Copiar de ${name(month)}` }).click();
await goals.getByText(`Metas de ${name(month)}`, { exact: false }).waitFor();
ok((await goals.getByLabel("Meta de leads cadastrados — equipe").inputValue()) === "10" && (await goals.getByLabel("Meta de valor vendido — equipe").inputValue()) === "20.000", "copied from the previous month");
await goals.getByRole("button", { name: "Cancelar" }).click();
await goals.getByRole("button", { name: "Mês anterior" }).click();
await bar(team, "Leads cadastrados — equipe").waitFor();

// ---- productivity ----
const prod = g.getByRole("region", { name: "Produtividade", exact: true });
await prod.getByLabel("Período da produtividade").selectOption("custom");
await prod.getByLabel("Data inicial").fill("2026-10-01");
await prod.getByLabel("Data final").fill("2026-10-31");
await prod.getByText("01/10 a 31/10", { exact: false }).waitFor();
const table = prod.getByRole("table", { name: "Produtividade no período" });
await g.waitForFunction(() => document.querySelector('table[aria-label="Produtividade no período"] tfoot')?.textContent?.startsWith("Equipe4"));
const row = await table.getByRole("row", { name: /^Vitor/ }).innerText();
ok(/R\$\s?5\smil/.test(row), `Vitor in October: R$ 5 mil vendido (${row.replace(/\s+/g, " ")})`);
ok(await prod.getByRole("link", { name: "Exportar CSV" }).isVisible(), "productivity can be exported");
await shot(g, "f6e2-produtividade");

// ---- the Painel's goals card ----
await go(g, "Painel");
const card = g.getByRole("region", { name: `Metas de ${name(month)} · equipe` });
await card.waitFor();
ok((await card.getByRole("progressbar").count()) === 3, "the Painel shows the team's 3 goals of the month");
await card.scrollIntoViewIfNeeded();
await shot(g, "f6e2-painel-metas");
await g.getByLabel("Responsável").selectOption("u-vitor");
await g.getByRole("region", { name: `Metas de ${name(month)}` }).waitFor();
ok(true, "…and Vitor's own when he is picked");
await g.getByRole("region", { name: `Metas de ${name(month)}` }).getByRole("button", { name: "Ver metas e produtividade" }).click();
await g.getByRole("heading", { level: 1, name: "Metas e produtividade" }).waitFor();
ok(true, "the card leads to Metas e produtividade");

// ---- Comercial ----
const { page: j } = await login(browser, "joao", { errors });
await j.getByRole("region", { name: `Metas de ${name(month)}` }).waitFor();
ok(true, "João sees his goal on the Painel");
await go(j, "Metas e produtividade");
const jg = j.getByRole("region", { name: "Metas do mês" });
await jg.getByRole("article", { name: "Metas de João" }).waitFor();
ok((await jg.getByRole("article").count()) === 1, "João sees only his own goals");
ok((await j.getByRole("button", { name: "Editar metas" }).count()) === 0 && (await j.getByRole("link", { name: "Exportar CSV" }).count()) === 0, "…can't edit or export");
await j.getByRole("heading", { name: "Sua produtividade" }).waitFor();
ok((await j.getByRole("table", { name: "Produtividade no período" }).getByRole("row").count()) === 2, "…and only his own productivity line");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Metas e produtividade");
await p.getByRole("article", { name: "Metas da equipe" }).getByRole("progressbar").first().waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "phone: no horizontal scroll");
await shot(p, "f6e2-metas-celular-escuro");
await p.getByRole("button", { name: "Editar metas" }).click();
await p.getByLabel("Meta de leads cadastrados — equipe").waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "phone, editing: no horizontal scroll");
await p.getByRole("region", { name: "Produtividade", exact: true }).scrollIntoViewIfNeeded();
await shot(p, "f6e2-produtividade-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("GOALS E2E PASSED");
