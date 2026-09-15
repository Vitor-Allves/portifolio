"use client";

import { useState, type FormEvent } from "react";
import PasswordRevealBox from "./PasswordRevealBox";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";

/**
 * Administrative password reset — restricted server-side to administrador
 * geral (the endpoint enforces it; this component doesn't gate anything on
 * its own). Walks through the brief's exact sequence: shows who's being
 * reset, requires the acting admin's own current password, lets them set a
 * temporary password or generate a strong one, and reveals the result
 * exactly once with an explicit copy action.
 */
export default function ResetPasswordModal({
  targetName,
  targetUsername,
  endpoint,
  onClose,
}: {
  targetName: string;
  targetUsername: string;
  endpoint: string;
  onClose: () => void;
}) {
  const [adminPassword, setAdminPassword] = useState("");
  const [mode, setMode] = useState<"generate" | "manual">("generate");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    if (!adminPassword) {
      setError("Confirme sua senha para continuar.");
      return;
    }
    if (mode === "manual") {
      if (newPassword.length < 8) {
        setError("A senha deve ter ao menos 8 caracteres.");
        return;
      }
      if (newPassword !== confirmPassword) {
        setError("As senhas não coincidem.");
        return;
      }
    }

    setSubmitting(true);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          mode === "generate"
            ? { adminPassword, generate: true }
            : { adminPassword, newPassword, confirmPassword }
        ),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Não foi possível redefinir a senha.");
        return;
      }
      setResult(body.password as string);
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-intel-surface-1 p-6 shadow-[0_24px_70px_-24px_rgba(0,0,0,0.7)]">
        <p className="text-[13px] font-medium text-intel-text">Redefinir senha</p>
        <p className="text-xs text-intel-text-dim mt-1">
          {targetName} <span className="text-intel-text-dim/60">({targetUsername})</span>
        </p>

        {result ? (
          <PasswordRevealBox
            title="Senha redefinida"
            hint="Essa senha só aparece agora — copie e entregue por um canal privado. A pessoa precisará trocá-la no próximo acesso."
            password={result}
            onClose={onClose}
          />
        ) : (
          <form onSubmit={handleSubmit} className="mt-4" noValidate>
            <label htmlFor="reset-admin-password" className={INTEL_LABEL}>
              Confirme sua senha
            </label>
            <input
              id="reset-admin-password"
              type="password"
              autoComplete="current-password"
              value={adminPassword}
              onChange={(e) => setAdminPassword(e.target.value)}
              className={`${INTEL_INPUT} mt-2 !py-2.5`}
            />

            <div className="mt-4 grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setMode("generate")}
                className={`rounded-lg border px-3 py-2 text-[12.5px] transition-colors duration-150 ${
                  mode === "generate" ? "border-intel-cyan/40 bg-intel-cyan/[0.1] text-intel-text" : "border-white/10 text-intel-text-dim"
                }`}
              >
                Gerar senha forte
              </button>
              <button
                type="button"
                onClick={() => setMode("manual")}
                className={`rounded-lg border px-3 py-2 text-[12.5px] transition-colors duration-150 ${
                  mode === "manual" ? "border-intel-cyan/40 bg-intel-cyan/[0.1] text-intel-text" : "border-white/10 text-intel-text-dim"
                }`}
              >
                Definir manualmente
              </button>
            </div>

            {mode === "manual" && (
              <>
                <label htmlFor="reset-new-password" className={`${INTEL_LABEL} mt-4 block`}>
                  Nova senha temporária
                </label>
                <input
                  id="reset-new-password"
                  type="password"
                  minLength={8}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className={`${INTEL_INPUT} mt-2 !py-2.5`}
                />
                <label htmlFor="reset-confirm-password" className={`${INTEL_LABEL} mt-4 block`}>
                  Confirmar
                </label>
                <input
                  id="reset-confirm-password"
                  type="password"
                  minLength={8}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className={`${INTEL_INPUT} mt-2 !py-2.5`}
                />
              </>
            )}

            {error && <p className="mt-3 text-[12.5px] text-intel-red">{error}</p>}

            <div className="mt-5 flex items-center gap-2">
              <button
                type="button"
                onClick={onClose}
                className="flex-1 rounded-full border border-white/15 px-4 py-2.5 text-[12.5px] tracking-[0.08em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200"
              >
                Cancelar
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="flex-1 rounded-full bg-intel-cyan px-4 py-2.5 text-[12.5px] font-semibold tracking-[0.08em] uppercase text-[#04121a] hover:brightness-110 transition-[filter] duration-200 disabled:opacity-60"
              >
                {submitting ? "Redefinindo..." : "Redefinir"}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
