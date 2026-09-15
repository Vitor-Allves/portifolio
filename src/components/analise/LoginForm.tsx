"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const fieldClass =
  "w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-silver-400/50 focus:border-silver-400/60 focus:bg-white/[0.06] focus:outline-none transition-colors duration-200";
const labelClass = "block text-[11px] font-medium tracking-[0.14em] uppercase text-silver-400 mb-2";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/analise/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim() || undefined, password }),
      });

      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Não foi possível entrar.");
        setLoading(false);
        return;
      }

      const from = searchParams.get("from");
      const destination = from ? `${from.replace(/\/$/, "")}/` : "/analise/";
      router.push(destination);
      router.refresh();
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} noValidate>
      <label htmlFor="email" className={labelClass}>
        E-mail da equipe (opcional)
      </label>
      <input
        id="email"
        name="email"
        type="email"
        autoComplete="username"
        placeholder="Deixe em branco se você é cliente"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        className={fieldClass}
      />

      <label htmlFor="password" className={`${labelClass} mt-6`}>
        Senha de acesso
      </label>
      <input
        id="password"
        name="password"
        type="password"
        autoComplete="current-password"
        required
        value={password}
        onChange={(e) => setPassword(e.target.value)}
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
        {loading && (
          <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
          </svg>
        )}
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
