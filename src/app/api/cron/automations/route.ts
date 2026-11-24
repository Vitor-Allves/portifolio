import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { runScheduled } from "@/lib/crm-automations";

export const runtime = "nodejs";

/**
 * The daily check of the time automations (Fase 3), called by the server's
 * scheduler — not by people, so there's no session: it needs the
 * Authorization header "Bearer <CRON_SECRET>" (Vercel Cron sends it when the
 * project has that environment variable). Without CRON_SECRET it stays off.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Verificação diária não configurada." }, { status: 503 });
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  try {
    return NextResponse.json({ results: await runScheduled() }, { headers: { "Cache-Control": "no-store" } });
  } catch (err) {
    console.error("[cron/automations] failed", err);
    return NextResponse.json({ error: "Falha na verificação diária." }, { status: 500 });
  }
}
