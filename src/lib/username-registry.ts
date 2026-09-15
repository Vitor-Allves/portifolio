// Server-only. Transactional helpers around the `usernames` global registry
// table (see db.ts) — every write that creates or renames a username goes
// through one of these, always inside the same withTransaction() as the
// owning row's INSERT/UPDATE, so the registry and the account table can
// never drift apart even under concurrent requests.

import type { PoolClient } from "pg";
import { normalizeUsername, isValidUsername } from "./username";

export class UsernameTakenError extends Error {
  constructor() {
    super("Este nome de usuário já está em uso.");
    this.name = "UsernameTakenError";
  }
}

export class InvalidUsernameError extends Error {
  constructor(help: string) {
    super(help);
    this.name = "InvalidUsernameError";
  }
}

function isUniqueViolation(err: unknown): boolean {
  return Boolean(
    err && typeof err === "object" && "code" in err && (err as { code?: string }).code === "23505"
  );
}

/** Claims a brand-new username for a not-yet-existing owner row. Call inside the same transaction as the owning INSERT. Throws UsernameTakenError on collision (case-insensitive) or InvalidUsernameError if the syntax is wrong. */
export async function claimUsernameTx(
  client: PoolClient,
  rawUsername: string,
  ownerTable: "internal_users" | "client_access_users",
  ownerId: string
): Promise<string> {
  if (!isValidUsername(rawUsername)) {
    throw new InvalidUsernameError("Nome de usuário inválido.");
  }
  const lower = normalizeUsername(rawUsername);
  try {
    await client.query(
      `INSERT INTO usernames (username_lower, owner_table, owner_id) VALUES ($1,$2,$3)`,
      [lower, ownerTable, ownerId]
    );
  } catch (err) {
    if (isUniqueViolation(err)) throw new UsernameTakenError();
    throw err;
  }
  return lower;
}

/** Renames an existing owner's username: claims the new one, then releases the old — both inside the same transaction as the owning UPDATE. No-op if the normalized value is unchanged. */
export async function renameUsernameTx(
  client: PoolClient,
  oldUsername: string,
  newUsername: string,
  ownerTable: "internal_users" | "client_access_users",
  ownerId: string
): Promise<string> {
  const oldLower = normalizeUsername(oldUsername);
  const newLower = normalizeUsername(newUsername);
  if (oldLower === newLower) return oldLower;
  const claimed = await claimUsernameTx(client, newUsername, ownerTable, ownerId);
  await client.query(`DELETE FROM usernames WHERE username_lower = $1 AND owner_id = $2`, [oldLower, ownerId]);
  return claimed;
}
