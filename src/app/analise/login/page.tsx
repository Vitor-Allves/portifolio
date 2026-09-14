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
    <main className="min-h-screen flex items-center justify-center bg-navy-950 px-6 py-16">
      <div className="w-full max-w-sm">
        <div className="mb-10 flex justify-center">
          <Logo variant="light" />
        </div>
        <div className="rounded-2xl border border-white/10 bg-navy-900 p-8">
          <h1 className="font-serif text-2xl text-white text-center mb-1">
            Análise de Campanhas
          </h1>
          <p className="text-sm text-silver-400 text-center mb-8">
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
