// Plain types shared by both session implementations (Edge/Web Crypto and
// Node classic crypto) and by any component that needs to know what a
// session is allowed to see. No crypto, no env vars — safe anywhere.

import type { ClientPermissions } from "./client-permissions";

/** "admin" can manage client access and the internal team; "analyst" sees every dashboard but can't reach the admin panel. Both see every ad account. */
export type InternalRole = "admin" | "analyst";

/**
 * "admin" (kind) sees every ad account, with `role` further splitting who
 * may reach /analise/admin ("admin") from who may only view dashboards
 * ("analyst"). "client" is restricted to accountIds, plus whatever
 * filters/columns/sections were hidden for it. `userId`/`userName` are
 * present for named logins (internal team members, or individual client
 * users) and absent for the legacy shared-password logins — purely for
 * display/accountability, never for access control.
 */
export type SessionScope =
  | { kind: "admin"; role: InternalRole; userId?: string; userName?: string }
  | {
      kind: "client";
      accountIds: string[];
      label: string;
      permissions: ClientPermissions;
      userId?: string;
      userName?: string;
    };

/** True only for a full admin — the one role allowed to manage clients and the internal team. An analyst (kind "admin", role "analyst") still sees every dashboard, just not the admin panel. */
export function isFullAdmin(scope: SessionScope | null): boolean {
  return scope?.kind === "admin" && scope.role === "admin";
}
