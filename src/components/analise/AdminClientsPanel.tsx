"use client";

import { useState } from "react";
import type { MetaAdAccount } from "@/lib/meta-ads-types";
import type { ClientAccessSummary } from "@/lib/client-access-types";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";

type AdminClientsPanelProps = {
  accounts: MetaAdAccount[];
  accountsError: string | null;
  initialClients: ClientAccessSummary[];
};

function accountNames(accountIds: string[], accounts: MetaAdAccount[]): string {
  const byId = new Map(accounts.map((a) => [a.id, a.name]));
  return accountIds.map((id) => byId.get(id) ?? id).join(", ");
}

export default function AdminClientsPanel({
  accounts,
  accountsError,
  initialClients,
}: AdminClientsPanelProps) {
  const [clients, setClients] = useState(initialClients);
  const [label, setLabel] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ label: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!label.trim()) {
      setError("Informe o nome do cliente.");
      return;
    }
    if (selectedAccountIds.size === 0) {
      setError("Selecione ao menos uma conta de anúncios.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/analise/admin/clients/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), accountIds: [...selectedAccountIds] }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Não foi possível criar o acesso.");
        return;
      }

      setCreated({ label: body.label, password: body.password });
      setClients((prev) => [
        {
          id: body.id,
          slug: "",
          label: body.label,
          accountIds: [...selectedAccountIds],
          createdAt: new Date().toISOString(),
        },
        ...prev,
      ]);
      setLabel("");
      setSelectedAccountIds(new Set());
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
    setClients((prev) => prev.filter((c) => c.id !== id));
    await fetch(`/api/analise/admin/clients/${id}/`, { method: "DELETE" }).catch(() => {});
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
    <div className="grid lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h2 className="text-[13px] font-medium text-intel-text mb-4">Novo acesso</h2>

        {accountsError && (
          <p className="mb-4 text-sm text-intel-red">{accountsError}</p>
        )}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="client-label" className={INTEL_LABEL}>
            Nome do cliente
          </label>
          <input
            id="client-label"
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            className={`${INTEL_INPUT} mt-2 !py-3`}
            placeholder="Ex: Açaí da Barra - Piedade"
          />

          <p className={`${INTEL_LABEL} mt-5`}>Contas de anúncios</p>
          {accounts.length === 0 ? (
            <p className="text-sm text-intel-text-dim mt-2">Nenhuma conta disponível.</p>
          ) : (
            <ul className="mt-2 max-h-56 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/[0.06]">
              {accounts.map((account) => {
                const checked = selectedAccountIds.has(account.id);
                return (
                  <li key={account.id}>
                    <button
                      type="button"
                      onClick={() => toggleAccount(account.id)}
                      className="w-full flex items-center gap-3 text-left px-3 py-2.5 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-150"
                    >
                      <span
                        className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                          checked ? "bg-intel-cyan border-intel-cyan" : "border-white/20"
                        }`}
                        aria-hidden="true"
                      >
                        {checked && (
                          <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                            <path
                              d="M1 4L3.5 6.5L9 1"
                              stroke="#070d1a"
                              strokeWidth="1.6"
                              strokeLinecap="round"
                              strokeLinejoin="round"
                            />
                          </svg>
                        )}
                      </span>
                      <span className="truncate">{account.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

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
            {submitting ? "Criando..." : "Criar acesso"}
          </button>
        </form>

        {created && (
          <div className="mt-5 rounded-xl border border-white/10 bg-intel-surface-2 p-4">
            <p className="text-[13px] font-medium text-intel-text">
              Acesso criado para {created.label}
            </p>
            <p className="text-xs text-intel-text-dim mt-1 mb-3">
              Essa senha só aparece agora — copie e envie ao cliente. Ela não pode ser recuperada depois.
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
        <h2 className="text-[13px] font-medium text-intel-text mb-4">Clientes com acesso</h2>
        {clients.length === 0 ? (
          <p className="text-sm text-intel-text-dim">Nenhum cliente com acesso ainda.</p>
        ) : (
          <table className="w-full min-w-[560px] border-collapse">
            <thead>
              <tr>
                <th className="text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3">
                  Cliente
                </th>
                <th className="text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3">
                  Contas
                </th>
                <th className="text-right text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => (
                <tr key={client.id} className="hover:bg-white/[0.03] transition-colors duration-150">
                  <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                    {client.label}
                  </td>
                  <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                    {accountNames(client.accountIds, accounts)}
                  </td>
                  <td className="py-2.5 px-3 text-right border-t border-white/[0.05]">
                    <button
                      type="button"
                      onClick={() => handleRevoke(client.id)}
                      onBlur={() => setConfirmingRevoke(null)}
                      className={`text-[12px] tracking-[0.06em] uppercase transition-colors duration-200 ${
                        confirmingRevoke === client.id
                          ? "text-intel-red font-medium"
                          : "text-intel-text-dim hover:text-intel-red"
                      }`}
                    >
                      {confirmingRevoke === client.id ? "Confirmar?" : "Revogar"}
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
