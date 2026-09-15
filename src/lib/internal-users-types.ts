// Plain type for internal-users.ts (server-only, touches Postgres) — split
// out so client components can import the shape without pulling in the
// server-only module itself.

import type { StaffRole } from "./session-scope";
import type { ClientPermissions } from "./client-permissions";

export type InternalUserSummary = {
  id: string;
  name: string;
  username: string;
  email: string | null;
  role: StaffRole;
  accountIds: string[];
  permissions: ClientPermissions;
  totpEnabled: boolean;
  mustChangePassword: boolean;
  createdAt: string;
};
