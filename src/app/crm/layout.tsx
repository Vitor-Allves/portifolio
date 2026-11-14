import { Montserrat } from "next/font/google";
import { cookies } from "next/headers";
import { CRM_THEME_COOKIE, parseCrmTheme } from "@/components/crm/crm-theme";

// Same Montserrat scoping as src/app/intelligence/layout.tsx — the CRM is a
// separate area but the same product family, so it reads the same.
const montserrat = Montserrat({
  variable: "--font-montserrat-crm",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default async function CrmLayout({ children }: { children: React.ReactNode }) {
  // Light/dark chosen in the header toggle; no cookie → follow the OS.
  const theme = parseCrmTheme((await cookies()).get(CRM_THEME_COOKIE)?.value);
  return (
    <div
      id="crm-root"
      data-theme={theme ?? undefined}
      className={`crm-theme min-h-screen ${montserrat.variable}`}
      style={{
        fontFamily: "var(--font-montserrat-crm), sans-serif",
        ["--font-sans" as string]: "var(--font-montserrat-crm), sans-serif",
      }}
    >
      {children}
    </div>
  );
}
