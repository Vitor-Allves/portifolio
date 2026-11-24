// Fase 5 · entrega 2 in the browser, on base + campaign fixtures:
// "Acompanhamento de clientes" (month, pending first, summary), registering
// this month and last month from the client panel's Acompanhamento tab, the
// contract-end notice in the bell opening the client, the history line,
// automation 9's "dia do mês" in Automações, phone and dark theme.
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const json = async (r) => ({ status: r.status(), body: await r.json().catch(() => null) });
const day = (offset) => sql(`SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int)::text`, [offset]);
const month = await sql(`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`);
const prev = await sql(`SELECT to_char((now() AT TIME ZONE 'America/Sao_Paulo') - interval '1 month', 'YYYY-MM')`);
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const label = (m) => `${MONTHS[Number(m.slice(5)) - 1]} de ${m.slice(0, 4)}`;

await sql(`INSERT INTO crm_options (kind, id, label, sort) VALUES ('service', 'trafego', 'Gestão de tráfego', 1), ('service', 'social', 'Social media', 2)`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor')`);
await sql(`UPDATE crm_contacts SET company_id = 'co-rib' WHERE id = 'c1'`);
const { api: admin, page: a } = await login(browser, "admin", { errors });
const rib = (await json(await admin.post(`${BASE}/api/crm/clients/`, { data: { companyId: "co-rib", ownerId: "u-vitor", status: "ativo", startedOn: `${prev}-05` } }))).body.id;
await admin.post(`${BASE}/api/crm/clients/${rib}/contracts/`, { data: { services: ["trafego"], startsOn: await day(-30), endsOn: await day(10), value: "2.000" } });
await admin.patch(`${BASE}/api/crm/automations/renovacao_contrato/`, { data: { status: "ativa", config: { days: 15 } } });
ok((await json(await admin.post(`${BASE}/api/crm/automations/run/`, { data: { id: "renovacao_contrato" } }))).body.results.renovacao_contrato.ok === 1, "automation 8 ran");

// ---- the overview ----
const { page: g } = await login(browser, "vitor", { errors });
await go(g, "Acompanhamento de clientes");
await g.getByRole("heading", { level: 1, name: "Acompanhamento de clientes" }).waitFor();
const summary = g.getByRole("region", { name: "Resumo do mês" });
await summary.getByText(`de 1 cliente com o acompanhamento de ${label(month)} registrado`, { exact: false }).waitFor();
ok((await summary.locator("strong").textContent()) === "0", "nobody updated this month yet");
const list = g.getByRole("list", { name: "Clientes do mês" });
await list.getByRole("button", { name: /Ribeiro Odonto.*Pendente/ }).click();

// ---- registering this month ----
const panel = g.getByRole("dialog", { name: "Cliente Ribeiro Odonto" });
await panel.getByRole("tab", { name: "Acompanhamento", selected: true }).waitFor();
const form = panel.getByRole("form", { name: `Acompanhamento de ${label(month)}` });
ok(await form.getByLabel("Gestão de tráfego").isChecked(), "a new month starts with the contract's services");
await form.getByLabel("Atividades executadas").fill("Campanhas de implantes no Instagram");
await form.getByLabel("Resultados").fill("42 leads, 6 avaliações");
await form.getByLabel("Pontos de atenção").fill("Orçamento acaba dia 20");
await form.getByLabel("Próximas ações").fill("Testar vídeo com a Dra. Ana");
await form.getByRole("button", { name: "Registrar acompanhamento" }).click();
await form.getByText("Salvo", { exact: true }).waitFor();
await panel.getByText(/Atualizado por Vitor em/).waitFor();
const months = panel.getByRole("region", { name: "Meses registrados" });
ok(await months.getByText("Resultados: 42 leads, 6 avaliações").isVisible(), "this month is in the monthly history");
await shot(g, "f5e2-acompanhamento-cliente");

// ---- last month ----
await panel.getByLabel("Mês de referência").selectOption(prev);
const prevForm = panel.getByRole("form", { name: `Acompanhamento de ${label(prev)}` });
await prevForm.getByLabel("Atividades executadas").fill("Setup das contas e pixel");
await prevForm.getByRole("button", { name: "Registrar acompanhamento" }).click();
await prevForm.getByText("Salvo", { exact: true }).waitFor();
ok((await months.getByRole("listitem").count()) === 2, "two months registered");
await panel.getByRole("tab", { name: "Histórico" }).click();
await panel.getByText(`Acompanhamento de ${label(month)} registrado`).waitFor();
ok(true, "the history says so");
await panel.getByRole("button", { name: "Fechar painel" }).click();

await list.getByRole("button", { name: /Ribeiro Odonto.*Atualizado/ }).waitFor();
ok((await summary.locator("strong").textContent()) === "1", "summary: 1 of 1 updated");
await g.getByRole("button", { name: "Mês anterior" }).click();
await g.getByText(label(prev)).first().waitFor();
await list.getByRole("button", { name: /Ribeiro Odonto.*Atualizado/ }).waitFor();
ok(true, "last month too");
await shot(g, "f5e2-acompanhamento-lista");

// ---- the bell opens the client ----
await g.getByRole("button", { name: /^Lembretes: \d+ novos?$/ }).click();
await g.getByRole("dialog", { name: "Lembretes" }).getByText("Contrato perto do fim: Ribeiro Odonto").click();
await g.getByRole("dialog", { name: "Cliente Ribeiro Odonto" }).getByRole("region", { name: "Contratos" }).getByText("Vence em 10 dias").waitFor();
ok(true, "the contract-end notice opens the client");

// ---- automation 9 in Automações ----
await go(a, "Automações");
const rule = a.getByRole("list", { name: "Lista de automações" }).getByRole("region", { name: "Cliente sem atualização mensal: tarefa" });
await rule.getByRole("button", { name: "Ajustar" }).click();
const adjust = rule.getByRole("form", { name: "Ajustar Cliente sem atualização mensal: tarefa" });
ok((await adjust.getByLabel("Dia do mês").inputValue()) === "25" && (await adjust.getByLabel("Se o cliente não tiver responsável").isVisible()), "dia do mês and the client's responsible");
await shot(a, "f5e2-automacao-9");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Acompanhamento de clientes");
await p.getByRole("list", { name: "Clientes do mês" }).getByRole("button", { name: /Ribeiro Odonto/ }).click();
await p.getByRole("dialog", { name: "Cliente Ribeiro Odonto" }).getByRole("form", { name: `Acompanhamento de ${label(month)}` }).waitFor();
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "acompanhamento on the phone: no horizontal scroll");
await shot(p, "f5e2-acompanhamento-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("CLIENT FOLLOW-UP E2E PASSED");
