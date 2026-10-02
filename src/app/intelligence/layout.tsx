import { Montserrat } from "next/font/google";

// Scoped to /intelligence/* only — the public marketing site keeps Manrope
// (loaded in the root layout). Redeclaring --font-sans on this wrapper lets
// every existing `font-sans` Tailwind class and inherited body text under
// this subtree pick up Montserrat without touching a single component.
// The login page loads its own Montserrat independently (see
// intelligence/login/page.tsx) and applies it directly on its own <main>,
// which simply wins over this layout's inherited value for that subtree.
const montserrat = Montserrat({
  variable: "--font-montserrat-intel",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

export default function IntelligenceLayout({ children }: { children: React.ReactNode }) {
  return (
    <div
      className={montserrat.variable}
      style={{
        fontFamily: "var(--font-montserrat-intel), sans-serif",
        ["--font-sans" as string]: "var(--font-montserrat-intel), sans-serif",
      }}
    >
      {children}
    </div>
  );
}
