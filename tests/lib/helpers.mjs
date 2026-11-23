// Shared helpers for the CRM test suites (see tests/README.md).
import { createHmac } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { chromium } from "playwright";

export const BASE = process.env.CRM_TEST_BASE ?? "http://localhost:3100";
export const FAKE_GRAPH_DIR = process.env.FAKE_GRAPH_DIR ?? "/tmp/crm-fake-graph";
export const WEBHOOK_SECRET = "local-app-secret";
export const PASSWORD = "crm-teste-123";

export function ok(cond, msg) {
  if (!cond) throw new Error("ASSERT: " + msg);
  console.log("ok -", msg);
}

export function launchBrowser() {
  // PW_CHROMIUM_PATH: use a Chromium already on the machine instead of Playwright's download.
  return chromium.launch(process.env.PW_CHROMIUM_PATH ? { executablePath: process.env.PW_CHROMIUM_PATH } : {});
}

/** Logs in and opens /crm/. Returns the page (or null with open:false) and its API request context. */
export async function login(browser, username, { width = 1440, height = 900, dark = false, open = true, errors = [] } = {}) {
  const ctx = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: process.env.CRM_TEST_SHOTS ? 2 : 1,
    colorScheme: dark ? "dark" : "light",
    timezoneId: "America/Sao_Paulo",
  });
  // The dev server's overlay can cover the sidebar.
  await ctx.addInitScript(() => {
    document.addEventListener("DOMContentLoaded", () => {
      const st = document.createElement("style");
      st.textContent = "nextjs-portal { display: none !important; }";
      document.head.appendChild(st);
    });
  });
  const res = await ctx.request.post(`${BASE}/api/analise/login/`, { data: { username, password: PASSWORD } });
  ok(res.ok(), `login ${username}`);
  if (!open) return { ctx, page: null, api: ctx.request };
  const page = await ctx.newPage();
  page.setDefaultTimeout(60_000);
  page.on("pageerror", (e) => errors.push(`${username}: ${e.message}`));
  page.on("console", (m) => m.type() === "error" && !/400|403|404|409|502|503/.test(m.text()) && errors.push(`${username}: ${m.text()}`));
  await page.goto(`${BASE}/crm/`);
  await page.getByRole("heading", { level: 1, name: "Painel" }).waitFor();
  return { ctx, page, api: ctx.request };
}

/** Clicks a section in the CRM sidebar. */
export function go(page, label) {
  return page.getByRole("navigation", { name: "Seções do CRM" }).getByRole("button", { name: new RegExp(`^${label}`) }).click();
}

/** Full-page screenshot, only when CRM_TEST_SHOTS points at a folder. */
export async function shot(page, name) {
  const dir = process.env.CRM_TEST_SHOTS;
  if (!dir) return;
  fs.mkdirSync(dir, { recursive: true });
  await page.screenshot({ path: path.join(dir, `${name}.png`), fullPage: true });
}

let pool = null;
/** One query against the test database; returns the first column of the first row as text, like psql -tA ("" when none). */
export async function sql(q, params = []) {
  pool ??= new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  const { rows } = await pool.query(q, params);
  const first = rows[0];
  if (!first) return "";
  const v = Object.values(first)[0];
  // Same text psql prints: booleans as t/f.
  return typeof v === "boolean" ? (v ? "t" : "f") : String(v ?? "");
}
export async function closeDb() {
  await pool?.end();
  pool = null;
}

/** POSTs a WhatsApp webhook payload, signed like Meta does. Returns the HTTP status. */
export async function webhook(value, { signed = true } = {}) {
  const body = JSON.stringify({
    object: "whatsapp_business_account",
    entry: [{ id: "w", changes: [{ field: "messages", value: { messaging_product: "whatsapp", metadata: { phone_number_id: "000000" }, ...value } }] }],
  });
  const headers = { "Content-Type": "application/json" };
  if (signed) headers["X-Hub-Signature-256"] = "sha256=" + createHmac("sha256", WEBHOOK_SECRET).update(body).digest("hex");
  return (await fetch(`${BASE}/api/whatsapp/webhook/`, { method: "POST", headers, body })).status;
}

let inboundSeq = 0;
/** A text message from `from` arriving through the webhook. */
export function inbound(from, text, profileName = "x") {
  return webhook({
    contacts: [{ wa_id: from, profile: { name: profileName } }],
    messages: [{ from, id: `wamid.in.${Date.now()}.${++inboundSeq}`, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
  });
}

/** Every message the fake Meta API received, oldest first. */
export function fakeGraphSent() {
  const file = path.join(FAKE_GRAPH_DIR, "sent.jsonl");
  if (!fs.existsSync(file)) return [];
  return fs.readFileSync(file, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
}

/** Makes the fake Meta API answer every send with a rate-limit error (on) or normally (off). */
export function fakeGraphRateLimit(on) {
  const file = path.join(FAKE_GRAPH_DIR, "ratelimit");
  if (on) fs.writeFileSync(file, "1");
  else fs.rmSync(file, { force: true });
}
