"use client";

import { Fragment, useMemo, useState } from "react";
import type { MetaAdAccount } from "@/lib/meta-ads-types";
import type { ClientAccessSummary, ClientAccessUserSummary } from "@/lib/client-access-types";
import { EMPTY_PERMISSIONS, type ClientPermissions } from "@/lib/client-permissions";
import { USERNAME_RULES_HELP } from "@/lib/username";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";
import PermissionsEditor, { permissionsSummary } from "./PermissionsEditor";
import PasswordRevealBox from "./PasswordRevealBox";
import ResetPasswordModal from "./ResetPasswordModal";

type AdminClientsPanelProps = {
  accounts: MetaAdAccount[];
  accountsError: string | null;
  initialClients: ClientAccessSummary[];
};

function accountNames(accountIds: string[], accounts: MetaAdAccount[]): string {
  const byId = new Map(accounts.map((a) => [a.id, a.name]));
  return accountIds.map((id) => byId.get(id) ?? id).join(", ");
}

type NewClientUser = { id: string; name: string; username: string; password: string };

// Per-company login management: each company (a registered business, kept
// deliberately distinct from the people who log in under it) can have
// several named people, sharing the company's account/permission scope by
// default but individually revocable and, when needed, individually
// overridden. Kept as its own component so its create-form/reveal-password
// state doesn't leak between companies when more than one row is expanded.
/** Inline edit form for one person's login — name, username, and an optional permission override that replaces the company's default entirely for them. */
function EditClientUserRow({
  user,
  companyPermissions,
  onSave,
  onCancel,
}: {
  user: ClientAccessUserSummary;
  companyPermissions: ClientPermissions;
  onSave: (userId: string, input: { name: string; username: string; permissionsOverride: ClientPermissions | null | undefined }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [useOverride, setUseOverride] = useState(user.hasPermissionsOverride);
  const [override, setOverride] = useState<ClientPermissions>(user.hasPermissionsOverride ? user.permissions : companyPermissions);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da pessoa.");
      return;
    }
    setSubmitting(true);
    const err = await onSave(user.id, {
      name: name.trim(),
      username: username.trim(),
      permissionsOverride: useOverride ? override : null,
    });
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <li className="px-3 py-3 bg-white/[0.02]">
      <form onSubmit={handleSubmit} className="space-y-2">
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome" className={`${INTEL_INPUT} !py-2 flex-1`} />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="usuário"
            autoCapitalize="off"
            autoCorrect="off"
            className={`${INTEL_INPUT} !py-2 flex-1 font-mono`}
          />
        </div>
        <label className="flex items-center gap-2 text-[12px] text-intel-text-dim">
          <input type="checkbox" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} />
          Permissão individual (senão herda da empresa)
        </label>
        {useOverride && <PermissionsEditor permissions={override} onChange={setOverride} />}
        {error && <p className="text-[12px] text-intel-red">{error}</p>}
        <div className="flex items-center gap-2 pt-1">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-white/15 px-3 py-1.5 text-[11px] tracking-[0.08em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={submitting}
            className="rounded-full bg-intel-cyan px-3 py-1.5 text-[11px] font-semibold tracking-[0.08em] uppercase text-[#04121a] hover:brightness-110 transition-[filter] duration-200 disabled:opacity-60"
          >
            {submitting ? "Salvando..." : "Salvar"}
          </button>
        </div>
      </form>
    </li>
  );
}

function ClientUsersSection({
  clientId,
  users,
  companyPermissions,
  onAddUser,
  onRevokeUser,
  onSaveUser,
}: {
  clientId: string;
  users: ClientAccessUserSummary[];
  companyPermissions: ClientPermissions;
  onAddUser: (clientId: string, input: { name: string; username: string; password: string; confirmPassword: string; permissionsOverride: ClientPermissions | null }) => Promise<NewClientUser | null>;
  onRevokeUser: (clientId: string, userId: string) => void;
  onSaveUser: (clientId: string, userId: string, input: { name: string; username: string; permissionsOverride: ClientPermissions | null | undefined }) => Promise<string | null>;
}) {
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [useOverride, setUseOverride] = useState(false);
  const [override, setOverride] = useState<ClientPermissions>(companyPermissions);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<NewClientUser | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<ClientAccessUserSummary | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!name.trim()) {
      setError("Informe o nome da pessoa.");
      return;
    }
    if (password.length < 8) {
      setError("A senha deve ter ao menos 8 caracteres.");
      return;
    }
    if (password !== confirmPassword) {
      setError("As senhas não coincidem.");
      return;
    }
    setSubmitting(true);
    const result = await onAddUser(clientId, {
      name: name.trim(),
      username: username.trim(),
      password,
      confirmPassword,
      permissionsOverride: useOverride ? override : null,
    });
    setSubmitting(false);
    if (!result) {
      setError("Não foi possível criar o login.");
      return;
    }
    setCreated(result);
    setName("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");
    setUseOverride(false);
  }

  function handleRevoke(userId: string) {
    if (confirmingRevoke !== userId) {
      setConfirmingRevoke(userId);
      return;
    }
    setConfirmingRevoke(null);
    onRevokeUser(clientId, userId);
  }

  return (
    <div className="px-1 py-3">
      <p className="text-[11px] font-medium tracking-[0.08em] uppercase text-intel-text-dim mb-2">Pessoas com acesso</p>
      {users.length === 0 ? (
        <p className="text-[12px] text-intel-text-dim/70 mb-3">Nenhuma pessoa com acesso ainda.</p>
      ) : (
        <ul className="mb-3 divide-y divide-white/[0.05] rounded-lg border border-white/[0.06]">
          {users.map((u) =>
            editingUserId === u.id ? (
              <EditClientUserRow
                key={u.id}
                user={u}
                companyPermissions={companyPermissions}
                onSave={async (userId, input) => {
                  const err = await onSaveUser(clientId, userId, input);
                  if (!err) setEditingUserId(null);
                  return err;
                }}
                onCancel={() => setEditingUserId(null)}
              />
            ) : (
              <li key={u.id} className="flex items-center justify-between gap-2 px-3 py-2 text-[12.5px]">
                <span className="text-intel-text-dim min-w-0">
                  <span className="text-intel-text">{u.name}</span>{" "}
                  <span className="font-mono text-intel-text-dim/70">{u.username}</span>
                  {u.hasPermissionsOverride && <span className="ml-2 text-[10.5px] uppercase tracking-[0.06em] text-intel-violet">override</span>}
                  {u.mustChangePassword && <span className="ml-2 text-[10.5px] uppercase tracking-[0.06em] text-amber-300/80">1º acesso pendente</span>}
                </span>
                <span className="flex shrink-0 items-center gap-3">
                  <button
                    type="button"
                    onClick={() => setEditingUserId(u.id)}
                    className="text-[11px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-cyan transition-colors duration-200"
                  >
                    Editar
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetTarget(u)}
                    className="text-[11px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-cyan transition-colors duration-200"
                  >
                    Resetar senha
                  </button>
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
                </span>
              </li>
            )
          )}
        </ul>
      )}

      <form onSubmit={handleAdd} className="space-y-2">
        <div className="flex items-center gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nome da pessoa" className={`${INTEL_INPUT} !py-2 flex-1`} />
          <input
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            placeholder="usuário"
            autoCapitalize="off"
            autoCorrect="off"
            className={`${INTEL_INPUT} !py-2 flex-1 font-mono`}
          />
        </div>
        <div className="flex items-center gap-2">
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Senha inicial"
            minLength={8}
            className={`${INTEL_INPUT} !py-2 flex-1`}
          />
          <input
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Confirmar senha"
            minLength={8}
            className={`${INTEL_INPUT} !py-2 flex-1`}
          />
          <button
            type="submit"
            disabled={submitting}
            className="shrink-0 text-[11px] tracking-[0.08em] uppercase bg-intel-cyan/[0.14] text-intel-cyan font-medium px-3 py-2 rounded-lg hover:bg-intel-cyan/[0.22] transition-colors duration-200 disabled:opacity-60"
          >
            {submitting ? "..." : "+ Adicionar"}
          </button>
        </div>
        <p className="text-[10.5px] text-intel-text-dim/60">{USERNAME_RULES_HELP}</p>

        <details className="group">
          <summary className="cursor-pointer text-[11px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200">
            Permissão individual (opcional — por padrão herda da empresa)
          </summary>
          <label className="mt-2 flex items-center gap-2 text-[12px] text-intel-text-dim">
            <input type="checkbox" checked={useOverride} onChange={(e) => setUseOverride(e.target.checked)} />
            Definir permissões específicas para esta pessoa
          </label>
          {useOverride && <PermissionsEditor permissions={override} onChange={setOverride} />}
        </details>
      </form>
      {error && <p className="mt-2 text-[12px] text-intel-red">{error}</p>}

      {created && (
        <PasswordRevealBox
          title={`Login criado para ${created.name}`}
          hint="Copie e entregue por um canal privado — não pode ser recuperada depois."
          password={created.password}
          onClose={() => setCreated(null)}
        />
      )}

      {resetTarget && (
        <ResetPasswordModal
          targetName={resetTarget.name}
          targetUsername={resetTarget.username}
          endpoint={`/api/analise/admin/clients/${clientId}/users/${resetTarget.id}/reset-password/`}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}

/** Inline edit form for the company itself — name, authorized accounts and default permissions. Separate from editing any one person under it. */
function EditClientCompanyRow({
  client,
  accounts,
  onSave,
  onCancel,
}: {
  client: ClientAccessSummary;
  accounts: MetaAdAccount[];
  onSave: (id: string, input: { label: string; accountIds: string[]; permissions: ClientPermissions }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(client.label);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set(client.accountIds));
  const [permissions, setPermissions] = useState<ClientPermissions>(client.permissions);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError("Informe o nome da empresa.");
      return;
    }
    if (selectedAccountIds.size === 0) {
      setError("Selecione ao menos uma conta de anúncios.");
      return;
    }
    setSubmitting(true);
    const err = await onSave(client.id, { label: label.trim(), accountIds: [...selectedAccountIds], permissions });
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <tr>
      <td colSpan={5} className="border-t border-white/[0.05] bg-intel-surface-2/40 px-4 py-4">
        <form onSubmit={handleSubmit}>
          <label className={INTEL_LABEL}>Nome da empresa</label>
          <input value={label} onChange={(e) => setLabel(e.target.value)} className={`${INTEL_INPUT} mt-2 !py-2.5 max-w-sm`} />

          <p className={`${INTEL_LABEL} mt-4`}>Contas de anúncios</p>
          <ul className="mt-2 max-h-48 overflow-y-auto max-w-sm rounded-lg border border-white/10 divide-y divide-white/[0.06]">
            {accounts.map((account) => {
              const checked = selectedAccountIds.has(account.id);
              return (
                <li key={account.id}>
                  <button
                    type="button"
                    onClick={() => toggleAccount(account.id)}
                    className="w-full flex items-center gap-3 text-left px-3 py-2 text-[13px] text-intel-text-dim hover:bg-white/[0.04] hover:text-intel-text transition-colors duration-150"
                  >
                    <span
                      className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition-colors duration-150 ${
                        checked ? "bg-intel-cyan border-intel-cyan" : "border-white/20"
                      }`}
                      aria-hidden="true"
                    >
                      {checked && (
                        <svg width="10" height="8" viewBox="0 0 10 8" fill="none">
                          <path d="M1 4L3.5 6.5L9 1" stroke="#070d1a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                    </span>
                    <span className="min-w-0 truncate">{account.name}</span>
                  </button>
                </li>
              );
            })}
          </ul>

          <details className="mt-4 group">
            <summary className="cursor-pointer text-[12px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200">
              Permissões padrão da empresa
            </summary>
            <PermissionsEditor permissions={permissions} onChange={setPermissions} />
          </details>

          {error && <p className="mt-3 text-[12.5px] text-intel-red">{error}</p>}

          <div className="mt-4 flex items-center gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-full border border-white/15 px-4 py-2 text-[12px] tracking-[0.08em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="rounded-full bg-intel-cyan px-4 py-2 text-[12px] font-semibold tracking-[0.08em] uppercase text-[#04121a] hover:brightness-110 transition-[filter] duration-200 disabled:opacity-60"
            >
              {submitting ? "Salvando..." : "Salvar alterações"}
            </button>
          </div>
        </form>
      </td>
    </tr>
  );
}

export default function AdminClientsPanel({ accounts, accountsError, initialClients }: AdminClientsPanelProps) {
  const [clients, setClients] = useState(initialClients);
  const [label, setLabel] = useState("");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [permissions, setPermissions] = useState<ClientPermissions>(EMPTY_PERMISSIONS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ label: string } | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);
  const [expandedClientId, setExpandedClientId] = useState<string | null>(null);
  const [editingClientId, setEditingClientId] = useState<string | null>(null);
  const [search, setSearch] = useState("");

  const filteredClients = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return clients;
    return clients.filter((c) => c.label.toLowerCase().includes(q) || c.users.some((u) => u.name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)));
  }, [clients, search]);

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
      setError("Informe o nome da empresa.");
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
        body: JSON.stringify({ label: label.trim(), accountIds: [...selectedAccountIds], permissions }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Não foi possível criar a empresa.");
        return;
      }

      setCreated({ label: body.label });
      setClients((prev) => [
        {
          id: body.id,
          slug: "",
          label: body.label,
          accountIds: [...selectedAccountIds],
          permissions,
          createdAt: new Date().toISOString(),
          users: [],
        },
        ...prev,
      ]);
      setExpandedClientId(body.id);
      setLabel("");
      setSelectedAccountIds(new Set());
      setPermissions(EMPTY_PERMISSIONS);
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

  async function handleAddUser(
    clientId: string,
    input: { name: string; username: string; password: string; confirmPassword: string; permissionsOverride: ClientPermissions | null }
  ) {
    try {
      const res = await fetch(`/api/analise/admin/clients/${clientId}/users/`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) return null;

      const companyPermissions = clients.find((c) => c.id === clientId)?.permissions ?? EMPTY_PERMISSIONS;
      const newUser: ClientAccessUserSummary = {
        id: body.id,
        name: body.name,
        username: input.username.trim().toLowerCase(),
        hasPermissionsOverride: Boolean(input.permissionsOverride),
        permissions: input.permissionsOverride ?? companyPermissions,
        mustChangePassword: true,
        createdAt: new Date().toISOString(),
      };
      setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, users: [...c.users, newUser] } : c)));
      return { id: body.id, name: body.name, username: newUser.username, password: input.password };
    } catch {
      return null;
    }
  }

  function handleRevokeUser(clientId: string, userId: string) {
    setClients((prev) => prev.map((c) => (c.id === clientId ? { ...c, users: c.users.filter((u) => u.id !== userId) } : c)));
    fetch(`/api/analise/admin/clients/${clientId}/users/${userId}/`, { method: "DELETE" }).catch(() => {});
  }

  async function handleSaveClientUser(
    clientId: string,
    userId: string,
    input: { name: string; username: string; permissionsOverride: ClientPermissions | null | undefined }
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/analise/admin/clients/${clientId}/users/${userId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) return body?.error ?? "Não foi possível salvar as alterações.";

      setClients((prev) =>
        prev.map((c) => {
          if (c.id !== clientId) return c;
          return {
            ...c,
            users: c.users.map((u) =>
              u.id === userId
                ? {
                    ...u,
                    name: input.name,
                    username: input.username.toLowerCase(),
                    hasPermissionsOverride: Boolean(input.permissionsOverride),
                    permissions: input.permissionsOverride ?? c.permissions,
                  }
                : u
            ),
          };
        })
      );
      return null;
    } catch {
      return "Falha de conexão. Tente novamente.";
    }
  }

  async function handleSaveClientEdit(
    clientId: string,
    input: { label: string; accountIds: string[]; permissions: ClientPermissions }
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/analise/admin/clients/${clientId}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) return body?.error ?? "Não foi possível salvar as alterações.";

      setClients((prev) =>
        prev.map((c) =>
          c.id === clientId
            ? {
                ...c,
                label: input.label,
                accountIds: input.accountIds,
                permissions: input.permissions,
                // A person without their own override still inherits whatever the
                // company's permissions are now — refresh their displayed summary too.
                users: c.users.map((u) => (u.hasPermissionsOverride ? u : { ...u, permissions: input.permissions })),
              }
            : c
        )
      );
      setEditingClientId(null);
      return null;
    } catch {
      return "Falha de conexão. Tente novamente.";
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-4">Nova empresa</h3>

        {accountsError && <p className="mb-4 text-sm text-intel-red">{accountsError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="client-label" className={INTEL_LABEL}>
            Nome da empresa
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
                            <path d="M1 4L3.5 6.5L9 1" stroke="#070d1a" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
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
              Permissões padrão da empresa (opcional)
            </summary>
            <p className="text-[11px] text-intel-text-dim/70 mt-2">
              Aplicadas a toda pessoa dessa empresa, exceto quem tiver uma permissão individual definida.
            </p>
            <PermissionsEditor permissions={permissions} onChange={setPermissions} />
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
            {submitting ? "Criando..." : "Criar empresa"}
          </button>
        </form>

        {created && (
          <div className="mt-5 rounded-xl border border-white/10 bg-intel-surface-2 p-4">
            <p className="text-[13px] font-medium text-intel-text">Empresa {created.label} criada</p>
            <p className="text-xs text-intel-text-dim mt-1">
              Agora adicione as pessoas que terão acesso a ela na lista ao lado.
            </p>
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
        <div className="flex items-center justify-between gap-4 mb-4">
          <h3 className="text-[13px] font-medium text-intel-text">Empresas e pessoas com acesso</h3>
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar empresa ou pessoa..."
            className={`${INTEL_INPUT} !py-2 max-w-[220px]`}
          />
        </div>
        {filteredClients.length === 0 ? (
          <p className="text-sm text-intel-text-dim">Nenhuma empresa encontrada.</p>
        ) : (
          <table className="w-full min-w-[620px] border-collapse">
            <thead>
              <tr>
                {["Empresa", "Contas", "Permissões padrão", "Pessoas", ""].map((h) => (
                  <th
                    key={h}
                    className={`text-left text-[10.5px] tracking-[0.1em] uppercase text-intel-text-dim font-medium py-2.5 px-3 ${h === "" ? "text-right" : ""}`}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filteredClients.map((client) => {
                const expanded = expandedClientId === client.id;
                return (
                  <Fragment key={client.id}>
                    <tr className="hover:bg-white/[0.03] transition-colors duration-150">
                      <td className="py-2.5 px-3 text-[13px] text-intel-text border-t border-white/[0.05] font-medium">
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
                      <td className="py-2.5 px-3 text-right border-t border-white/[0.05] whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => setEditingClientId(editingClientId === client.id ? null : client.id)}
                          className="text-[12px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-cyan transition-colors duration-200 mr-4"
                        >
                          {editingClientId === client.id ? "Fechar" : "Editar"}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRevoke(client.id)}
                          onBlur={() => setConfirmingRevoke(null)}
                          className={`text-[12px] tracking-[0.06em] uppercase transition-colors duration-200 ${
                            confirmingRevoke === client.id ? "text-intel-red font-medium" : "text-intel-text-dim hover:text-intel-red"
                          }`}
                        >
                          {confirmingRevoke === client.id ? "Confirmar?" : "Revogar"}
                        </button>
                      </td>
                    </tr>
                    {editingClientId === client.id && (
                      <EditClientCompanyRow
                        client={client}
                        accounts={accounts}
                        onSave={handleSaveClientEdit}
                        onCancel={() => setEditingClientId(null)}
                      />
                    )}
                    {expanded && (
                      <tr>
                        <td colSpan={5} className="border-t border-white/[0.05] bg-intel-surface-2/40 px-2">
                          <ClientUsersSection
                            clientId={client.id}
                            users={client.users}
                            companyPermissions={client.permissions}
                            onAddUser={handleAddUser}
                            onRevokeUser={handleRevokeUser}
                            onSaveUser={handleSaveClientUser}
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
