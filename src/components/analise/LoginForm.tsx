"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const fieldClass =
  "w-full rounded-lg border border-white/15 bg-navy-950 px-4 py-3.5 text-sm text-white placeholder:text-silver-500 focus:border-silver-400 focus:outline-none transition-colors";
const labelClass = "block text-[11px] tracking-[0.14em] uppercase text-silver-400 mb-2";

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
        <p className="mt-3 text-sm text-red-400" role="alert">
          {error}
        </p>
      )}

      <button
        type="submit"
        disabled={loading}
        className="mt-6 w-full inline-flex items-center justify-center bg-white text-navy-950 text-sm tracking-[0.12em] uppercase font-medium px-6 py-3.5 rounded-full hover:bg-silver-200 active:bg-silver-300 transition-colors duration-300 disabled:opacity-60 disabled:cursor-not-allowed"
      >
        {loading ? "Entrando..." : "Entrar"}
      </button>
    </form>
  );
}
