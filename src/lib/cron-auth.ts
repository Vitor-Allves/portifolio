import { timingSafeEqual } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/**
 * The server's scheduler calls the /api/cron routes — not people, so there's
 * no session: they need the Authorization header "Bearer <CRON_SECRET>"
 * (Vercel Cron sends it when the project has that environment variable).
 * Without CRON_SECRET they stay off. null = authorized.
 */
export function cronDenied(req: NextRequest, off: string): NextResponse | null {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: off }, { status: 503 });
  const got = Buffer.from(req.headers.get("authorization") ?? "");
  const want = Buffer.from(`Bearer ${secret}`);
  if (got.length !== want.length || !timingSafeEqual(got, want)) {
    return NextResponse.json({ error: "Não autorizado." }, { status: 401 });
  }
  return null;
}
