import type { Metadata } from "next";
import { Suspense } from "react";
import { Montserrat, Cinzel } from "next/font/google";
import LoginScene from "@/components/analise/LoginScene";

export const metadata: Metadata = {
  title: "Acesso — Legado Intelligence",
  robots: { index: false, follow: false },
};

const montserrat = Montserrat({
  variable: "--login-font-montserrat",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  display: "swap",
});

const cinzel = Cinzel({
  variable: "--login-font-cinzel",
  subsets: ["latin"],
  weight: ["600"],
  display: "swap",
});

export default function AnaliseLoginPage() {
  return (
    <main className={`${montserrat.variable} ${cinzel.variable} font-[var(--login-font-montserrat)]`}>
      <Suspense fallback={null}>
        <LoginScene />
      </Suspense>
    </main>
  );
}
