// Plain types shared by both session-token implementations (Edge/Web Crypto
// and Node classic crypto) and by any component that needs to know what a
// session is allowed to see. No crypto, no env vars, no db import — safe
// anywhere. The token itself only carries a thin (kind, userId,
// sessionVersion) identifier (see analise-session-node.ts); this richer
// SessionScope is always hydrated fresh from the database by
// auth-context.ts on every protected request, so a role/company/permission
// change takes effect immediately, even for a session opened before the
// change — never trust a cached copy of this shape.

import type { ClientPermissions } from "./client-permissions";

/**
 * Four fixed profiles for the internal Legado team. Only
 * "administrador_geral" may manage users/permissions or reset another
 * account's password — that capability is gated on this exact role, never
 * inferred from having reached the user list. The other three roles differ
 * only in the account/permission scope an administrador_geral assigns them;
 * the taxonomy itself never grants extra reach on its own.
 */
export type StaffRole = "administrador_geral" | "administrador" | "gestor" | "analista";

export const STAFF_ROLES: readonly StaffRole[] = [
  "administrador_geral",
  "administrador",
  "gestor",
  "analista",
];

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  administrador_geral: "Administrador geral",
  administrador: "Administrador",
  gestor: "Gestor",
  analista: "Analista",
};

type BaseScope = {
  userId: string;
  username: string;
  userName: string;
  /** Meta ad-account ids this session may see. Ignored for administrador_geral (always unrestricted) — see resolveAllowedAccountIds. */
  accountIds: string[];
  permissions: ClientPermissions;
  /** True until the user completes a forced password change (new account or post-reset) — see auth-context.ts's hasDataAccess. */
  mustChangePassword: boolean;
  sessionVersion: number;
};

export type SessionScope =
  | (BaseScope & { kind: "staff"; role: StaffRole })
  | (BaseScope & { kind: "client"; clientAccessId: string; label: string });

/** True only for a full admin — the one role allowed to manage staff/clients, reset passwords, and change permissions. */
export function isFullAdmin(
  scope: SessionScope | null
): scope is BaseScope & { kind: "staff"; role: "administrador_geral" } {
  return scope?.kind === "staff" && scope.role === "administrador_geral";
}

/** null = unrestricted (every ad account) — administrador_geral only. Every other session, staff or client, is limited to its own accountIds (an empty list means "sees nothing", never "sees everything"). */
export function resolveAllowedAccountIds(scope: SessionScope | null): string[] | null {
  if (!scope) return [];
  if (isFullAdmin(scope)) return null;
  return scope.accountIds;
}
