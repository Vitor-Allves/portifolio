"use client";

import { useState, useSyncExternalStore } from "react";
import { CRM_THEME_COOKIE, type CrmTheme } from "./crm-theme";

const DARK_QUERY = "(prefers-color-scheme: dark)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(DARK_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export default function CrmThemeToggle({ initialTheme }: { initialTheme: CrmTheme | null }) {
  const [chosen, setChosen] = useState<CrmTheme | null>(initialTheme);
  const systemDark = useSyncExternalStore(
    subscribe,
    () => window.matchMedia(DARK_QUERY).matches,
    () => false
  );
  const effective: CrmTheme = chosen ?? (systemDark ? "dark" : "light");
  const next: CrmTheme = effective === "dark" ? "light" : "dark";

  function toggle() {
    setChosen(next);
    // The theme root is rendered by src/app/crm/layout.tsx.
    document.getElementById("crm-root")?.setAttribute("data-theme", next);
    document.cookie = `${CRM_THEME_COOKIE}=${next}; path=/crm; max-age=31536000; samesite=lax`;
  }

  return (
    <button
      type="button"
      onClick={toggle}
      aria-label={next === "dark" ? "Usar tema escuro" : "Usar tema claro"}
      title={next === "dark" ? "Tema escuro" : "Tema claro"}
      className="h-8 w-8 inline-flex items-center justify-center rounded-full border border-white/15 text-crm-header-dim hover:text-crm-header-text hover:border-white/30 transition-colors duration-200"
    >
      {effective === "dark" ? (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden="true">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
        </svg>
      ) : (
        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" aria-hidden="true">
          <path d="M20 14.5A8 8 0 0 1 9.5 4a8 8 0 1 0 10.5 10.5Z" />
        </svg>
      )}
    </button>
  );
}
