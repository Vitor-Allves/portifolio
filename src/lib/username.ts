// Shared username validation — used by both the admin creation form (client
// component, no crypto/db imports needed) and every server-side route that
// creates or looks up an account by username. Uniqueness itself is enforced
// case-insensitively via a DB constraint (see db.ts) since a race between two
// concurrent requests can't be closed by an application-level check alone;
// this module only defines what a *syntactically* valid username looks like.

const USERNAME_RE = /^[a-z][a-z0-9._-]{2,31}$/;

export const USERNAME_RULES_HELP =
  "3 a 32 caracteres: letras minúsculas, números, ponto, hífen ou underscore, começando com uma letra.";

/** Case is never meaningful for a username — always compare/store the normalized form. */
export function normalizeUsername(raw: string): string {
  return raw.trim().toLowerCase();
}

export function isValidUsername(raw: string): boolean {
  return USERNAME_RE.test(normalizeUsername(raw));
}

/** Best-effort slugification for auto-generating a username from a display name/e-mail during migration — never assumed unique on its own; callers must still check/disambiguate against existing rows. */
export function slugifyUsername(raw: string): string {
  const base = raw
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .slice(0, 24);
  const withLetter = /^[a-z]/.test(base) ? base : `u${base}`;
  return withLetter.length >= 3 ? withLetter : `${withLetter}usr`;
}
