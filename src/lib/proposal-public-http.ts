// Server-only. Who is calling the public proposal routes: the client's IP
// (as the hosting platform reports it) and browser, and whether the request
// comes from someone of the team logged in (their visits don't count as the
// client's).

import type { NextRequest } from "next/server";
import { sessionScopeFromRequest } from "./auth-context";

export function clientMeta(req: NextRequest): { ip: string | null; userAgent: string | null } {
  const fwd = req.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  const ip = (fwd || req.headers.get("x-real-ip") || "").slice(0, 64) || null;
  return { ip, userAgent: req.headers.get("user-agent")?.slice(0, 300) ?? null };
}

export async function isTeam(req: NextRequest): Promise<boolean> {
  try {
    const scope = await sessionScopeFromRequest(req);
    return scope?.kind === "staff";
  } catch {
    return false;
  }
}
