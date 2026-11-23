// Fake Meta Graph API for the tests: nothing ever reaches WhatsApp.
// Logs each send to $FAKE_GRAPH_DIR/sent.jsonl. A phone ending in 99 gets a
// permanent error; the file $FAKE_GRAPH_DIR/ratelimit makes every send fail
// with Meta's spam rate-limit code.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const DIR = process.env.FAKE_GRAPH_DIR ?? "/tmp/crm-fake-graph";
const PORT = Number(process.env.FAKE_GRAPH_PORT ?? 3199);
fs.mkdirSync(DIR, { recursive: true });
let n = 0;

const TEMPLATES = [
  {
    name: "promo_novembro",
    language: "pt_BR",
    status: "APPROVED",
    category: "MARKETING",
    components: [{ type: "BODY", text: "Olá {{1}}! A {{2}} tem uma condição especial em novembro. Responda SIM para saber mais ou SAIR para não receber." }],
  },
  { name: "boas_vindas", language: "pt_BR", status: "APPROVED", category: "UTILITY", components: [{ type: "BODY", text: "Oi! Obrigado pelo contato." }] },
  { name: "pendente", language: "pt_BR", status: "PENDING", category: "MARKETING", components: [] },
];

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = (code, obj) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method === "GET" && req.url.includes("message_templates")) return json(200, { data: TEMPLATES });
      if (req.method === "POST" && req.url.endsWith("/messages")) {
        const b = JSON.parse(body || "{}");
        const entry = {
          to: b.to,
          type: b.type,
          template: b.template?.name,
          params: b.template?.components?.[0]?.parameters?.map((p) => p.text) ?? [],
          text: b.text?.body,
        };
        fs.appendFileSync(path.join(DIR, "sent.jsonl"), JSON.stringify(entry) + "\n");
        if (fs.existsSync(path.join(DIR, "ratelimit"))) return json(400, { error: { message: "spam rate limit hit", code: 131048 } });
        if (String(b.to).endsWith("99")) {
          return json(400, { error: { message: "Recipient phone number not on WhatsApp", code: 131026, error_data: { details: "Número sem WhatsApp" } } });
        }
        return json(200, { messages: [{ id: `wamid.fake.${Date.now()}.${++n}` }] });
      }
      json(404, { error: { message: "not found" } });
    });
  })
  .listen(PORT, () => console.log(`fake graph on ${PORT}`));
