// Light/dark choice for the CRM, remembered per browser in a cookie so the
// server renders the right theme on the first paint (no flash). No cookie
// means "follow the operating system".

export type CrmTheme = "light" | "dark";

export const CRM_THEME_COOKIE = "crm-theme";

export function parseCrmTheme(value: string | undefined): CrmTheme | null {
  return value === "light" || value === "dark" ? value : null;
}
