"use client";

import { Fragment, useState } from "react";
import type { MetaAdAccount } from "@/lib/meta-ads-types";
import { STAFF_ROLES, STAFF_ROLE_LABELS, type StaffRole } from "@/lib/session-scope";
import type { InternalUserSummary } from "@/lib/internal-users-types";
import { USERNAME_RULES_HELP } from "@/lib/username";
import { EMPTY_PERMISSIONS, type ClientPermissions } from "@/lib/client-permissions";
import { INTEL_INPUT, INTEL_LABEL } from "./intel-styles";
import PermissionsEditor, { permissionsSummary } from "./PermissionsEditor";
import PasswordRevealBox from "./PasswordRevealBox";
import ResetPasswordModal from "./ResetPasswordModal";

type AdminUsersPanelProps = {
  accounts: MetaAdAccount[];
  accountsError: string | null;
  initialUsers: InternalUserSummary[];
};

const ROLE_HINT: Record<StaffRole, string> = {
  administrador_geral: "Gerencia usuários, acessos e permissões. Vê todas as empresas. Exige 2FA.",
  administrador: "Acesso amplo às empresas atribuídas, sem gerenciar outros usuários.",
  gestor: "Acompanha e gera relatórios das empresas atribuídas.",
  analista: "Visualiza os dados das empresas atribuídas.",
};

function accountNames(accountIds: string[], accounts: MetaAdAccount[]): string {
  const byId = new Map(accounts.map((a) => [a.id, a.name]));
  return accountIds.map((id) => byId.get(id) ?? id).join(", ");
}

function AccountsChecklist({
  accounts,
  selected,
  onToggle,
}: {
  accounts: MetaAdAccount[];
  selected: Set<string>;
  onToggle: (id: string) => void;
}) {
  if (accounts.length === 0) {
    return <p className="text-sm text-intel-text-dim mt-2">Nenhuma conta disponível.</p>;
  }
  return (
    <ul className="mt-2 max-h-48 overflow-y-auto rounded-lg border border-white/10 divide-y divide-white/[0.06]">
      {accounts.map((account) => {
        const checked = selected.has(account.id);
        return (
          <li key={account.id}>
            <button
              type="button"
              onClick={() => onToggle(account.id)}
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
  );
}

/** Inline edit form for an existing staff account — name, username, role, authorized companies and permissions. Reset/revoke stay separate actions (not part of this form), matching the brief's "revogar acesso separado do formulário". */
function EditStaffRow({
  user,
  accounts,
  onSave,
  onCancel,
}: {
  user: InternalUserSummary;
  accounts: MetaAdAccount[];
  onSave: (id: string, input: { name: string; username: string; role: StaffRole; accountIds: string[]; permissions: ClientPermissions }) => Promise<string | null>;
  onCancel: () => void;
}) {
  const [name, setName] = useState(user.name);
  const [username, setUsername] = useState(user.username);
  const [role, setRole] = useState<StaffRole>(user.role);
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set(user.accountIds));
  const [permissions, setPermissions] = useState<ClientPermissions>(user.permissions);
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
    if (!name.trim()) {
      setError("Informe o nome.");
      return;
    }
    if (role !== "administrador_geral" && selectedAccountIds.size === 0) {
      setError("Selecione ao menos uma empresa autorizada.");
      return;
    }
    setSubmitting(true);
    const err = await onSave(user.id, { name: name.trim(), username: username.trim(), role, accountIds: [...selectedAccountIds], permissions });
    setSubmitting(false);
    if (err) setError(err);
  }

  return (
    <tr>
      <td colSpan={6} className="border-t border-white/[0.05] bg-intel-surface-2/40 px-4 py-4">
        <form onSubmit={handleSubmit}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className={INTEL_LABEL}>Nome completo</label>
              <input value={name} onChange={(e) => setName(e.target.value)} className={`${INTEL_INPUT} mt-2 !py-2.5`} />
            </div>
            <div>
              <label className={INTEL_LABEL}>Nome de usuário</label>
              <input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                className={`${INTEL_INPUT} mt-2 !py-2.5 font-mono`}
                autoCapitalize="off"
                autoCorrect="off"
              />
            </div>
          </div>

          <p className={`${INTEL_LABEL} mt-4`}>Perfil de acesso</p>
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STAFF_ROLES.map((r) => (
              <button
                key={r}
                type="button"
                onClick={() => setRole(r)}
                className={`rounded-lg border px-3 py-2 text-[12.5px] text-left transition-colors duration-150 ${
                  role === r ? "border-intel-cyan/40 bg-intel-cyan/[0.1] text-intel-text" : "border-white/10 text-intel-text-dim hover:border-white/20"
                }`}
              >
                {STAFF_ROLE_LABELS[r]}
              </button>
            ))}
          </div>

          {role !== "administrador_geral" && (
            <>
              <p className={`${INTEL_LABEL} mt-4`}>Empresas autorizadas</p>
              <AccountsChecklist accounts={accounts} selected={selectedAccountIds} onToggle={toggleAccount} />
            </>
          )}

          <details className="mt-4 group">
            <summary className="cursor-pointer text-[12px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200">
              Permissões de módulos e ações
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

export default function AdminUsersPanel({ accounts, accountsError, initialUsers }: AdminUsersPanelProps) {
  const [users, setUsers] = useState(initialUsers);
  const [name, setName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [role, setRole] = useState<StaffRole>("analista");
  const [selectedAccountIds, setSelectedAccountIds] = useState<Set<string>>(new Set());
  const [permissions, setPermissions] = useState<ClientPermissions>(EMPTY_PERMISSIONS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ name: string; password: string } | null>(null);
  const [confirmingRevoke, setConfirmingRevoke] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<InternalUserSummary | null>(null);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);

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

    if (!name.trim()) {
      setError("Informe o nome.");
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
    if (role !== "administrador_geral" && selectedAccountIds.size === 0) {
      setError("Selecione ao menos uma empresa autorizada.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch("/api/analise/admin/users/", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: name.trim(),
          username: username.trim(),
          password,
          confirmPassword,
          role,
          accountIds: [...selectedAccountIds],
          permissions,
        }),
      });
      const body = await res.json();
      if (!res.ok) {
        setError(body?.error ?? "Não foi possível criar o login.");
        return;
      }

      setCreated({ name: name.trim(), password });
      setUsers((prev) => [
        ...prev,
        {
          id: body.id,
          name: name.trim(),
          username: username.trim().toLowerCase(),
          email: null,
          role,
          accountIds: [...selectedAccountIds],
          permissions,
          totpEnabled: false,
          mustChangePassword: true,
          createdAt: new Date().toISOString(),
        },
      ]);
      setName("");
      setUsername("");
      setPassword("");
      setConfirmPassword("");
      setRole("analista");
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
    setUsers((prev) => prev.filter((u) => u.id !== id));
    await fetch(`/api/analise/admin/users/${id}/`, { method: "DELETE" }).catch(() => {});
  }

  async function handleSaveEdit(
    id: string,
    input: { name: string; username: string; role: StaffRole; accountIds: string[]; permissions: ClientPermissions }
  ): Promise<string | null> {
    try {
      const res = await fetch(`/api/analise/admin/users/${id}/`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      const body = await res.json();
      if (!res.ok) return body?.error ?? "Não foi possível salvar as alterações.";

      setUsers((prev) =>
        prev.map((u) =>
          u.id === id
            ? { ...u, name: input.name, username: input.username.toLowerCase(), role: input.role, accountIds: input.accountIds, permissions: input.permissions }
            : u
        )
      );
      setEditingUserId(null);
      return null;
    } catch {
      return "Falha de conexão. Tente novamente.";
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-6 items-start">
      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6">
        <h3 className="text-[13px] font-medium text-intel-text mb-4">Novo login</h3>

        {accountsError && <p className="mb-4 text-sm text-intel-red">{accountsError}</p>}

        <form onSubmit={handleSubmit} noValidate>
          <label htmlFor="staff-name" className={INTEL_LABEL}>
            Nome completo
          </label>
          <input
            id="staff-name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            className={`${INTEL_INPUT} mt-2 !py-3`}
            placeholder="Ex: Ana Souza"
          />

          <label htmlFor="staff-username" className={`${INTEL_LABEL} mt-5 block`}>
            Nome de usuário
          </label>
          <input
            id="staff-username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className={`${INTEL_INPUT} mt-2 !py-3`}
            placeholder="ex: ana.souza"
            autoCapitalize="off"
            autoCorrect="off"
          />
          <p className="text-[11px] text-intel-text-dim/70 mt-1">{USERNAME_RULES_HELP}</p>

          <label htmlFor="staff-password" className={`${INTEL_LABEL} mt-5 block`}>
            Senha inicial
          </label>
          <input
            id="staff-password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={`${INTEL_INPUT} mt-2 !py-3`}
            minLength={8}
          />

          <label htmlFor="staff-password-confirm" className={`${INTEL_LABEL} mt-5 block`}>
            Confirmar senha
          </label>
          <input
            id="staff-password-confirm"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            className={`${INTEL_INPUT} mt-2 !py-3`}
            minLength={8}
          />

          <p className={`${INTEL_LABEL} mt-5`}>Perfil de acesso</p>
          <div className="mt-2 grid grid-cols-1 gap-2">
            {STAFF_ROLES.map((r) => (
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
                <span className="block font-medium">{STAFF_ROLE_LABELS[r]}</span>
                <span className="block text-[11px] text-intel-text-dim/70 mt-0.5">{ROLE_HINT[r]}</span>
              </button>
            ))}
          </div>

          {role !== "administrador_geral" && (
            <>
              <p className={`${INTEL_LABEL} mt-5`}>Empresas autorizadas</p>
              <AccountsChecklist accounts={accounts} selected={selectedAccountIds} onToggle={toggleAccount} />
            </>
          )}

          <details className="mt-5 group">
            <summary className="cursor-pointer text-[12px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-text transition-colors duration-200">
              Permissões de módulos e ações (opcional)
            </summary>
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
            {submitting ? "Criando..." : "Criar login"}
          </button>
        </form>

        {created && (
          <PasswordRevealBox
            title={`Login criado para ${created.name}`}
            hint="Essa senha só aparece agora — copie e entregue por um canal privado. A conta exigirá troca de senha no primeiro acesso."
            password={created.password}
            onClose={() => setCreated(null)}
          />
        )}
      </div>

      <div className="rounded-2xl border border-white/[0.07] bg-intel-surface-1 p-6 overflow-x-auto">
        <h3 className="text-[13px] font-medium text-intel-text mb-4">Equipe com acesso</h3>
        {users.length === 0 ? (
          <p className="text-sm text-intel-text-dim">Nenhum login de equipe criado ainda.</p>
        ) : (
          <table className="w-full min-w-[640px] border-collapse">
            <thead>
              <tr>
                {["Nome", "Usuário", "Perfil", "Empresas", "Permissões", ""].map((h) => (
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
              {users.map((user) => (
                <Fragment key={user.id}>
                  <tr className="hover:bg-white/[0.03] transition-colors duration-150">
                    <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                      {user.name}
                      {user.mustChangePassword && (
                        <span className="ml-2 text-[10.5px] uppercase tracking-[0.06em] text-amber-300/80">1º acesso pendente</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05] font-mono">
                      {user.username}
                    </td>
                    <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                      {STAFF_ROLE_LABELS[user.role]}
                      {user.role === "administrador_geral" && (
                        <span className={`ml-2 text-[10.5px] uppercase tracking-[0.06em] ${user.totpEnabled ? "text-intel-green" : "text-intel-red"}`}>
                          {user.totpEnabled ? "2FA ativo" : "2FA pendente"}
                        </span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                      {user.role === "administrador_geral" ? "Todas" : accountNames(user.accountIds, accounts) || "—"}
                    </td>
                    <td className="py-2.5 px-3 text-[13px] text-intel-text-dim border-t border-white/[0.05]">
                      {permissionsSummary(user.permissions)}
                    </td>
                    <td className="py-2.5 px-3 text-right border-t border-white/[0.05] whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => setEditingUserId(editingUserId === user.id ? null : user.id)}
                        className="text-[12px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-cyan transition-colors duration-200 mr-4"
                      >
                        {editingUserId === user.id ? "Fechar" : "Editar"}
                      </button>
                      <button
                        type="button"
                        onClick={() => setResetTarget(user)}
                        className="text-[12px] tracking-[0.06em] uppercase text-intel-text-dim hover:text-intel-cyan transition-colors duration-200 mr-4"
                      >
                        Resetar senha
                      </button>
                      <button
                        type="button"
                        onClick={() => handleRevoke(user.id)}
                        onBlur={() => setConfirmingRevoke(null)}
                        className={`text-[12px] tracking-[0.06em] uppercase transition-colors duration-200 ${
                          confirmingRevoke === user.id ? "text-intel-red font-medium" : "text-intel-text-dim hover:text-intel-red"
                        }`}
                      >
                        {confirmingRevoke === user.id ? "Confirmar?" : "Revogar"}
                      </button>
                    </td>
                  </tr>
                  {editingUserId === user.id && (
                    <EditStaffRow user={user} accounts={accounts} onSave={handleSaveEdit} onCancel={() => setEditingUserId(null)} />
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {resetTarget && (
        <ResetPasswordModal
          targetName={resetTarget.name}
          targetUsername={resetTarget.username}
          endpoint={`/api/analise/admin/users/${resetTarget.id}/reset-password/`}
          onClose={() => setResetTarget(null)}
        />
      )}
    </div>
  );
}
