"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const fieldClass =
  "w-full rounded-lg border border-white/10 bg-intel-surface-2 px-4 py-3.5 text-sm text-intel-text placeholder:text-intel-text-dim/60 focus:border-intel-cyan/50 focus:outline-none transition-colors duration-200";
const labelClass = "block text-[11px] tracking-[0.14em] uppercase text-intel-text-dim mb-2";

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
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
        body: JSON.stringify({ password }),
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
      <label htmlFor="password" className={labelClass}>
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
        <p className="mt-3 text-sm text-intel-red" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full inline-flex items-center justify-center bg-intel-cyan text-[#04121a] text-sm tracking-[0.12em] uppercase font-semibold px-6 py-3.5 rounded-full hover:brightness-110 active:brightness-95 transition-[filter] duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
