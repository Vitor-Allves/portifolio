import type { Metadata } from "next";
import { Suspense } from "react";
import LoginForm from "@/components/analise/LoginForm";
import Logo from "@/components/Logo";

export const metadata: Metadata = {
  title: "Acesso — Análise de Campanhas",
  robots: { index: false, follow: false },
};

export default function AnaliseLoginPage() {
  return (
    <main className="min-h-screen overflow-x-hidden flex items-center justify-center bg-intel-ambient bg-intel-grid px-6 py-16">
      <div className="w-full max-w-sm animate-intel-in">
        <div className="mb-10 flex justify-center">
          <Logo variant="onDark" className="!h-16" />
        </div>
        <div className="rounded-2xl border border-white/[0.08] bg-intel-surface-1 p-8">
          <h1 className="font-sans text-xl font-semibold text-intel-text text-center mb-1">
            Legado Intelligence
          </h1>
          <p className="text-sm text-intel-text-dim text-center mb-8">
            Acesso restrito à equipe Legado Enterprise.
          </p>
          <Suspense fallback={null}>
            <LoginForm />
          </Suspense>
        </div>
      </div>
    </main>
  );
}
