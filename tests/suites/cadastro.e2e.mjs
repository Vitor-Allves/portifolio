// Evolução v1.0 · cadastros in the browser, on base + campaign fixtures: the
// new-lead form warns about a phone already registered (and opens it), a
// Comercial is stopped from a second negotiation with a company (and may
// create the lead alone) while a Gestor authorizes it; the lead's new fields,
// the diagnóstico comercial (versions) and documentos e anexos on the panel;
// the company's phone and e-mail. Phone width and dark theme too.
import { go, launchBrowser, login, ok, shot, sql } from "../lib/helpers.mjs";

const browser = await launchBrowser();
const errors = [];
// Vitor negotiates with Clínica Sol (through Gabriela).
await sql(`INSERT INTO crm_deals (id, contact_id, title, stage, owner_id) VALUES ('d-sol', 'k1', 'Clínica Sol — tráfego', 'negociacao', 'u-vitor')`);

// ---- Comercial: new lead ----
const { page: j } = await login(browser, "joao", { errors });
const openNew = async (p) => {
  await p.getByRole("button", { name: "Novo contato" }).first().click();
  const d = p.getByRole("dialog", { name: "Novo contato" });
  await d.waitFor();
  return d;
};
let dlg = await openNew(j);
await dlg.getByLabel("Nome *").fill("Ana Repetida");
await dlg.getByLabel("WhatsApp").fill("(15) 99000-0001");
await dlg.getByLabel("E-mail").focus();
const warn = dlg.getByRole("status", { name: "Cadastros parecidos" });
await warn.getByText("Ana Ribeiro").waitFor();
ok(
  (await warn.getByText(/Já existe um contato com esse WhatsApp/).isVisible()) && (await warn.getByText(/responsável Vitor/).isVisible()),
  "the form warns the WhatsApp is Ana's, Vitor's lead",
);
await shot(j, "ev4-duplicidade-aviso");
await warn.getByRole("button", { name: "Abrir cadastro" }).click();
await j.getByRole("dialog", { name: "Contato Ana Ribeiro" }).waitFor();
ok(true, "“Abrir cadastro” opens the existing lead");
await j.getByRole("dialog", { name: "Contato Ana Ribeiro" }).getByRole("button", { name: "Fechar painel" }).click();

dlg = await openNew(j);
await dlg.getByLabel("Nome *").fill("Paulo Sol");
await dlg.getByLabel("WhatsApp").fill("(15) 99125-8001");
await dlg.getByLabel("Empresa").fill("Clínica Sol");
await dlg.getByLabel("Outro telefone").fill("(15) 3222-1000");
await dlg.getByLabel("Potencial comercial").selectOption("alto");
await dlg.getByLabel("Necessidade identificada").fill("Agenda vazia às terças");
await dlg.getByLabel("Cidade").focus();
await dlg
  .getByRole("status", { name: "Cadastros parecidos" })
  .getByText(/Empresa já cadastrada/)
  .waitFor();
ok(true, "…and that the company exists (the lead will be linked to it)");
await dlg.getByRole("button", { name: "Criar contato" }).click();
const alert = dlg.getByRole("alert");
await alert.getByText(/Já existe uma negociação aberta com esta empresa/).waitFor();
ok(
  (await alert.getByRole("button", { name: "Autorizar a segunda negociação e criar" }).count()) === 0,
  "a second negotiation is refused to the Comercial, with no way to authorize it himself",
);
await shot(j, "ev4-negociacao-paralela-comercial");
await alert.getByRole("button", { name: "Criar só o contato, sem oportunidade" }).click();
const paulo = j.getByRole("dialog", { name: "Contato Paulo Sol" });
await paulo.waitFor();
const pauloId = await sql(`SELECT id FROM crm_contacts WHERE name = 'Paulo Sol'`);
ok((await sql(`SELECT count(*) FROM crm_deals WHERE contact_id = '${pauloId}'`)) === "0", "…the lead alone is created");
ok(
  (await sql(`SELECT alt_phone || '|' || potential || '|' || need FROM crm_contacts WHERE id = '${pauloId}'`)) === "(15) 3222-1000|alto|Agenda vazia às terças",
  "with outro telefone, potencial and necessidade",
);

// Diagnóstico comercial (Negócio e tarefas).
await paulo.getByRole("tab", { name: "Negócio e tarefas" }).click();
const diag = paulo.getByRole("region", { name: "Diagnóstico comercial" });
await diag.getByRole("button", { name: "+ Fazer diagnóstico" }).click();
const form = diag.getByRole("form", { name: "Novo diagnóstico" });
await form.getByLabel("Principal necessidade").fill("Encher a agenda das terças");
await form.getByLabel("Orçamento disponível (R$/mês)").fill("2.500");
await form.getByLabel("Urgência da contratação").selectOption("alta");
await form.getByLabel("Concorrentes envolvidos").fill("Agência X");
await shot(j, "ev4-diagnostico-form");
await form.getByRole("button", { name: "Salvar diagnóstico" }).click();
await diag.getByText("versão 1").waitFor();
ok((await diag.getByText(/R\$\s2\.500$/).isVisible()) && (await diag.getByText("Agência X").isVisible()), "diagnosis version 1 shown");
await diag.getByRole("button", { name: "Atualizar diagnóstico" }).click();
ok((await form.getByLabel("Principal necessidade").inputValue()) === "Encher a agenda das terças", "updating starts from the latest version");
await form.getByLabel("Principal necessidade").fill("Encher a agenda das terças e quintas");
await form.getByRole("button", { name: "Salvar versão 2" }).click();
await diag.getByText("versão 2").waitFor();
await diag.getByText("Versões anteriores (1)").click();
await diag.getByRole("listitem", { name: "Diagnóstico versão 1" }).getByText("Encher a agenda das terças", { exact: true }).waitFor();
ok(true, "version 2 saved; version 1 kept and readable");
await shot(j, "ev4-diagnostico-versoes");

// Documentos e anexos (Detalhes e histórico).
await paulo.getByRole("tab", { name: "Detalhes e histórico" }).click();
ok(
  (await paulo.getByLabel("Potencial comercial").inputValue()) === "alto" &&
    (await paulo.getByLabel("Necessidade identificada").inputValue()) === "Agenda vazia às terças",
  "the panel shows the new fields",
);
const docs = paulo.getByRole("region", { name: "Documentos e anexos" });
await docs
  .getByLabel("Anexar arquivo — Documentos e anexos")
  .setInputFiles({ name: "Briefing Paulo.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4\n%%EOF\n") });
await docs.getByRole("link", { name: "Briefing Paulo.pdf" }).waitFor();
await docs
  .getByLabel("Anexar arquivo — Documentos e anexos")
  .setInputFiles({ name: "falso.pdf", mimeType: "application/pdf", buffer: Buffer.from("não é pdf") });
await docs.getByText(/não confere com a extensão/).waitFor();
ok(true, "a PDF attached; a fake one refused with the reason");
await shot(j, "ev4-documentos");
await paulo.getByText("Documento anexado: Briefing Paulo.pdf").first().waitFor();
ok(true, "the history records the attachment");
await docs.getByRole("button", { name: "Arquivar Briefing Paulo.pdf" }).click();
await docs.getByText("Nenhum documento ainda.", { exact: false }).waitFor();
ok(true, "archived");
await paulo.getByRole("button", { name: "Fechar painel" }).click();

// ---- Gestor: authorizes the second negotiation ----
const { page: g } = await login(browser, "vitor", { errors });
dlg = await openNew(g);
await dlg.getByLabel("Nome *").fill("Rita Sol");
await dlg.getByLabel("WhatsApp").fill("(15) 99125-8002");
await dlg.getByLabel("Empresa").fill("Clínica Sol");
await dlg.getByLabel("Responsável").selectOption({ label: "João" });
await dlg.getByRole("button", { name: "Criar contato" }).click();
await dlg.getByRole("alert").getByRole("button", { name: "Autorizar a segunda negociação e criar" }).click();
await g.getByRole("dialog", { name: "Contato Rita Sol" }).waitFor();
const rita = await sql(`SELECT id FROM crm_contacts WHERE name = 'Rita Sol'`);
ok(
  (await sql(`SELECT payload->>'authorizedBy' FROM crm_events WHERE contact_id = '${rita}' AND kind = 'deal'`)) === "Vitor",
  "the Gestor authorizes the second negotiation; recorded",
);
const ritaPanel = g.getByRole("dialog", { name: "Contato Rita Sol" });
await ritaPanel.getByRole("tab", { name: "Detalhes e histórico" }).click();
await ritaPanel.getByText(/segunda negociação \(além de ".+"\) autorizada por Vitor/).waitFor();
ok(true, "the history says so");
await shot(g, "ev4-negociacao-paralela-historico");
await ritaPanel.getByRole("button", { name: "Fechar painel" }).click();

// ---- Company: phone and e-mail ----
await go(g, "Empresas");
await g.getByRole("row", { name: /Clínica Sol/ }).click();
const coPanel = g.getByRole("dialog", { name: "Empresa Clínica Sol" });
await coPanel.getByLabel("Telefone da empresa").fill("(15) 3333-4444");
await coPanel.getByLabel("E-mail da empresa").fill("contato@clinicasol.com.br");
await coPanel.getByRole("button", { name: "Salvar empresa" }).click();
for (let i = 0; i < 50 && (await sql(`SELECT coalesce(phone, '') FROM crm_companies WHERE id = 'co-sol'`)) === ""; i++) await g.waitForTimeout(200);
ok(
  (await sql(`SELECT phone || '|' || email FROM crm_companies WHERE id = 'co-sol'`)) === "(15) 3333-4444|contato@clinicasol.com.br",
  "company phone and e-mail saved",
);
await shot(g, "ev4-empresa");

// ---- phone + dark ----
const { page: m } = await login(browser, "joao", { errors, width: 390, height: 844, dark: true });
await m.getByRole("button", { name: "Novo contato" }).first().click();
const md = m.getByRole("dialog", { name: "Novo contato" });
await md.getByLabel("WhatsApp").fill("15990000002");
await md.getByLabel("Nome *").focus();
await md.getByRole("status", { name: "Cadastros parecidos" }).getByText("Bruno Souza").waitFor();
ok((await m.evaluate(() => document.documentElement.scrollWidth)) <= 390, "no horizontal scroll on the phone");
await shot(m, "ev4-duplicidade-celular-escuro");

ok(errors.length === 0, `no page errors (${errors.join(" | ")})`);
await browser.close();
console.log("CADASTRO E2E PASSED");
process.exit(0);
