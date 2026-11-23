// Server-only client for the WhatsApp Business Platform (Cloud API). Never
// import this from a "use client" component — it reads WHATSAPP_ACCESS_TOKEN
// and WHATSAPP_APP_SECRET, which must never reach the browser.
//
// Same "one long-lived credential, no login flow inside the app" model as
// the Meta Ads integration: a System User token from the Business Manager.
//
// Setup guide: docs/whatsapp-crm-setup.md

import { createHmac, timingSafeEqual } from "crypto";
import type { CrmAdReferral, CrmTemplate } from "./crm-types";

// Overridable without a code change — Meta retires each Graph API version
// about two years after release.
const DEFAULT_GRAPH_VERSION = "v23.0";

export class WhatsAppApiError extends Error {
  /** Graph error code when Meta answered with one (e.g. 131048 = spam rate limit). */
  code: number | null;
  constructor(message: string, code: number | null = null) {
    super(message);
    this.name = "WhatsAppApiError";
    this.code = code;
  }
}

// Meta throttling the number: stop and retry later instead of burning the rest of the list.
const RATE_LIMIT_CODES = new Set([4, 80007, 130429, 131048, 131056]);

export function isRateLimited(err: unknown): boolean {
  return err instanceof WhatsAppApiError && err.code !== null && RATE_LIMIT_CODES.has(err.code);
}

export class WhatsAppConfigError extends WhatsAppApiError {
  constructor(missing: string[]) {
    super(`Missing required env var(s): ${missing.join(", ")}`);
    this.name = "WhatsAppConfigError";
  }
}

const REQUIRED_VARS = ["WHATSAPP_ACCESS_TOKEN", "WHATSAPP_PHONE_NUMBER_ID"] as const;

export function isWhatsAppConfigured(): boolean {
  return REQUIRED_VARS.every((name) => Boolean(process.env[name]));
}

function getConfig() {
  const missing = REQUIRED_VARS.filter((name) => !process.env[name]);
  if (missing.length > 0) throw new WhatsAppConfigError(missing);
  return {
    token: process.env.WHATSAPP_ACCESS_TOKEN!,
    phoneNumberId: process.env.WHATSAPP_PHONE_NUMBER_ID!,
    businessAccountId: process.env.WHATSAPP_BUSINESS_ACCOUNT_ID || null,
    version: process.env.WHATSAPP_GRAPH_VERSION || DEFAULT_GRAPH_VERSION,
    // Automated tests only (tests/run.sh): points at a fake Graph server.
    // Ignored on Vercel, so the token can never be sent anywhere but Meta.
    baseUrl: (!process.env.VERCEL && process.env.WHATSAPP_GRAPH_BASE_URL) || "https://graph.facebook.com",
  };
}

const META_TIMEOUT_MS = 20_000;

/** fetch() to Meta with a timeout; a network failure (DNS, reset, timeout) becomes a WhatsAppApiError so the route answers 502 with a readable reason instead of a bare 500. */
async function reachMeta(url: string, init: RequestInit): Promise<Response> {
  try {
    return await fetch(url, { ...init, signal: AbortSignal.timeout(META_TIMEOUT_MS) });
  } catch (err) {
    const timedOut = err instanceof Error && (err.name === "TimeoutError" || err.name === "AbortError");
    throw new WhatsAppApiError(
      timedOut ? "O WhatsApp demorou demais para responder. Tente de novo em instantes." : "Não foi possível falar com o WhatsApp agora. Tente de novo em instantes."
    );
  }
}

type GraphErrorBody = { error?: { message?: string; code?: number; error_data?: { details?: string } } };

async function graph<T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> {
  const config = getConfig();
  const res = await reachMeta(`${config.baseUrl}/${config.version}/${path}`, {
    method: init.method ?? "GET",
    headers: {
      Authorization: `Bearer ${config.token}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: "no-store",
  });
  const body = (await res.json().catch(() => null)) as (T & GraphErrorBody) | null;
  if (!res.ok || !body) {
    const err = body?.error;
    // error_data.details carries the actionable part, e.g. "Message failed
    // to send because more than 24 hours have passed since the customer
    // last replied to this number."
    throw new WhatsAppApiError(`WhatsApp ${res.status}: ${err?.error_data?.details ?? err?.message ?? "erro desconhecido"}`, err?.code ?? null);
  }
  return body;
}

type SendResponse = { messages?: { id?: string }[] };

function sentId(res: SendResponse): string {
  const id = res.messages?.[0]?.id;
  if (!id) throw new WhatsAppApiError("WhatsApp não devolveu o id da mensagem enviada.");
  return id;
}

export async function sendText(to: string, body: string): Promise<string> {
  const { phoneNumberId } = getConfig();
  const res = await graph<SendResponse>(`${phoneNumberId}/messages`, {
    method: "POST",
    body: { messaging_product: "whatsapp", recipient_type: "individual", to, type: "text", text: { preview_url: false, body } },
  });
  return sentId(res);
}

export async function sendTemplate(to: string, name: string, language: string, bodyParams: string[]): Promise<string> {
  const { phoneNumberId } = getConfig();
  const res = await graph<SendResponse>(`${phoneNumberId}/messages`, {
    method: "POST",
    body: {
      messaging_product: "whatsapp",
      recipient_type: "individual",
      to,
      type: "template",
      template: {
        name,
        language: { code: language },
        ...(bodyParams.length > 0
          ? { components: [{ type: "body", parameters: bodyParams.map((text) => ({ type: "text", text })) }] }
          : {}),
      },
    },
  });
  return sentId(res);
}

type TemplateNode = {
  name?: string;
  language?: string;
  status?: string;
  category?: string;
  components?: { type?: string; text?: string }[];
};

/** Approved templates only — a pending or rejected one can't be sent anyway. Empty when the business account id isn't configured. */
export async function listApprovedTemplates(): Promise<CrmTemplate[]> {
  const { businessAccountId } = getConfig();
  if (!businessAccountId) return [];
  const res = await graph<{ data?: TemplateNode[] }>(
    `${businessAccountId}/message_templates?fields=name,language,status,category,components&limit=200`
  );
  return (res.data ?? [])
    .filter((t) => t.status === "APPROVED" && t.name && t.language)
    .map((t) => {
      const bodyText = t.components?.find((c) => c.type === "BODY")?.text ?? null;
      const placeholders = new Set(bodyText?.match(/\{\{\d+\}\}/g) ?? []);
      return { name: t.name!, language: t.language!, category: t.category ?? "", bodyText, bodyParamCount: placeholders.size };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Downloads an inbound image/audio/document. WhatsApp's media URL needs the same bearer token, so the browser can never fetch it directly — the CRM proxies it. */
export async function fetchMedia(mediaId: string): Promise<{ body: ArrayBuffer; mime: string }> {
  const { token } = getConfig();
  const meta = await graph<{ url?: string; mime_type?: string }>(mediaId);
  if (!meta.url) throw new WhatsAppApiError("Mídia não encontrada no WhatsApp.");
  const res = await reachMeta(meta.url, { headers: { Authorization: `Bearer ${token}` }, cache: "no-store" });
  if (!res.ok) throw new WhatsAppApiError(`Falha ao baixar a mídia do WhatsApp (${res.status}).`);
  return { body: await res.arrayBuffer(), mime: meta.mime_type ?? res.headers.get("content-type") ?? "application/octet-stream" };
}

/**
 * Meta signs every webhook POST with the app secret (X-Hub-Signature-256:
 * "sha256=<hex hmac of the raw body>"). Without the secret configured every
 * delivery is rejected — an unsigned endpoint would let anyone inject fake
 * conversations into the CRM.
 */
export function verifyWebhookSignature(rawBody: string, signatureHeader: string | null): boolean {
  const secret = process.env.WHATSAPP_APP_SECRET;
  if (!secret || !signatureHeader?.startsWith("sha256=")) return false;
  const expected = Buffer.from(createHmac("sha256", secret).update(rawBody).digest("hex"));
  const received = Buffer.from(signatureHeader.slice("sha256=".length));
  return expected.length === received.length && timingSafeEqual(expected, received);
}

export type InboundMessage = {
  waMessageId: string;
  from: string;
  profileName: string | null;
  timestamp: Date;
  type: string;
  body: string | null;
  mediaId: string | null;
  mediaMime: string | null;
  referral: CrmAdReferral | null;
};

export type StatusUpdate = { waMessageId: string; status: string; error: string | null };

type WebhookMessage = {
  id?: string;
  from?: string;
  timestamp?: string;
  type?: string;
  text?: { body?: string };
  image?: { id?: string; mime_type?: string; caption?: string };
  audio?: { id?: string; mime_type?: string };
  video?: { id?: string; mime_type?: string; caption?: string };
  document?: { id?: string; mime_type?: string; caption?: string; filename?: string };
  sticker?: { id?: string; mime_type?: string };
  button?: { text?: string };
  interactive?: { button_reply?: { title?: string }; list_reply?: { title?: string } };
  location?: { latitude?: number; longitude?: number; name?: string };
  referral?: { source_url?: string; source_id?: string; source_type?: string; headline?: string; body?: string; ctwa_clid?: string };
};

type WebhookPayload = {
  entry?: {
    changes?: {
      field?: string;
      value?: {
        contacts?: { wa_id?: string; profile?: { name?: string } }[];
        messages?: WebhookMessage[];
        statuses?: { id?: string; status?: string; errors?: { title?: string; message?: string; error_data?: { details?: string } }[] }[];
      };
    }[];
  }[];
};

function messageContent(m: WebhookMessage): { body: string | null; mediaId: string | null; mediaMime: string | null } {
  const media = m.image ?? m.audio ?? m.video ?? m.document ?? m.sticker;
  const caption = m.image?.caption ?? m.video?.caption ?? m.document?.caption ?? m.document?.filename ?? null;
  const body =
    m.text?.body ??
    m.button?.text ??
    m.interactive?.button_reply?.title ??
    m.interactive?.list_reply?.title ??
    (m.location ? `Localização: ${m.location.name ?? `${m.location.latitude}, ${m.location.longitude}`}` : null) ??
    caption;
  return { body, mediaId: media?.id ?? null, mediaMime: media?.mime_type ?? null };
}

export function parseWebhook(payload: unknown): { messages: InboundMessage[]; statuses: StatusUpdate[] } {
  const messages: InboundMessage[] = [];
  const statuses: StatusUpdate[] = [];
  for (const entry of (payload as WebhookPayload)?.entry ?? []) {
    for (const change of entry.changes ?? []) {
      const value = change.value;
      if (!value) continue;
      const names = new Map((value.contacts ?? []).map((c) => [c.wa_id ?? "", c.profile?.name ?? null]));
      for (const m of value.messages ?? []) {
        if (!m.id || !m.from) continue;
        const r = m.referral;
        messages.push({
          waMessageId: m.id,
          from: m.from,
          profileName: names.get(m.from) ?? null,
          timestamp: m.timestamp ? new Date(Number(m.timestamp) * 1000) : new Date(),
          type: m.type ?? "other",
          ...messageContent(m),
          referral: r
            ? {
                sourceId: r.source_id ?? null,
                sourceType: r.source_type ?? null,
                sourceUrl: r.source_url ?? null,
                headline: r.headline ?? null,
                body: r.body ?? null,
                ctwaClid: r.ctwa_clid ?? null,
              }
            : null,
        });
      }
      for (const s of value.statuses ?? []) {
        if (!s.id || !s.status) continue;
        const e = s.errors?.[0];
        statuses.push({ waMessageId: s.id, status: s.status, error: e ? e.error_data?.details ?? e.message ?? e.title ?? "erro" : null });
      }
    }
  }
  return { messages, statuses };
}
