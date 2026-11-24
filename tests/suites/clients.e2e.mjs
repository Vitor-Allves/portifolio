// Fase 5 · entrega 1 in the browser, on base + campaign fixtures: Clientes
// ativos. A won opportunity becomes a client from the suggestions, its
// contract comes from the opportunity, a second contract with an end date,
// situation and history in the client panel, the renewal filter, company ↔
// client ↔ contact links, Marketing without values, a Comercial seeing only
// theirs, phone and dark theme.
import { go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const day = (offset) => sql(`SELECT ((now() AT TIME ZONE 'America/Sao_Paulo')::date + $1::int)::text`, [offset]);
await sql(`INSERT INTO crm_options (kind, id, label, sort) VALUES ('service', 'trafego', 'Gestão de tráfego', 1), ('service', 'social', 'Social media', 2)`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id, segment, city) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor', 'Odontologia', 'Sorocaba')`);
await sql(`UPDATE crm_contacts SET company_id = 'co-rib', is_decision_maker = true WHERE id = 'c1'`);
await sql(`UPDATE crm_deals SET title = 'Tráfego Ribeiro', closed_at = now() - interval '5 days', service = 'trafego', negotiated_cents = 450000 WHERE id = 'd1'`);

const { page: g } = await login(browser, "vitor", { errors });
await go(g, "Clientes ativos");
await g.getByRole("heading", { level: 1, name: "Clientes ativos" }).waitFor();
await g.getByText("Nenhum cliente ativo ainda").waitFor();
const ready = g.getByRole("region", { name: "Prontos para virar cliente" });
await ready.getByText("Ganhou “Tráfego Ribeiro”", { exact: false }).waitFor();
ok(true, "the won opportunity is listed as ready to become a client");
await ready.getByRole("listitem").filter({ hasText: "Ribeiro Odonto" }).getByRole("button", { name: "Tornar cliente" }).click();

// ---- the client panel ----
const panel = g.getByRole("dialog", { name: "Cliente Ribeiro Odonto" });
await panel.waitFor();
const contracts = panel.getByRole("region", { name: "Contratos" });
await contracts.getByText("Gestão de tráfego").waitFor();
ok(await contracts.getByText(/R\$\s?4\.500\/mês · da oportunidade “Tráfego Ribeiro”/).isVisible(), "first contract: service and negotiated value from the opportunity");
ok(await panel.getByText("Onboarding", { exact: true }).first().isVisible(), "starts in Onboarding");
ok(await panel.getByRole("region", { name: "Decisores" }).getByRole("button", { name: "Ana Ribeiro" }).isVisible(), "decision makers listed");

await contracts.getByRole("button", { name: "+ Novo contrato" }).click();
const form = panel.getByRole("form", { name: "Novo contrato" });
await form.getByLabel("Social media").check();
await form.getByLabel("Início do contrato").fill(await day(-10));
await form.getByLabel("Fim do contrato").fill(await day(20));
await form.getByLabel("Valor do contrato").fill("1.500");
await form.getByRole("button", { name: "Registrar contrato" }).click();
await form.waitFor({ state: "detached" });
await contracts.getByText("Vence em 20 dias").waitFor();
ok(true, "second contract: ends in 20 days");

await panel.getByLabel("Situação do cliente").selectOption("ativo");
await panel.getByRole("button", { name: "Salvar cliente" }).click();
await panel.getByText("Salvo", { exact: true }).waitFor();
const history = panel.getByRole("region", { name: "Histórico do cliente" });
await history.getByText("Situação: Onboarding → Ativo").waitFor();
await history.getByLabel("Registrar no histórico").fill("Kickoff feito com a Ana");
await history.getByRole("button", { name: "Registrar no histórico" }).click();
await history.getByText("Kickoff feito com a Ana").waitFor();
ok(await history.getByText(/Virou cliente pela oportunidade ganha “Tráfego Ribeiro”/).isVisible(), "history: from the opportunity, situation, note");
await shot(g, "f5e1-painel-cliente");

// ---- company ↔ client ↔ contact ----
await panel.getByRole("button", { name: "Abrir empresa" }).click();
const company = g.getByRole("dialog", { name: "Empresa Ribeiro Odonto" });
await company.getByRole("region", { name: "Cliente ativo" }).getByRole("button", { name: "Abrir cliente" }).click();
await panel.waitFor();
await panel.getByRole("region", { name: "Decisores" }).getByRole("button", { name: "Ana Ribeiro" }).click();
const ana = g.getByRole("dialog", { name: "Contato Ana Ribeiro" });
await ana.getByRole("tab", { name: "Negócio e tarefas" }).click();
await ana.getByRole("button", { name: /Tráfego Ribeiro/ }).click();
await ana.getByRole("region", { name: "Cliente ativo" }).getByRole("button", { name: "Ver cliente" }).click();
await panel.waitFor();
ok(true, "company, client and the won opportunity link to each other");
await panel.getByRole("button", { name: "Fechar painel" }).click();

// ---- the list ----
const table = g.getByRole("table", { name: "Clientes ativos" });
const row = table.getByRole("row", { name: /Ribeiro Odonto/ });
await row.waitFor();
ok(await row.getByText(/R\$\s?6\.000/).isVisible() && (await row.getByText("Vence em 20 dias").isVisible()), "list: monthly value and the next contract end");
await g.getByLabel("Vencimento do contrato").selectOption("vencido");
await g.getByText("Nenhum cliente encontrado").waitFor();
await g.getByLabel("Vencimento do contrato").selectOption("30");
await row.waitFor();
ok(true, "renewal filter");
await shot(g, "f5e1-lista-clientes");

// ---- Marketing: no values, no editing ----
const { page: m } = await login(browser, "maria", { errors });
await go(m, "Clientes ativos");
const mrow = m.getByRole("table", { name: "Clientes ativos" }).getByRole("row", { name: /Ribeiro Odonto/ });
await mrow.waitFor();
ok((await m.getByRole("button", { name: "+ Novo cliente" }).count()) === 0 && (await m.getByRole("columnheader", { name: "Valor mensal" }).count()) === 0, "Marketing: no new client, no value column");
await mrow.click();
const mp = m.getByRole("dialog", { name: "Cliente Ribeiro Odonto" });
await mp.getByText("Seu perfil não vê os valores dos contratos.").waitFor();
ok((await mp.getByText(/R\$/).count()) === 0 && (await mp.getByLabel("Situação do cliente").isDisabled()), "…contracts without values, read-only");

// ---- Comercial: only theirs ----
const { page: j } = await login(browser, "joao", { errors });
await go(j, "Clientes ativos");
await j.getByText("Nenhum cliente ativo ainda").waitFor();
ok(true, "João doesn't see Vitor's client");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await go(p, "Clientes ativos");
await p.getByRole("table", { name: "Clientes ativos" }).getByRole("row", { name: /Ribeiro Odonto/ }).waitFor();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "list: no horizontal scroll on the phone");
await p.getByRole("table", { name: "Clientes ativos" }).getByRole("button", { name: "Ribeiro Odonto" }).click();
const pp = p.getByRole("dialog", { name: "Cliente Ribeiro Odonto" });
await pp.getByRole("region", { name: "Contratos" }).getByRole("button", { name: "+ Novo contrato" }).click();
await p.waitForTimeout(300);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "client panel with the contract form: no horizontal scroll");
await shot(p, "f5e1-cliente-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("CLIENTS E2E PASSED");
