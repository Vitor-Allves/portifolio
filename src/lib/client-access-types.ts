// Plain types for client-access.ts (server-only, touches Postgres) — split
// out so client components can import the shape without pulling in the
// server-only module itself.

import type { ClientPermissions } from "./client-permissions";

export type ClientAccessSummary = {
  id: string;
  slug: string;
  label: string;
  accountIds: string[];
  permissions: ClientPermissions;
  createdAt: string;
};
