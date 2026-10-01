"use client";

import { useRef, useState, type FormEvent } from "react";
import { useRouter, useSearchParams } from "next/navigation";

// How long the "conquista" pose/bubble stays up before the real redirect
// fires — purely a visual beat, requested explicitly, never gates the
// actual auth: the session cookie is already set by the time this runs.
const SUCCESS_HOLD_MS = 1000;

/**
 * Every visual cue LoginScene needs to drive the mascots/speech bubble/logo
 * bars — LoginForm only ever emits these around its REAL auth calls; it
 * never fakes a stage, a delay (besides the explicit success hold above),
 * or an outcome that didn't actually happen.
 */
export type LoginVisualEvent =
  | { type: "focus"; field: "username" | "password" }
  | { type: "blur"; field: "password" }
  /** 0 = both empty, 1 = usuário preenchido, 2 = usuário + senha preenchidos. */
  | { type: "progress"; step: 0 | 1 | 2 }
  | { type: "password-visibility"; visible: boolean }
  | { type: "submit-start" }
  /** Caught client-side before any request (empty field) — never touches the logo bars. */
  | { type: "validation-error" }
  /** A real server rejection (wrong credentials, invalid code, network failure). */
  | { type: "auth-failed" }
  | { type: "submit-success" }
  | { type: "stage"; stage: "credentials" | "verify" | "enroll" }
  | { type: "forgot-view"; open: boolean };

const fieldClass =
  "w-full h-[46px] rounded-[10px] border border-slate-300 bg-slate-50 px-3.5 text-[15px] font-medium text-[#16243D] placeholder:text-slate-400 focus:border-[#2E5BA8] focus:bg-white focus:outline-none focus:ring-4 focus:ring-[#2E5BA8]/20 transition-colors duration-200 aria-[invalid=true]:border-[#A23A3A]";
const labelClass = "block text-[12.5px] font-semibold text-[#16243D] mb-1.5";
const submitClass =
  "mt-1 inline-flex h-12 w-full items-center justify-center gap-2 rounded-[10px] bg-[#1F3A63] px-6 text-[15px] font-bold tracking-[0.02em] text-white transition-[filter] duration-200 hover:brightness-110 disabled:cursor-progress disabled:saturate-[.6]";
const linkClass = "bg-none border-0 p-0 text-[13px] font-semibold text-[#16243D] underline underline-offset-[3px] decoration-[#16243D]/35 cursor-pointer hover:decoration-[#16243D]/70";

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
    <p className="mt-1 text-[13px] leading-snug text-[#A23A3A]" role="alert" aria-live="assertive">
      {message}
    </p>
  );
}

type Stage =
  | { kind: "credentials" }
  | { kind: "verify" }
  | { kind: "enroll"; qrDataUrl: string; otpauthUri: string; recoveryCodes: string[]; acknowledged: boolean };

export default function LoginForm({ onVisualEvent }: { onVisualEvent?: (event: LoginVisualEvent) => void }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(false);
  const [code, setCode] = useState("");
  const [stage, setStage] = useState<Stage>({ kind: "credentials" });
  const [forgotOpen, setForgotOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const usernameRef = useRef<HTMLInputElement>(null);
  const passwordRef = useRef<HTMLInputElement>(null);

  function emit(event: LoginVisualEvent) {
    onVisualEvent?.(event);
  }

  function progressStep(nextUsername: string, nextPassword: string): 0 | 1 | 2 {
    if (!nextUsername.trim()) return 0;
    return nextPassword ? 2 : 1;
  }

  // Only a same-origin relative path is accepted — an absolute or
  // protocol-relative value (e.g. "https://evil.example" or "//evil.example")
  // would otherwise let a crafted login link (?from=...) bounce a real
  // session to an attacker's page right after real credentials were entered
  // on this legitimate domain, a classic post-login open-redirect phish.
  function safeDestination(from: string | null): string {
    if (!from || !from.startsWith("/") || from.startsWith("//") || from.startsWith("/\\")) {
      return "/analise/";
    }
    return `${from.replace(/\/$/, "")}/`;
  }

  function goToDestination() {
    router.push(safeDestination(searchParams.get("from")));
    router.refresh();
  }

  async function handleCredentialsSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    if (!username.trim()) {
      emit({ type: "validation-error" });
      setError("Informe o seu usuário para continuar.");
      usernameRef.current?.focus();
      return;
    }
    if (!password) {
      emit({ type: "validation-error" });
      setError("Digite a sua senha para entrar.");
      passwordRef.current?.focus();
      return;
    }

    setLoading(true);
    emit({ type: "submit-start" });

    try {
      const res = await fetch("/api/analise/login/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: username.trim(), password, remember }),
      });
      const body = (await res.json().catch(() => null)) as { error?: string; stage?: string } | null;

      if (!res.ok) {
        emit({ type: "auth-failed" });
        setError(body?.error ?? "Não foi possível entrar.");
        setLoading(false);
        return;
      }

      if (body?.stage === "verify") {
        setStage({ kind: "verify" });
        emit({ type: "stage", stage: "verify" });
        setLoading(false);
        return;
      }

      if (body?.stage === "enroll") {
        const enrollRes = await fetch("/api/analise/2fa/enroll/start/", { method: "POST" });
        const enrollBody = (await enrollRes.json().catch(() => null)) as
          | { error?: string; qrDataUrl?: string; otpauthUri?: string; recoveryCodes?: string[] }
          | null;
        if (!enrollRes.ok || !enrollBody?.qrDataUrl) {
          emit({ type: "auth-failed" });
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
        emit({ type: "stage", stage: "enroll" });
        setLoading(false);
        return;
      }

      emit({ type: "submit-success" });
      setSuccess(true);
      setTimeout(goToDestination, SUCCESS_HOLD_MS);
    } catch {
      emit({ type: "auth-failed" });
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  async function handleVerifySubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    emit({ type: "submit-start" });
    try {
      const res = await fetch("/api/analise/login/totp/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        emit({ type: "auth-failed" });
        setError(body?.error ?? "Código inválido.");
        setLoading(false);
        return;
      }
      emit({ type: "submit-success" });
      setSuccess(true);
      setTimeout(goToDestination, SUCCESS_HOLD_MS);
    } catch {
      emit({ type: "auth-failed" });
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  async function handleEnrollConfirm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (stage.kind !== "enroll") return;
    setError(null);
    setLoading(true);
    emit({ type: "submit-start" });
    try {
      const res = await fetch("/api/analise/2fa/enroll/confirm/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      if (!res.ok) {
        const body = (await res.json().catch(() => null)) as { error?: string } | null;
        emit({ type: "auth-failed" });
        setError(body?.error ?? "Código inválido.");
        setLoading(false);
        return;
      }
      emit({ type: "submit-success" });
      setSuccess(true);
      setTimeout(goToDestination, SUCCESS_HOLD_MS);
    } catch {
      emit({ type: "auth-failed" });
      setError("Falha de conexão. Tente novamente.");
      setLoading(false);
    }
  }

  function openForgot() {
    setForgotOpen(true);
    setError(null);
    emit({ type: "forgot-view", open: true });
  }

  function closeForgot() {
    setForgotOpen(false);
    emit({ type: "forgot-view", open: false });
    emit({ type: "progress", step: progressStep(username, password) });
  }

  function toggleShowPassword() {
    const next = !showPassword;
    setShowPassword(next);
    emit({ type: "password-visibility", visible: next });
  }

  if (forgotOpen) {
    return (
      <div className="grid gap-4">
        <h1 className="text-[20px] font-semibold leading-tight text-[#16243D]">Primeiro acesso ou esqueceu a senha?</h1>
        <p className="-mt-1 text-[13.5px] leading-relaxed text-[#5B6779]">
          A redefinição de senha é feita pelo administrador da sua empresa ou pelo seu consultor da Legado — ainda não
          existe um link automático por e-mail.
        </p>
        <p className="text-[13.5px] leading-relaxed text-[#5B6779]">
          Fale com o seu consultor da Legado ou com o administrador do seu acesso para receber uma nova senha.
        </p>
        <button type="button" className={`${linkClass} justify-self-start`} onClick={closeForgot}>
          Voltar para o login
        </button>
      </div>
    );
  }

  if (stage.kind === "verify") {
    return (
      <form onSubmit={handleVerifySubmit} noValidate className="grid gap-4">
        <p className="text-[13.5px] leading-relaxed text-[#5B6779]">
          Digite o código de 6 dígitos do seu aplicativo autenticador, ou um código de recuperação.
        </p>
        <div>
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
        </div>
        {error && <ErrorMessage message={error} />}
        <button type="submit" disabled={loading || success} aria-busy={loading} className={submitClass}>
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
        <div className="grid gap-4">
          <p className="text-[13.5px] leading-relaxed text-[#5B6779]">
            Como administrador geral, sua conta exige autenticação em duas etapas. Escaneie o código abaixo com um
            aplicativo autenticador (Google Authenticator, Authy, 1Password...).
          </p>
          <div className="flex justify-center rounded-xl border border-slate-200 bg-white p-4">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={qrDataUrl} alt="QR code para configurar a autenticação em duas etapas" width={200} height={200} />
          </div>
          <div>
            <p className="text-[12.5px] font-semibold text-[#16243D] mb-1.5">Códigos de recuperação</p>
            <p className="text-[12.5px] leading-relaxed text-[#5B6779] mb-2">
              Guarde estes códigos em um local seguro — cada um pode ser usado uma única vez caso você perca acesso ao
              aplicativo autenticador. Eles não serão exibidos novamente.
            </p>
            <div className="grid grid-cols-2 gap-1.5 rounded-lg border border-slate-200 bg-slate-50 p-3 font-mono text-[12.5px] text-[#16243D]">
              {recoveryCodes.map((c) => (
                <span key={c}>{c}</span>
              ))}
            </div>
          </div>
          <button type="button" onClick={() => setStage({ ...stage, acknowledged: true })} className={submitClass}>
            Já salvei os códigos de recuperação
          </button>
        </div>
      );
    }

    return (
      <form onSubmit={handleEnrollConfirm} noValidate className="grid gap-4">
        <p className="text-[13.5px] leading-relaxed text-[#5B6779]">
          Digite o código de 6 dígitos exibido no seu aplicativo autenticador para concluir a configuração.
        </p>
        <div>
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
        </div>
        {error && <ErrorMessage message={error} />}
        <button type="submit" disabled={loading || success} aria-busy={loading} className={submitClass}>
          {loading && <Spinner />}
          {loading ? "Confirmando..." : "Ativar e entrar"}
        </button>
      </form>
    );
  }

  return (
    <div className="grid gap-4">
      <div>
        <h1 className="text-[20px] font-semibold leading-tight text-[#16243D]">Acesse seu painel</h1>
        <p className="mt-1 text-[13.5px] leading-relaxed text-[#5B6779]">
          Indicadores, filtros e relatórios da sua empresa, liberados conforme o seu acesso.
        </p>
      </div>
      <form onSubmit={handleCredentialsSubmit} noValidate className="grid gap-3.5">
        <div>
          <label htmlFor="username" className={labelClass}>
            Usuário
          </label>
          <input
            id="username"
            name="username"
            ref={usernameRef}
            type="text"
            autoComplete="username"
            autoCapitalize="off"
            autoCorrect="off"
            required
            aria-invalid={Boolean(error) || undefined}
            value={username}
            onChange={(e) => {
              const v = e.target.value;
              setUsername(v);
              setError(null);
              emit({ type: "progress", step: progressStep(v, password) });
            }}
            onFocus={() => emit({ type: "focus", field: "username" })}
            className={fieldClass}
            placeholder="seu.usuario"
          />
        </div>

        <div>
          <label htmlFor="password" className={labelClass}>
            Senha
          </label>
          <div className="relative">
            <input
              id="password"
              name="password"
              ref={passwordRef}
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              aria-invalid={Boolean(error) || undefined}
              value={password}
              onChange={(e) => {
                const v = e.target.value;
                setPassword(v);
                setError(null);
                emit({ type: "progress", step: progressStep(username, v) });
              }}
              onFocus={() => emit({ type: "focus", field: "password" })}
              onBlur={() => {
                if (!loading && !success) emit({ type: "blur", field: "password" });
              }}
              className={`${fieldClass} pr-[84px]`}
              placeholder="Sua senha"
            />
            <button
              type="button"
              onClick={toggleShowPassword}
              aria-controls="password"
              aria-pressed={showPassword}
              className="absolute right-1.5 top-1/2 -translate-y-1/2 h-9 rounded-lg px-3 text-[12.5px] font-semibold text-[#5B6779] hover:text-[#16243D] transition-colors duration-200"
            >
              {showPassword ? "Ocultar" : "Mostrar"}
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <label className="inline-flex items-center gap-2 text-[13px] text-[#5B6779] cursor-pointer">
            <input
              type="checkbox"
              checked={remember}
              onChange={(e) => setRemember(e.target.checked)}
              className="h-4 w-4 accent-[#1F3A63]"
            />
            Manter conectado
          </label>
          <button type="button" className={linkClass} onClick={openForgot}>
            Esqueci minha senha
          </button>
        </div>

        {error && <ErrorMessage message={error} />}

        <button type="submit" disabled={loading || success} aria-busy={loading} className={submitClass}>
          {loading && <Spinner />}
          {loading ? "Entrando" : "Entrar"}
        </button>
      </form>

      <p className="border-t border-slate-200 pt-3 text-[12px] leading-relaxed text-[#5B6779]">
        Primeiro acesso ou sem permissão para alguma área? Fale com o seu consultor da Legado.
      </p>
    </div>
  );
}
