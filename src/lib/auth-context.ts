// Server-only (Node runtime). The authoritative session check — hydrates a
// full SessionScope fresh from Postgres on every single call, from nothing
// more than the thin (kind, userId, sessionVersion) token payload. This is
// what makes a role/company/permission change, a password reset, or a
// revoke take effect immediately, even for a session that was already open
// when the change happened: there is no cached/stale copy anywhere in this
// path. Every Node-runtime route and page must call one of the functions
// below rather than reading the cookie/token directly — the Edge
// middleware's own check (src/proxy.ts) is a fast, unauthoritative
// pre-filter only.

import { cookies } from "next/headers";
import type { NextRequest } from "next/server";
import { getDb } from "./db";
import { ANALISE_SESSION_COOKIE, verifySessionToken } from "./analise-session-node";
import type { SessionScope, StaffRole } from "./session-scope";
import { sanitizePermissions } from "./client-permissions";

async function hydrateStaff(userId: string, expectedSessionVersion: number): Promise<SessionScope | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    name: string;
    username: string;
    role: StaffRole;
    account_ids: string[];
    permissions: unknown;
    session_version: number;
    must_change_password: boolean;
    revoked_at: string | null;
  }>(
    `SELECT id, name, username, role, account_ids, permissions, session_version, must_change_password, revoked_at
     FROM internal_users WHERE id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row || row.revoked_at || row.session_version !== expectedSessionVersion) return null;
  return {
    kind: "staff",
    userId: row.id,
    username: row.username,
    userName: row.name,
    role: row.role,
    accountIds: row.account_ids,
    permissions: sanitizePermissions(row.permissions),
    mustChangePassword: row.must_change_password,
    sessionVersion: row.session_version,
  };
}

async function hydrateClient(userId: string, expectedSessionVersion: number): Promise<SessionScope | null> {
  const db = await getDb();
  const { rows } = await db.query<{
    id: string;
    name: string;
    username: string;
    session_version: number;
    must_change_password: boolean;
    revoked_at: string | null;
    permissions_override: unknown;
    client_id: string;
    label: string;
    account_ids: string[];
    permissions: unknown;
    client_revoked_at: string | null;
  }>(
    `SELECT u.id, u.name, u.username, u.session_version, u.must_change_password, u.revoked_at, u.permissions_override,
            c.id AS client_id, c.label, c.account_ids, c.permissions, c.revoked_at AS client_revoked_at
     FROM client_access_users u
     JOIN client_access c ON c.id = u.client_access_id
     WHERE u.id = $1`,
    [userId]
  );
  const row = rows[0];
  if (!row || row.revoked_at || row.client_revoked_at || row.session_version !== expectedSessionVersion) return null;
  return {
    kind: "client",
    userId: row.id,
    username: row.username,
    userName: row.name,
    clientAccessId: row.client_id,
    label: row.label,
    accountIds: row.account_ids,
    permissions: sanitizePermissions(row.permissions_override ?? row.permissions),
    mustChangePassword: row.must_change_password,
    sessionVersion: row.session_version,
  };
}

/** Verifies the token signature/expiry, then re-fetches everything else fresh from the database. Returns null for a missing/invalid/expired token, a revoked account, or a session issued before the account's last reset/revoke (session_version mismatch). Never throws on a database read failure — treated as "not authenticated" so a transient DB hiccup fails closed rather than showing a broken page. */
export async function getSessionScope(token: string | undefined | null): Promise<SessionScope | null> {
  const payload = verifySessionToken(token);
  if (!payload) return null;
  try {
    return payload.kind === "staff"
      ? await hydrateStaff(payload.userId, payload.sessionVersion)
      : await hydrateClient(payload.userId, payload.sessionVersion);
  } catch (err) {
    console.error("[auth-context] failed to hydrate session", err);
    return null;
  }
}

export async function sessionScopeFromRequest(req: NextRequest): Promise<SessionScope | null> {
  return getSessionScope(req.cookies.get(ANALISE_SESSION_COOKIE)?.value);
}

/** For Server Components / Server Actions, where the request object isn't available. */
export async function sessionScopeFromCookieStore(): Promise<SessionScope | null> {
  const store = await cookies();
  return getSessionScope(store.get(ANALISE_SESSION_COOKIE)?.value);
}

/**
 * True only for a session that's both valid AND not mid forced-password-
 * change. Every data-serving route must gate on this (not just a non-null
 * scope) — a session with a pending forced change may reach the
 * change-password endpoint and read its own identity, nothing else.
 */
export function hasDataAccess(scope: SessionScope | null): scope is SessionScope {
  return scope !== null && !scope.mustChangePassword;
}
