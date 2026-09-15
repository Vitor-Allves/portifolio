import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { sessionScopeFromCookieStore } from "@/lib/auth-context";
import Logo from "@/components/Logo";
import ChangePasswordForm from "@/components/analise/ChangePasswordForm";

export const metadata: Metadata = {
  title: "Trocar senha — Legado Intelligence",
  robots: { index: false, follow: false },
};

export default async function TrocarSenhaPage() {
  const scope = await sessionScopeFromCookieStore();
  if (!scope) redirect("/analise/login/");

  const forced = scope.mustChangePassword;

  return (
    <main className="relative min-h-screen overflow-x-hidden bg-intel-ambient bg-intel-grid flex items-center justify-center px-6 py-16">
      <div className="w-full max-w-sm rounded-2xl border border-white/[0.12] bg-white/[0.05] p-7 shadow-[0_24px_70px_-24px_rgba(4,7,12,0.65)] backdrop-blur-md sm:p-9">
        <div className="flex justify-center mb-6">
          <Logo variant="onDark" size="sm" className="!h-10" />
        </div>
        <h1 className="text-center font-serif text-2xl text-white sm:text-[26px]">
          {forced ? "Defina sua nova senha" : "Alterar senha"}
        </h1>
        <p className="mt-2 text-center text-sm text-silver-400">
          {forced
            ? "Por segurança, você precisa trocar a senha temporária antes de continuar."
            : "Informe sua senha atual e a nova senha desejada."}
        </p>
        <div className="mt-8">
          <ChangePasswordForm forced={forced} />
        </div>
      </div>
    </main>
  );
}
