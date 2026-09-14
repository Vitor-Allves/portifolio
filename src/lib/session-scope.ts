// Plain types shared by both session implementations (Edge/Web Crypto and
// Node classic crypto) and by any component that needs to know what a
// session is allowed to see. No crypto, no env vars — safe anywhere.

import type { ClientPermissions } from "./client-permissions";

/** "admin" sees every ad account and every filter/column/section; "client" is restricted to accountIds, plus whatever filters/columns/sections were hidden for it. */
export type SessionScope =
  | { kind: "admin" }
  | { kind: "client"; accountIds: string[]; label: string; permissions: ClientPermissions };
