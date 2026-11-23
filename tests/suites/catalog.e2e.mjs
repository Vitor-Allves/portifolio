// Personalização, etiquetas e menu agrupado (Fase 1 · entrega 1) in the
// browser, on base + campaign fixtures.
import { go, launchBrowser, login, ok, shot } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
const nav = (p) => p.getByRole("navigation", { name: "Seções do CRM" });

// ---- Administrador: grouped menu + Personalização ----
const { page: a } = await login(browser, "admin", { errors });
for (const g of ["Visão geral", "Comercial", "Operação", "Administração"]) ok(await nav(a).getByRole("group", { name: g }).isVisible(), `menu group ${g}`);
ok((await nav(a).getByRole("group", { name: "Comercial" }).getByRole("button").count()) === 5, "Comercial has 5 sections");
await go(a, "Personalização");
await a.getByRole("heading", { level: 1, name: "Personalização" }).waitFor();
const origens = a.getByRole("list", { name: "Origens" });
await origens.getByText("Tráfego pago", { exact: true }).waitFor();
await a.getByLabel("Novo origem").fill("Google Meu Negócio");
await a.getByRole("button", { name: "Adicionar" }).click();
await origens.getByText("Google Meu Negócio", { exact: true }).waitFor();
ok(true, "origem added");
await a.getByRole("button", { name: "Arquivar Evento" }).click();
await a.getByText('"Evento" arquivada.').waitFor();
await origens.getByRole("button", { name: "Arquivar Evento" }).waitFor({ state: "detached" });
ok((await origens.getByText("Evento", { exact: true }).count()) === 0, "archived origem leaves the list");
await a.getByRole("button", { name: /Ver arquivadas/ }).click();
ok(await a.getByRole("button", { name: "Reativar Evento" }).isVisible(), "…and shows under Arquivadas, with Reativar");
ok((await a.getByRole("button", { name: "Arquivar Outro" }).count()) === 0, "fallback 'Outro' has no archive button");
await a.getByRole("button", { name: "Subir Google Meu Negócio" }).click();
await a.waitForTimeout(600);
await a.getByRole("tab", { name: "Segmentos" }).click();
await a.getByLabel("Novo segmento").fill("Odontologia");
await a.getByRole("button", { name: "Adicionar" }).click();
await a.getByRole("list", { name: "Segmentos" }).getByText("Odontologia", { exact: true }).waitFor();
await a.getByRole("tab", { name: "Etiquetas" }).click();
await a.getByLabel("Nome da nova etiqueta").fill("Cliente VIP");
await a.getByLabel("Categoria da nova etiqueta").selectOption("classificacao");
await a.getByLabel("Cor da nova etiqueta").selectOption("verde");
await a.getByRole("button", { name: "Criar etiqueta" }).click();
await a.getByRole("list", { name: "Etiquetas de Classificação" }).getByText("Cliente VIP").waitFor();
ok(true, "tag created");
await shot(a, "f1-personalizacao");

// ---- Gestor: no Personalização; new options in the forms; tags on a contact ----
const { page: g } = await login(browser, "vitor", { errors });
ok((await nav(g).getByRole("button", { name: /^Personalização/ }).count()) === 0, "Gestor has no Personalização");
ok(await nav(g).getByRole("button", { name: /^Usuários e permissões/ }).count() === 0, "…nor Usuários e permissões");
await g.getByRole("button", { name: "Novo contato" }).click();
const dialog = g.getByRole("dialog");
const origemOptions = await dialog.locator("select").filter({ has: g.locator("option", { hasText: "Tráfego pago" }) }).first().locator("option").allTextContents();
ok(origemOptions.at(-2) === "Google Meu Negócio" && origemOptions.at(-1) === "Outro" && !origemOptions.includes("Evento"), `new origem moved up one place (before Outro), archived one gone (${origemOptions.join(", ")})`);
await g.keyboard.press("Escape");
await go(g, "Contatos");
await g.getByRole("button", { name: "Ana Ribeiro" }).first().click();
const panel = g.getByRole("dialog", { name: "Contato Ana Ribeiro" });
await panel.getByRole("tab", { name: "Detalhes" }).click();
await panel.getByLabel("Adicionar etiqueta").selectOption({ label: "Cliente VIP" });
await panel.getByRole("button", { name: "Remover etiqueta Cliente VIP" }).waitFor();
ok(true, "tag added from the panel");
await panel.getByLabel("Adicionar etiqueta").selectOption({ label: "BNI" });
await panel.getByRole("button", { name: "Remover etiqueta BNI" }).waitFor();
await panel.getByLabel("Segmento").selectOption("Odontologia");
await panel.getByRole("button", { name: "Salvar dados" }).click();
await g.waitForTimeout(800);
await panel.getByText("Etiqueta adicionada: Cliente VIP").waitFor();
ok(true, "tag in the history");
await shot(g, "f1-contato-etiquetas");
await panel.getByRole("button", { name: "Fechar painel" }).click();
await g.getByLabel("Etiqueta").selectOption({ label: "Cliente VIP" });
await g.waitForTimeout(800);
const rows = g.locator("table tbody tr");
ok((await rows.count()) === 1 && (await rows.first().getByText("Cliente VIP").isVisible()), "contacts filtered by tag, chip in the row");
await go(g, "Funil de vendas");
await g.locator("[aria-label^='Abrir ']").filter({ hasText: "Ana Ribeiro" }).first().getByText("Cliente VIP").waitFor();
ok(true, "tag on the funnel card");

// ---- phone + dark ----
const { page: p } = await login(browser, "admin", { width: 390, height: 844, dark: true, errors });
await p.getByRole("button", { name: "Abrir menu" }).click();
await shot(p, "f1-menu-celular");
await go(p, "Personalização");
await p.getByRole("heading", { level: 1, name: "Personalização" }).waitFor();
await p.waitForTimeout(500);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "Personalização: no horizontal scroll on the phone");
await p.getByRole("tab", { name: "Etiquetas" }).click();
await p.waitForTimeout(400);
ok((await p.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)) <= 0, "Etiquetas: no horizontal scroll on the phone");
await shot(p, "f1-etiquetas-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("CATALOG E2E PASSED");
