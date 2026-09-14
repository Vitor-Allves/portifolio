// Plain type for internal-users.ts (server-only, touches Postgres) — split
// out so client components can import the shape without pulling in the
// server-only module itself.

import type { InternalRole } from "./session-scope";

export type InternalUserSummary = {
  id: string;
  name: string;
  email: string;
  role: InternalRole;
  createdAt: string;
};
