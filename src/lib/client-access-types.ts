// Plain types for client-access.ts (server-only, touches Postgres) — split
// out so client components can import the shape without pulling in the
// server-only module itself.

import type { ClientPermissions } from "./client-permissions";

export type ClientAccessUserSummary = {
  id: string;
  name: string;
  username: string;
  /** True when this person has their own permission override, replacing the company's default entirely. */
  hasPermissionsOverride: boolean;
  /** Effective permissions — the override if set, otherwise the company's own. Always resolved server-side, never merged client-side. */
  permissions: ClientPermissions;
  mustChangePassword: boolean;
  createdAt: string;
};

export type ClientAccessSummary = {
  id: string;
  slug: string;
  label: string;
  accountIds: string[];
  permissions: ClientPermissions;
  createdAt: string;
  users: ClientAccessUserSummary[];
};
