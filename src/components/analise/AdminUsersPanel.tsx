"use client";

import { useState } from "react";
import type { InternalRole } from "@/lib/session-scope";
import type { InternalUserSummary } from "@/lib/internal-users-types";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";

type AdminUsersPanelProps = {
  initialUsers: InternalUserSummary[];
};

const ROLE_LABEL: Record<InternalRole, string> = {
  admin: "Administrador",
  analyst: "Analista",
};

export default function AdminUsersPanel({ initialUsers }: AdminUsersPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<InternalRole>("analyst");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Informe o nome.");
      return;
    }
    if (!email.trim() || !email.includes("@")) {
      setError("Informe um e-mail válido.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/analise/admin/users/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), email: email.trim(), role }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Não foi possível criar o login.");
        return;
      }

      setCreated({ name: body.name, password: body.password });
      setUsers((prev) => [
        ...prev,
        { id: body.id, name: body.name, email: body.email, role: body.role, createdAt: new Date().toISOString() },
      ]);
      setName("");
      setEmail("");
      setRole("analyst");
    } catch {
      setError("Falha de conexão. Tente novamente.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleRevoke(id: string) {
    if (confirmingRevoke !== id) {
      setConfirmingRevoke(id);
      return;
    }
    setConfirmingRevoke(null);
    setUsers((prev) => prev.filter((u) => u.id !== id));
    await fetch(`/api/analise/admin/users/${id}/`, { method: "DELETE" }).catch(() => {});
  }

  async function copyPassword() {
    if (!created) return;
    try {
      await navigator.clipboard.writeText(created.password);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // clipboard permission denied — the password stays visible for manual copy
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h2 className="text-[13px] font-medium text-intel-text mb-4">Novo login</h2>

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="user-name" className={INTEL_LABEL}>
            Nome
          </label>
          <input
            id="user-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${INTEL_INPUT} mt-2 !py-3`}
            placeholder="Ex: Ana Souza"
          />

          <label htmlFor="user-email" className={`${INTEL_LABEL} mt-5 block`}>
            E-mail
          </label>
          <input
            id="user-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={`${INTEL_INPUT} mt-2 !py-3`}
            placeholder="ana@legadoenterprisemkt.com"
          />

          <p className={`${INTEL_LABEL} mt-5`}>Nível de acesso</p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {(["analyst", "admin"] as InternalRole[]).map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg border px-3 py-2.5 text-[13px] text-left transition-colors duration-150 ${
                  role === r
                    ? "border-intel-cyan/40 bg-intel-cyan/[0.1] text-intel-text"
                    : "border-white/10 text-intel-text-dim hover:border-white/20 hover:text-intel-text"
                }`}
              >
                <span className="block font-medium">{ROLE_LABEL[r]}</span>
                <span className="block text-[11px] text-intel-text-dim/70 mt-0.5">
                  {r === "admin" ? "Gerencia clientes e equipe" : "Só visualiza os painéis"}
                </span>
              </button>
            ))}
          </div>

          {error && (
            <p className="mt-4 text-sm text-intel-red" role="alert">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="mt-5 w-full inline-flex items-center justify-center bg-intel-cyan text-[#04121a] text-sm tracking-[0.1em] uppercase font-semibold px-6 py-3 rounded-full hover:brightness-110 transition-[filter] duration-200 disabled:opacity-60 disabled:cursor-not-allowed"
          >
            {submitting ? "Criando..." : "Criar login"}
          </button>
        </form>

        {created && (
          <div className="mt-5 rounded-xl border border-white/10 bg-intel-surface-2 p-4">
            <p className="text-[13px] font-medium text-intel-text">Login criado para {created.name}</p>
            <p className="text-xs text-intel-text-dim mt-1 mb-3">
              Essa senha só aparece agora — copie e envie à pessoa. Ela não pode ser recuperada depois.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-sm bg-intel-surface-1 border border-white/10 rounded-lg px-3 py-2 break-all text-intel-text">
                {created.password}
              </code>
              <button
                type="button"
                onClick={copyPassword}
                className="shrink-0 text-[12px] tracking-[0.08em] uppercase bg-intel-cyan text-[#04121a] font-medium px-3 py-2 rounded-lg hover:brightness-110 transition-[filter] duration-200"
              >
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <button
              type="button"
              onClick={() => setCreated(null)}
              className="mt-3 text-xs text-intel-text-dim hover:text-intel-text transition-colors duration-200"
            >
              Fechar
            </button>
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6 overflow-x-auto">
        <h2 className="text-[13px] font-medium text-intel-text mb-4">Equipe com acesso</h2>
        {users.length === 0 ? (
          <p className="text-sm text-intel-text-dim">Nenhum login de equipe criado ainda.</p>
        ) : (
          <table className="w-full min-w-[480px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3">
                  Nome
                </th>
                <th className="text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3">
                  E-mail
                </th>
                <th className="text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3">
                  Nível
                </th>
                <th className="text-right text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3" />
              </tr>
            </thead>
            <tbody>
              {users.map((user) => (
                <tr key={user.id} className="hover:bg-white/[0.03] transition-colors duration-150">
                  <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                    {user.name}
                  </td>
                  <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                    {user.email}
                  </td>
                  <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                    {ROLE_LABEL[user.role]}
                  </td>
                  <td className="py-2.5 px-3 text-right border-t border-white/[0.05]">
                    <button
                      type="button"
                      onClick={() => handleRevoke(user.id)}
                      onBlur={() => setConfirmingRevoke(null)}
                      className={`text-[12px] tracking-[0.06em] uppercase transition-colors duration-200 ${
                        confirmingRevoke === user.id
                          ? "text-intel-red font-medium"
                          : "text-intel-text-dim hover:text-intel-red"
                      }`}
                    >
                      {confirmingRevoke === user.id ? "Confirmar?" : "Revogar"}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
