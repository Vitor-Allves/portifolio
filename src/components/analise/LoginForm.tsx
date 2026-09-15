"use client";

import { useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const fieldClass =
  "w-full rounded-xl border border-white/[0.12] bg-white/[0.04] px-4 py-3.5 text-[15px] text-white placeholder:text-silver-400/50 focus:border-silver-400/60 focus:bg-white/[0.06] focus:outline-none transition-colors duration-200";
const labelClass = "block text-[11px] font-medium tracking-[0.14em] uppercase text-silver-400 mb-2";
const submitClass =
  "mt-7 inline-flex w-full items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-sm font-semibold uppercase tracking-[0.12em] text-navy-900 shadow-[0_8px_24px_-8px_rgba(255,255,255,0.35)] transition-[filter,transform] duration-200 hover:brightness-95 active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-60";

function Spinner() {
  return (
    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-90" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
    </svg>
  );
}

function ErrorMessage({ message }: { message: string }) {
  return (
    <p className="mt-4 rounded-lg border border-intel-red/25 bg-intel-red/10 px-3.5 py-2.5 text-[13px] text-intel-red" role="alert">
      {message}
    </p>
  );
}

type Stage =
  | { kind: "credentials" }
  | { kind: "verify" }
  | { kind: "enroll"; qrDataUrl: string; otpauthUri: string; recoveryCodes: string[]; acknowledged: boolean };

export default function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  function goToDestination() {
    const from = searchParams.get("from");
    const destination = from ? `${from.replace(/\/$/, "")}/` : "/analise/";
    router.push(destination);
    router.refresh();
  }

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const res = await fetch("/api/analise/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; stage?: string } | null;

      if (!res.ok) {
        setError(body?.error ?? "Não foi possível entrar.");
        setLoading(false);
        return;
      }

      if (body?.stage === "verify") {
        setStage({ kind: "verify" });
        setLoading(false);
        return;
      }

      if (body?.stage === "enroll") {
        const enrollRes = await fetch("/api/analise/2fa/enroll/start/", { method: "POST" });
        const enrollBody = (await enrollRes.json().catch(() => null)) as
          | { error?: string; qrDataUrl?: string; otpauthUri?: string; recoveryCodes?: string[] }
          | null;
        if (!enrollRes.ok || !enrollBody?.qrDataUrl) {
          setError(enrollBody?.error ?? "Não foi possível iniciar a configuração de segurança.");
          setLoading(false);
          return;
        }
        setStage({
          kind: "enroll",
          qrDataUrl: enrollBody.qrDataUrl,
          otpauthUri: enrollBody.otpauthUri ?? "",
          recoveryCodes: enrollBody.recoveryCodes ?? [],
          acknowledged: false,
        });
        setLoading(false);
        return;
      }

      goToDestination();
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  async function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/analise/login/totp/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Código inválido.");
        setLoading(false);
        return;
      }
      goToDestination();
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  async function handleEnrollConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.kind !== "enroll") return;
    setError(null);
    setLoading(true);
    try {
      const res = await fetch("/api/analise/2fa/enroll/confirm/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        setError(body?.error ?? "Código inválido.");
        setLoading(false);
        return;
      }
      goToDestination();
    } catch {
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  if (stage.kind === "verify") {
    return (
      <form onSubmit={handleVerifySubmit} noValidate>
        <p className="text-sm text-silver-400 mb-5">
          Digite o código de 6 dígitos do seu aplicativo autenticador, ou um código de recuperação.
        </p>
        <label htmlFor="totp-code" className={labelClass}>
          Código
        </label>
        <input
          id="totp-code"
          name="code"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${fieldClass} text-center tracking-[0.3em]`}
          placeholder="000000"
        />
        {error && <ErrorMessage message={error} />}
        <button type="submit" disabled={loading} aria-busy={loading} className={submitClass}>
          {loading && <Spinner />}
          {loading ? "Verificando..." : "Confirmar"}
        </button>
      </form>
    );
  }

  if (stage.kind === "enroll") {
    const { qrDataUrl, recoveryCodes, acknowledged } = stage;
    if (!acknowledged) {
      return (
        <div>
          <p className="text-sm text-silver-400 mb-4">
            Como administrador geral, sua conta exige autenticação em duas etapas. Escaneie o código abaixo com um
            aplicativo autenticador (Google Authenticator, Authy, 1Password...).
          </p>
          <div className="flex justify-center rounded-xl bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code para configurar a autenticação em duas etapas" width={200} height={200} />
          </div>
          <p className="mt-5 text-[11px] font-medium tracking-[0.14em] uppercase text-silver-400 mb-2">
            Códigos de recuperação
          </p>
          <p className="text-xs text-silver-400 mb-2">
            Guarde estes códigos em um local seguro — cada um pode ser usado uma única vez caso você perca acesso ao
            aplicativo autenticador. Eles não serão exibidos novamente.
          </p>
          <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] p-3 font-mono text-[12.5px] text-white">
            {recoveryCodes.map((c) => (
              <span key={c}>{c}</span>
            ))}
          </div>
          <button
            type="button"
            onClick={() => setStage({ ...stage, acknowledged: true })}
            className={submitClass}
          >
            Já salvei os códigos de recuperação
          </button>
        </div>
      );
    }

    return (
      <form onSubmit={handleEnrollConfirm} noValidate>
        <p className="text-sm text-silver-400 mb-5">
          Digite o código de 6 dígitos exibido no seu aplicativo autenticador para concluir a configuração.
        </p>
        <label htmlFor="totp-confirm-code" className={labelClass}>
          Código
        </label>
        <input
          id="totp-confirm-code"
          name="code"
          inputMode="text"
          autoComplete="one-time-code"
          autoFocus
          required
          value={code}
          onChange={(e) => setCode(e.target.value)}
          className={`${fieldClass} text-center tracking-[0.3em]`}
          placeholder="000000"
        />
        {error && <ErrorMessage message={error} />}
        <button type="submit" disabled={loading} aria-busy={loading} className={submitClass}>
          {loading && <Spinner />}
          {loading ? "Confirmando..." : "Ativar e entrar"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={handleCredentialsSubmit} noValidate>
      <label htmlFor="username" className={labelClass}>
        Usuário
      </label>
      <input
        id="username"
        name="username"
        type="text"
        autoComplete="username"
        autoCapitalize="off"
        autoCorrect="off"
        required
        value={username}
        onChange={(e) => setUsername(e.target.value)}
        className={fieldClass}
      />

      <label htmlFor="password" className={`${labelClass} mt-6`}>
        Senha
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

      {error && <ErrorMessage message={error} />}

      <button type="submit" disabled={loading} aria-busy={loading} className={submitClass}>
        {loading && <Spinner />}
        {loading ? "Entrando..." : "Entrar"}
      </button>

      <p className="mt-5 text-center text-[12.5px] text-silver-400">
        Esqueceu sua senha? Entre em contato com o administrador.
      </p>
    </form>
  );
}
