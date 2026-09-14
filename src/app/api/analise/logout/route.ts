import { NextResponse } from "next/server";
import { ANALISE_SESSION_COOKIE } from "@/lib/analise-session";

export const runtime = "nodejs";

export async function POST() {
  const res = NextResponse.json({ ok: true });
  res.cookies.delete(ANALISE_SESSION_COOKIE);
  return res;
}
