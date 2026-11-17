// Light/dark choice for the CRM, remembered per browser in a cookie so the
// server renders the right theme on the first paint (no flash). No cookie
// means "follow the operating system".

export type CrmTheme = "light" | "dark";

export const CRM_THEME_COOKIE = "crm-theme";

export function parseCrmTheme(value: string | undefined): CrmTheme | null {
  return value === "light" || value === "dark" ? value : null;
}

/** "collapsed" when the left menu was shrunk to icons; read on the server like the theme. */
export const CRM_SIDEBAR_COOKIE = "crm-sidebar";
