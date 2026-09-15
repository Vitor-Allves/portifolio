"use client";

import { Fragment, useState } from "react";
import type { MetaAdAccount } from "@/lib/meta-ads-types";
import type { ClientAccessSummary } from "@/lib/client-access-types";
import {
  FILTER_OPTIONS,
  CAMPAIGN_COLUMN_OPTIONS,
  HIDEABLE_SECTION_OPTIONS,
  type ClientPermissions,
  type FilterKey,
  type CampaignColumnId,
  type HideableSectionId,
} from "@/lib/client-permissions";
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

function permissionsSummary(p: ClientPermissions): string {
  const hidden = p.hiddenFilters.length + p.hiddenColumns.length + p.hiddenSections.length;
  return hidden === 0 ? "Acesso completo" : `${hidden} restriç${hidden === 1 ? "ão" : "ões"}`;
}

type NewClientUser = { id: string; name: string; password: string };

// Per-client login management: each client can have several named people
// logging in, all sharing that client's account/permission scope but
// individually revocable. Kept as its own component (rather than inline in
// the table) so its create-form/reveal-password state doesn't leak between
// clients when more than one row is expanded across renders.
function ClientUsersSection({
  clientId,
  users,
  onAddUser,
  onRevokeUser,
}: {
  clientId: string;
  users: { id: string; name: string }[];
  onAddUser: (clientId: string, name: string) => Promise<NewClientUser | null>;
  onRevokeUser: (clientId: string, userId: string) => void;
}) {
  const [name, setName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<NewClientUser | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da pessoa.");
      return;
    }
    setSubmitting(true);
    const result = await onAddUser(clientId, name.trim());
    setSubmitting(false);
    if (!result) {
      setError("Não foi possível criar o login.");
      return;
    }
    setCreated(result);
    setName("");
  }

  function handleRevoke(userId: string) {
    if (confirmingRevoke !== userId) {
      setConfirmingRevoke(userId);
      return;
    }
    setConfirmingRevoke(null);
    onRevokeUser(clientId, userId);
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
    <div className="px-1 py-3">
      {users.length === 0 ? (
        <p className="text-[12px] text-intel-text-dim/70 mb-3">Nenhum login individual ainda.</p>
      ) : (
        <ul className="mb-3 divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
          {users.map((u) => (
            <li key={u.id} className="flex items-center justify-between px-3 py-2 text-[12.5px]">
              <span className="text-intel-text-dim">{u.name}</span>
              <button
                type="button"
                onClick={() => handleRevoke(u.id)}
                onBlur={() => setConfirmingRevoke(null)}
                className={`text-[11px] tracking-[0.06em] uppercase transition-colors duration-200 ${
                  confirmingRevoke === u.id ? "text-intel-red font-medium" : "text-intel-text-dim hover:text-intel-red"
                }`}
              >
                {confirmingRevoke === u.id ? "Confirmar?" : "Revogar"}
              </button>
            </li>
          ))}
        </ul>
      )}

      <form onSubmit={handleAdd} className="flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Nome da pessoa"
          className={`${INTEL_INPUT} !py-2 flex-1`}
        />
        <button
          type="submit"
          disabled={submitting}
          className="shrink-0 text-[11px] tracking-[0.08em] uppercase bg-intel-cyan/[0.14] text-intel-cyan font-medium px-3 py-2 rounded-lg hover:bg-intel-cyan/[0.22] transition-colors duration-200 disabled:opacity-60"
        >
          {submitting ? "..." : "+ Adicionar"}
        </button>
      </form>
      {error && <p className="mt-2 text-[12px] text-intel-red">{error}</p>}

      {created && (
        <div className="mt-3 rounded-lg border border-white/10 bg-intel-surface-2 p-3">
          <p className="text-[12.5px] font-medium text-intel-text">Login criado para {created.name}</p>
          <p className="text-[11px] text-intel-text-dim mt-1 mb-2">
            Copie e envie agora — não pode ser recuperada depois.
          </p>
          <div className="flex items-center gap-2">
            <code className="flex-1 text-[12.5px] bg-intel-surface-1 border border-white/10 rounded-lg px-2.5 py-1.5 break-all text-intel-text">
              {created.password}
            </code>
            <button
              type="button"
              onClick={copyPassword}
              className="shrink-0 text-[11px] tracking-[0.08em] uppercase bg-intel-cyan text-[#04121a] font-medium px-2.5 py-1.5 rounded-lg hover:brightness-110 transition-[filter] duration-200"
            >
              {copied ? "Copiado" : "Copiar"}
            </button>
          </div>
          <button
            type="button"
            onClick={() => setCreated(null)}
            className="mt-2 text-[11px] text-intel-text-dim hover:text-intel-text transition-colors duration-200"
          >
            Fechar
          </button>
        </div>
      )}
    </div>
  );
}

function toggleInSet<T>(prev: Set<T>, id: T): Set<T> {
  const next = new Set(prev);
  if (next.has(id)) next.delete(id);
  else next.add(id);
  return next;
}

function CheckboxGroup<T extends string>({
  title,
  hint,
  options,
  hiddenIds,
  onToggle,
}: {
  title: string;
  hint: string;
  options: { id: T; label: string }[];
  hiddenIds: Set<T>;
  onToggle: (id: T) => void;
}) {
  return (
    <div className="mt-5">
      <p className={INTEL_LABEL}>{title}</p>
      <p className="text-[11px] text-intel-text-dim/70 mt-0.5 mb-2">{hint}</p>
      <ul className="rounded-lg border border-white/10 divide-y divide-white/[0.06]">
        {options.map((option) => {
          const hidden = hiddenIds.has(option.id);
          return (
            <li key={option.id}>
              <button
                type="button"
                onClick={() => onToggle(option.id)}
                className="w-full flex items-center gap-3 text-left px-3 py-2 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-150"
              >
                <span
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                    hidden ? "border-white/20" : "bg-intel-cyan border-intel-cyan"
                  }`}
                  aria-hidden="true"
                >
                  {!hidden && (
                    <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                      <path d="M1 4L3.5 6.5L9 1" stroke="#070d1a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className="min-w-0 truncate">{option.label}</span>
                {hidden && <span className="ml-auto shrink-0 text-[11px] text-intel-text-dim/60">oculto</span>}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

export default function AdminClientsPanel({
  accounts,
  accountsError,
  initialClients,
}: AdminClientsPanelProps) {
  const [clients, setClients] = useState(initialClients);
  const [label, setLabel] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [hiddenFilters, setHiddenFilters] = useState<Set<FilterKey>>(new Set());
  const [hiddenColumns, setHiddenColumns] = useState<Set<CampaignColumnId>>(new Set());
  const [hiddenSections, setHiddenSections] = useState<Set<HideableSectionId>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ label: string; userName: string; password: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);

  function toggleAccount(id: string) {
    setSelectedAccountIds((prev) => toggleInSet(prev, id));
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

    const permissions: ClientPermissions = {
      hiddenFilters: [...hiddenFilters],
      hiddenColumns: [...hiddenColumns],
      hiddenSections: [...hiddenSections],
    };

    setSubmitting(true);
    try {
      const res = await fetch("/api/analise/admin/clients/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: label.trim(), accountIds: [...selectedAccountIds], permissions }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Não foi possível criar o acesso.");
        return;
      }

      setCreated({ label: body.label, userName: body.userName, password: body.password });
      setClients((prev) => [
        {
          id: body.id,
          slug: "",
          label: body.label,
          accountIds: [...selectedAccountIds],
          permissions,
          createdAt: new Date().toISOString(),
          users: [{ id: body.userId, name: body.userName, createdAt: new Date().toISOString() }],
        },
        ...prev,
      ]);
      setLabel("");
      setSelectedAccountIds(new Set());
      setHiddenFilters(new Set());
      setHiddenColumns(new Set());
      setHiddenSections(new Set());
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

  async function handleAddUser(clientId: string, name: string) {
    try {
      const res = await fetch(`/api/analise/admin/clients/${clientId}/users/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = await res.json();
      if (!res.ok) return null;

      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? { ...c, users: [...c.users, { id: body.id, name: body.name, createdAt: new Date().toISOString() }] }
            : c
        )
      );
      return { id: body.id, name: body.name, password: body.password };
    } catch {
      return null;
    }
  }

  function handleRevokeUser(clientId: string, userId: string) {
    setClients((prev) =>
      prev.map((c) => (c.id === clientId ? { ...c, users: c.users.filter((u) => u.id !== userId) } : c))
    );
    fetch(`/api/analise/admin/clients/${clientId}/users/${userId}/`, { method: "DELETE" }).catch(() => {});
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
                      <span className="min-w-0 truncate">{account.name}</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}

          <details className="mt-5 group">
            <summary className="cursor-pointer text-[12px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200">
              Restringir filtros, colunas e seções (opcional)
            </summary>
            <p className="text-[11px] text-intel-text-dim/70 mt-2">
              Por padrão o cliente vê tudo (exceto o admin). Marque abaixo só o que esse cliente deve ver — o resto fica oculto.
            </p>

            <CheckboxGroup
              title="Filtros disponíveis"
              hint="Filtros desmarcados somem da barra de filtros para esse cliente."
              options={FILTER_OPTIONS}
              hiddenIds={hiddenFilters}
              onToggle={(id: FilterKey) => setHiddenFilters((prev) => toggleInSet(prev, id))}
            />

            <CheckboxGroup
              title="Colunas da tabela de campanhas"
              hint="Colunas desmarcadas não aparecem na tabela nem no seletor de colunas."
              options={CAMPAIGN_COLUMN_OPTIONS}
              hiddenIds={hiddenColumns}
              onToggle={(id: CampaignColumnId) => setHiddenColumns((prev) => toggleInSet(prev, id))}
            />

            <CheckboxGroup
              title="Seções do menu"
              hint="Seções desmarcadas somem do menu lateral. 'Visão geral' fica sempre disponível."
              options={HIDEABLE_SECTION_OPTIONS}
              hiddenIds={hiddenSections}
              onToggle={(id: HideableSectionId) => setHiddenSections((prev) => toggleInSet(prev, id))}
            />
          </details>

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
              Acesso criado para {created.userName} ({created.label})
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
                <th className="text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3">
                  Permissões
                </th>
                <th className="text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3">
                  Logins
                </th>
                <th className="text-right text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3" />
              </tr>
            </thead>
            <tbody>
              {clients.map((client) => {
                const expanded = expandedClientId === client.id;
                return (
                  <Fragment key={client.id}>
                    <tr className="hover:bg-white/[0.03] transition-colors duration-150">
                      <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                        {client.label}
                      </td>
                      <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                        {accountNames(client.accountIds, accounts)}
                      </td>
                      <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                        {permissionsSummary(client.permissions)}
                      </td>
                      <td className="py-2.5 px-3 text-[13px] border-t border-white/[0.05]">
                        <button
                          type="button"
                          onClick={() => setExpandedClientId(expanded ? null : client.id)}
                          className="text-intel-text-dim hover:text-intel-cyan transition-colors duration-200"
                        >
                          {client.users.length} pessoa{client.users.length === 1 ? "" : "s"}{" "}
                          <span aria-hidden="true">{expanded ? "▲" : "▼"}</span>
                        </button>
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
                    {expanded && (
                      <tr>
                        <td colSpan={5} className="border-t border-white/[0.05] bg-intel-surface-2/40 px-2">
                          <ClientUsersSection
                            clientId={client.id}
                            users={client.users}
                            onAddUser={handleAddUser}
                            onRevokeUser={handleRevokeUser}
                          />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
