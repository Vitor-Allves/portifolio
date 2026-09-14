// Plain types shared by both session implementations (Edge/Web Crypto and
// Node classic crypto) and by any component that needs to know what a
// session is allowed to see. No crypto, no env vars — safe anywhere.

/** "admin" sees every ad account; "client" is restricted to accountIds. */
export type SessionScope =
  | { kind: "admin" }
  | { kind: "client"; accountIds: string[]; label: string };
