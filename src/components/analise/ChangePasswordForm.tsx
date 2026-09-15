"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

const fieldClass =
  "w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-silver-400/50 focus:border-silver-400/60 focus:bg-white/[0.06] focus:outline-none transition-colors duration-200";
const labelClass = "block text-[11px] font-medium tracking-[0.14em] uppercase text-silver-400 mb-2";

export default function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (newPassword.length < 8) {
      setError("A nova senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/analise/change-password/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, newPassword, confirmPassword }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Não foi possível trocar a senha.");
        setLoading(false);
        return;
      }
      router.push("/analise/");
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="current-password" className={labelClass}>
        {forced ? "Senha temporária" : "Senha atual"}
      </label>
      <input
        id="current-password"
        type="password"
        autoComplete="current-password"
        required
        value={currentPassword}
        onChange={(e) => setCurrentPassword(e.target.value)}
        className={fieldClass}
      />

      <label htmlFor="new-password" className={`${labelClass} mt-6`}>
        Nova senha
      </label>
      <input
        id="new-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={newPassword}
        onChange={(e) => setNewPassword(e.target.value)}
        className={fieldClass}
      />

      <label htmlFor="confirm-password" className={`${labelClass} mt-6`}>
        Confirmar nova senha
      </label>
      <input
        id="confirm-password"
        type="password"
        autoComplete="new-password"
        required
        minLength={8}
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        className={fieldClass}
      />

      {error && (
        <p className="mt-4 rounded-lg border border-intel-red/25 bg-intel-red/10 px-3.5 py-2.5 text-[13px] text-intel-red" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        aria-busy={loading}
        className="mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-navy-900 shadow-[0_8px_24px_-8px_rgba(255,255,255,0.35)] transition-[filter,transform] duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60"
      >
        {loading ? "Salvando..." : "Salvar nova senha"}
      </button>
    </form>
  );
}
