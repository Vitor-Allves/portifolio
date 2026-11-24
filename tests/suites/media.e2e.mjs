// Fase 7 · entrega 1 in the browser, on base + campaign fixtures and the fake
// Meta Ads: the Gestor links an active client to its Legado Intelligence
// client from the Acompanhamento tab, syncs this month and October, sees the
// numbers with their source and the campaigns, the link in the client's
// history; Marketing sees the numbers without money and can't sync; phone
// and dark theme.
import { BASE, go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

await sql(`INSERT INTO client_access (id, slug, label, account_ids) VALUES ('ca-rib', 'ribeiro', 'Ribeiro Odonto', '{act_111}'), ('ca-sol', 'sol', 'Clínica Sol', '{act_222}')`);
await sql(`UPDATE internal_users SET account_ids = '{act_111,act_222}' WHERE id IN ('u-vitor', 'u-maria')`);
await sql(`INSERT INTO crm_companies (id, name, name_key, owner_id) VALUES ('co-rib', 'Ribeiro Odonto', 'ribeiro odonto', 'u-vitor')`);
const month = await sql(`SELECT to_char(now() AT TIME ZONE 'America/Sao_Paulo', 'YYYY-MM')`);
const MONTHS = ["janeiro", "fevereiro", "março", "abril", "maio", "junho", "julho", "agosto", "setembro", "outubro", "novembro", "dezembro"];
const label = (m) => `${MONTHS[Number(m.slice(5, 7)) - 1]} de ${m.slice(0, 4)}`;
// Intl puts non-breaking spaces in money and numbers; compare with plain spaces.
const norm = (t) => t.replace(/\s+/g, " ");
const brl = (v) => norm(new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(v));
const f = Number(month.slice(5, 7)); // the fake Meta scales its numbers with the month

const browser = await launchBrowser();
const errors = [];
const { page: g, api } = await login(browser, "vitor", { errors });
ok((await api.post(`${BASE}/api/crm/clients/`, { data: { companyId: "co-rib", status: "ativo", startedOn: "2026-09-01" } })).ok(), "client created");

async function openMedia(page) {
  await go(page, "Clientes ativos");
  await page.getByRole("table", { name: "Clientes ativos" }).getByRole("button", { name: "Ribeiro Odonto" }).click();
  const panel = page.getByRole("dialog", { name: "Cliente Ribeiro Odonto" });
  await panel.getByRole("tab", { name: "Acompanhamento" }).click();
  return { panel, media: panel.getByRole("region", { name: "Indicadores de mídia" }) };
}

// ---- link ----
const { panel, media } = await openMedia(g);
await media.getByText("Ainda não ligado a um cliente do Legado Intelligence.").waitFor();
await media.getByRole("button", { name: "Ligar ao Intelligence" }).click();
await media.getByLabel("Cliente no Intelligence").selectOption({ label: "Ribeiro Odonto · 1 conta" });
await media.getByRole("button", { name: "Salvar ligação" }).click();
await media.getByText("Cliente ligado ao Intelligence.").waitFor();
ok(await media.getByText(/Cliente no Intelligence: Ribeiro Odonto · 1 conta de anúncio/).isVisible(), "linked to the Intelligence client");

// ---- sync this month ----
await media.getByText(`Ainda não sincronizado em ${label(month)}.`, { exact: false }).waitFor();
await media.getByRole("button", { name: "Sincronizar" }).click();
const numbers = media.getByRole("list", { name: `Números de ${label(month)}` });
await numbers.waitFor();
const tile = async (name) => (await numbers.getByRole("listitem").filter({ hasText: name }).first().innerText()).replace(/\s+/g, " ");
ok((await tile("Investimento")).includes(brl(150 * f + 0.5)), `this month's investimento: ${await tile("Investimento")}`);
ok((await tile("Impressões")).includes(new Intl.NumberFormat("pt-BR").format(15000 * f)) && (await tile("CTR")).includes("2,00%"), "impressões and CTR");
ok(await media.getByText(/Fonte: Meta Ads \(Legado Intelligence\) · Ribeiro Odonto/).isVisible(), "the source is named, with the Intelligence as the official one");

// ---- October ----
await panel.getByLabel("Mês de referência").selectOption("2026-10");
await media.getByText("Ainda não sincronizado em outubro de 2026.", { exact: false }).waitFor();
await media.getByRole("button", { name: "Sincronizar" }).click();
await media.getByRole("list", { name: "Números de outubro de 2026" }).waitFor();
ok(norm(await media.getByRole("list", { name: "Números de outubro de 2026" }).innerText()).includes(brl(1500.5)), "October: R$ 1.500,50");
await media.getByText("Campanhas (2)").click();
const campaigns = media.getByRole("table", { name: "Campanhas do mês" });
ok((await campaigns.getByRole("row", { name: /Mensagens Odonto/ }).innerText()).includes("Engajamento") && (await campaigns.getByRole("row", { name: /Tráfego site/ }).innerText()).includes("Pausada"), "campaigns with objective and status");
await media.scrollIntoViewIfNeeded();
await shot(g, "f7e1-indicadores-midia");

await panel.getByRole("tab", { name: "Histórico" }).click();
await panel.getByText("Ligado ao Legado Intelligence: Ribeiro Odonto").waitFor();
ok(true, "the link is in the client's history");

// ---- Marketing ----
const { page: m } = await login(browser, "maria", { errors });
const { panel: mp, media: mm } = await openMedia(m);
await mp.getByLabel("Mês de referência").selectOption("2026-10");
const mnum = mm.getByRole("list", { name: "Números de outubro de 2026" });
await mnum.waitFor();
ok((await mnum.getByRole("listitem").filter({ hasText: "Investimento" }).innerText()).includes("—") && (await mm.getByText("Seu perfil não vê o investimento e os custos.").isVisible()), "Marketing: the numbers without money");
ok((await mm.getByRole("button", { name: "Sincronizar" }).count()) === 0 && (await mm.getByRole("button", { name: /Trocar|Ligar/ }).count()) === 0, "…can't sync or change the link");

// ---- phone + dark ----
const { page: p } = await login(browser, "vitor", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
const { panel: pp, media: pm } = await openMedia(p);
await pp.getByLabel("Mês de referência").selectOption("2026-10");
await pm.getByRole("list", { name: "Números de outubro de 2026" }).waitFor();
await pm.getByText("Campanhas (2)").click();
await pm.scrollIntoViewIfNeeded();
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "phone: no horizontal scroll");
await shot(p, "f7e1-midia-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("MEDIA E2E PASSED");
