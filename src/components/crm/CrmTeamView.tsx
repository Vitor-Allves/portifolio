"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import {
  CRM_ACCESS_OPTIONS,
  CRM_PERMISSION_MODULES,
  FIXED_CAPS,
  crmCapabilities,
  type CrmAccess,
  type CrmCap,
  type CrmPermissionOverrides,
  type CrmRole,
  type CrmTeamRow,
} from "@/lib/crm-permissions";
import { STAFF_ROLE_LABELS } from "@/lib/session-scope";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { dateTime, initials } from "./crm-format";
import { describeEvent } from "./crm-event-text";
import { formatBRL, type CrmEventKind } from "@/lib/crm-types";
import { useCatalog } from "./crm-catalog-context";

const ACCESS_TONE: Record<CrmAccess, string> = {
  administrador: "bg-crm-accent/10 text-crm-accent border-crm-accent/25",
  gestor: "bg-crm-violet/10 text-crm-violet border-crm-violet/25",
  comercial: "bg-crm-green/10 text-crm-green border-crm-green/25",
  marketing: "bg-crm-amber/10 text-crm-amber border-crm-amber/25",
  sem_acesso: "bg-crm-sunken text-crm-dim border-crm-line",
};
const ROLE_OPTIONS = CRM_ACCESS_OPTIONS.filter((o) => o.id !== "sem_acesso");
const accessLabel = (a: CrmAccess) => CRM_ACCESS_OPTIONS.find((o) => o.id === a)?.label ?? a;

async function errorOf(res: Response, fallback: string): Promise<string> {
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? fallback;
}

function AccessChip({ access }: { access: CrmAccess }) {
  return <span className={`inline-block whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold ${ACCESS_TONE[access]}`}>{accessLabel(access)}</span>;
}

/** The temporary password, shown once with a copy button. */
function OneTimePassword({ username, password, onDone }: { username: string; password: string; onDone: () => void }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="rounded-xl border border-crm-green/30 bg-crm-green/[0.07] p-3.5 space-y-2" role="status">
      <p className="text-[12.5px] text-crm-text">
        Senha temporária de <strong>{username}</strong>. Ela aparece <strong>só agora</strong>: entregue à pessoa por um canal seguro. No primeiro acesso, em
        /intelligence/login, ela cria a própria senha.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <code className="rounded-lg bg-crm-card border border-crm-line px-3 py-1.5 text-[13px] font-semibold tracking-wide select-all" aria-label="Senha temporária">
          {password}
        </code>
        <button
          type="button"
          onClick={() => {
            void navigator.clipboard?.writeText(password).then(() => setCopied(true));
          }}
          className={CRM_BTN_OUTLINE}
        >
          {copied ? "Copiada" : "Copiar"}
        </button>
        <button type="button" onClick={onDone} className={`${CRM_LINK_BTN} ml-auto`}>
          Já entreguei
        </button>
      </div>
    </div>
  );
}

function NewPersonDialog({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const { options } = useCatalog();
  const [form, setForm] = useState({ name: "", username: "", email: "", access: "comercial" as CrmRole, jobTitle: "", department: "", adminPassword: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [created, setCreated] = useState<{ username: string; password: string } | null>(null);

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/crm/team/", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
    setSaving(false);
    if (!res.ok) return setError(await errorOf(res, "Não foi possível criar o acesso."));
    setError(null);
    setCreated((await res.json()) as { username: string; password: string });
    onCreated();
  }

  return (
    <div className="fixed inset-0 z-[55] flex items-center justify-center bg-black/50 px-4" onClick={onClose}>
      <form
        onSubmit={submit}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="crm-new-person-title"
        className="w-full max-w-lg max-h-[calc(100vh-32px)] overflow-y-auto rounded-2xl border border-crm-line bg-crm-raised text-crm-text p-5 shadow-[var(--crm-shadow-lg)] space-y-4"
      >
        <div>
          <h2 id="crm-new-person-title" className="crm-display text-[17px]">
            Nova pessoa no CRM
          </h2>
          <p className="text-[12px] text-crm-dim">Acesso só ao CRM: no Intelligence, essa pessoa não vê nenhum cliente.</p>
        </div>
        {created ? (
          <OneTimePassword username={created.username} password={created.password} onDone={onClose} />
        ) : (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <label className="block">
                <span className={CRM_LABEL}>Nome *</span>
                <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required autoFocus className={`${CRM_INPUT} mt-1`} />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Usuário (login) *</span>
                <input
                  value={form.username}
                  onChange={(e) => setForm({ ...form, username: e.target.value.toLowerCase() })}
                  required
                  placeholder="ex.: ana.ribeiro"
                  autoComplete="off"
                  className={`${CRM_INPUT} mt-1`}
                />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>E-mail</span>
                <input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} type="email" className={`${CRM_INPUT} mt-1`} />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Perfil no CRM *</span>
                <select value={form.access} onChange={(e) => setForm({ ...form, access: e.target.value as CrmRole })} aria-label="Perfil no CRM" className={`${CRM_INPUT} mt-1`}>
                  {ROLE_OPTIONS.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Cargo</span>
                <input value={form.jobTitle} onChange={(e) => setForm({ ...form, jobTitle: e.target.value })} placeholder="ex.: SDR" className={`${CRM_INPUT} mt-1`} />
              </label>
              <label className="block">
                <span className={CRM_LABEL}>Departamento</span>
                <select value={form.department} onChange={(e) => setForm({ ...form, department: e.target.value })} aria-label="Departamento" className={`${CRM_INPUT} mt-1`}>
                  <option value="">—</option>
                  {options("department").map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <p className="text-[11.5px] text-crm-dim">{ROLE_OPTIONS.find((o) => o.id === form.access)?.description}</p>
            <label className="block">
              <span className={CRM_LABEL}>Sua senha (para confirmar)</span>
              <input
                value={form.adminPassword}
                onChange={(e) => setForm({ ...form, adminPassword: e.target.value })}
                type="password"
                required
                autoComplete="current-password"
                aria-label="Sua senha para confirmar"
                className={`${CRM_INPUT} mt-1`}
              />
            </label>
            {error && (
              <p className={CRM_ALERT} role="alert">
                {error}
              </p>
            )}
            <div className="flex justify-end gap-2">
              <button type="button" onClick={onClose} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
                Cancelar
              </button>
              <button type="submit" disabled={saving} className={CRM_BTN_PRIMARY}>
                {saving ? "Criando..." : "Criar acesso"}
              </button>
            </div>
          </>
        )}
      </form>
    </div>
  );
}

type Counts = { contacts: number; deals: number; tasks: number; companies: number };
const countsText = (c: Counts) =>
  `${c.contacts} contato${c.contacts === 1 ? "" : "s"}, ${c.deals} oportunidade${c.deals === 1 ? "" : "s"} aberta${c.deals === 1 ? "" : "s"}, ${c.tasks} tarefa${c.tasks === 1 ? "" : "s"} pendente${c.tasks === 1 ? "" : "s"} e ${c.companies} empresa${c.companies === 1 ? "" : "s"}`;

/** Carteira: what the person owns, and handing all of it to someone else (e.g. when they leave). */
function PortfolioSection({ person, targets, onChanged }: { person: CrmTeamRow; targets: CrmTeamRow[]; onChanged: (message: string) => void }) {
  const [counts, setCounts] = useState<Counts | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/team/${person.id}/transfer/`)
      .then((r) => r.json())
      .then((d: { counts?: Counts }) => !cancelled && d.counts && setCounts(d.counts))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [person.id, version]);

  const total = counts ? counts.contacts + counts.deals + counts.tasks + counts.companies : 0;
  async function transfer() {
    setBusy(true);
    const res = await fetch(`/api/crm/team/${person.id}/transfer/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ toUserId: to === "__none" ? null : to }),
    });
    setBusy(false);
    const data = (await res.json().catch(() => null)) as (Counts & { toName: string | null; error?: string }) | null;
    if (!res.ok || !data) return setError(data?.error ?? "Não foi possível transferir.");
    setError(null);
    setTo(null);
    setVersion((v) => v + 1);
    onChanged(`Carteira de ${person.name} transferida para ${data.toName ?? "ninguém (sem responsável)"}: ${countsText(data)}.`);
  }

  return (
    <section className="space-y-2" aria-label="Carteira">
      <h3 className={CRM_LABEL}>Carteira</h3>
      <p className="text-[12.5px] text-crm-dim">{counts ? (total > 0 ? `Com ${person.name}: ${countsText(counts)}.` : "Nada no nome dessa pessoa.") : "Carregando…"}</p>
      {counts && total > 0 && (
        <div className="flex flex-wrap items-center gap-2">
          <select value={to ?? ""} onChange={(e) => setTo(e.target.value || null)} aria-label="Transferir carteira para" className={`${CRM_INPUT} !w-auto`}>
            <option value="">Transferir tudo para…</option>
            {targets.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
            <option value="__none">Sem responsável</option>
          </select>
          <button type="button" disabled={!to || busy} onClick={() => void transfer()} className={CRM_BTN_PRIMARY}>
            {busy ? "Transferindo..." : "Transferir carteira"}
          </button>
        </div>
      )}
      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}

type Activity = {
  days: number;
  messagesSent: number;
  notes: number;
  tasksDone: number;
  stageMoves: number;
  won: number;
  wonValueCents: number;
  lastActivityAt: string | null;
  recent: { id: string; at: string; kind: CrmEventKind; payload: Record<string, unknown>; contactName: string }[];
};

/** Produtividade e histórico de atividades da pessoa. */
function ActivitySection({ personId }: { personId: string }) {
  const { label } = useCatalog();
  const [days, setDays] = useState(30);
  const [activity, setActivity] = useState<{ days: number; data: Activity } | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/team/${personId}/activity/?days=${days}`)
      .then((r) => r.json())
      .then((d: { activity?: Activity }) => !cancelled && d.activity && setActivity({ days, data: d.activity }))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [personId, days]);

  const a = activity?.days === days ? activity.data : null;
  const tiles = a
    ? [
        ["Mensagens enviadas", String(a.messagesSent)],
        ["Notas", String(a.notes)],
        ["Tarefas concluídas", String(a.tasksDone)],
        ["Mudanças de etapa", String(a.stageMoves)],
        ["Ganhos", a.won ? `${a.won} · ${formatBRL(a.wonValueCents)}` : "0"],
      ]
    : [];
  return (
    <section className="space-y-2" aria-label="Atividade">
      <div className="flex items-center justify-between gap-2">
        <h3 className={CRM_LABEL}>Atividade</h3>
        <select value={days} onChange={(e) => setDays(Number(e.target.value))} aria-label="Período da atividade" className={`${CRM_FILTER} !text-[12px]`}>
          <option value={7}>Últimos 7 dias</option>
          <option value={30}>Últimos 30 dias</option>
          <option value={90}>Últimos 90 dias</option>
        </select>
      </div>
      {!a ? (
        <p className="text-[12.5px] text-crm-dim">Carregando…</p>
      ) : (
        <>
          <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2">
            {tiles.map(([k, v]) => (
              <div key={k} className="rounded-xl border border-crm-line bg-crm-card px-3 py-2">
                <dt className="text-[11px] text-crm-dim">{k}</dt>
                <dd className="text-[15px] font-semibold tabular-nums">{v}</dd>
              </div>
            ))}
          </dl>
          <p className="text-[11.5px] text-crm-faint">Última atividade: {a.lastActivityAt ? dateTime(a.lastActivityAt) : "nenhuma ainda"}</p>
          {a.recent.length > 0 && (
            <details className="rounded-xl border border-crm-line bg-crm-card">
              <summary className="cursor-pointer px-3 py-2 text-[12.5px] font-semibold">Últimas ações ({a.recent.length})</summary>
              <ol className="divide-y divide-crm-line">
                {a.recent.map((e) => (
                  <li key={e.id} className="px-3 py-2 text-[12px]">
                    <p className="text-crm-text">
                      <span className="font-semibold">{e.contactName}</span> · {describeEvent(e, label)}
                    </p>
                    <p className="text-[10.5px] text-crm-faint">{dateTime(e.at)}</p>
                  </li>
                ))}
              </ol>
            </details>
          )}
        </>
      )}
    </section>
  );
}

/** Cargo, departamento, permissions (profile + exceptions) and, for CRM-only logins, password and deactivation. */
function PersonPanel({
  person,
  self,
  targets,
  onClose,
  onChanged,
}: {
  person: CrmTeamRow;
  self: boolean;
  /** Who can receive this person's carteira (active, with CRM access). */
  targets: CrmTeamRow[];
  onClose: () => void;
  /** `message`: something to show on the list (the panel may close, e.g. after a deactivation). */
  onChanged: (message?: string) => void;
}) {
  const { options, label } = useCatalog();
  const [details, setDetails] = useState({ jobTitle: person.jobTitle ?? "", department: person.department ?? "" });
  const [overrides, setOverrides] = useState<CrmPermissionOverrides>(person.overrides);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<null | "reset" | "deactivate" | "sessions">(null);
  const [adminPassword, setAdminPassword] = useState("");
  const [newPassword, setNewPassword] = useState<string | null>(null);
  const role = person.access === "sem_acesso" ? null : person.access;
  const template = role ? crmCapabilities(role) : null;
  const canEditPermissions = Boolean(role) && !person.locked && !self && person.active;

  useEffect(() => {
    function onKey(e: globalThis.KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const value = (cap: CrmCap) => (overrides[cap] !== undefined ? overrides[cap]! : Boolean(template?.[cap]));
  function toggle(cap: CrmCap, on: boolean) {
    const next = { ...overrides };
    if (template && on === template[cap]) delete next[cap];
    else next[cap] = on;
    setOverrides(next);
  }
  const dirtyPermissions = JSON.stringify(overrides) !== JSON.stringify(person.overrides);
  const dirtyDetails = details.jobTitle !== (person.jobTitle ?? "") || details.department !== (person.department ?? "");

  async function patch(body: Record<string, unknown>, done: string) {
    const res = await fetch(`/api/crm/team/${person.id}/`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    if (!res.ok) return setError(await errorOf(res, "Não foi possível salvar."));
    setError(null);
    setNotice(done);
    onChanged();
  }

  async function sensitive(kind: "reset" | "deactivate" | "sessions") {
    const res = await fetch(`/api/crm/team/${person.id}/${kind === "reset" ? "reset-password" : kind === "sessions" ? "sessions" : "deactivate"}/`, {
      method: kind === "sessions" ? "DELETE" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ adminPassword }),
    });
    if (!res.ok) return setError(await errorOf(res, "Não foi possível concluir."));
    setError(null);
    setAdminPassword("");
    setConfirming(null);
    if (kind === "reset") setNewPassword(((await res.json()) as { password: string }).password);
    else if (kind === "sessions") setNotice(`Sessões de ${person.name} encerradas: a pessoa precisa entrar de novo.`);
    else {
      const message = `${person.name} foi desativado(a). Nada do que essa pessoa fez foi apagado.`;
      setNotice(message);
      onChanged(message);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-30 bg-black/40" onClick={onClose} aria-hidden="true" />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Pessoa ${person.name}`}
        className="fixed inset-y-0 right-0 z-40 w-full sm:w-[560px] bg-crm-raised text-crm-text border-l border-crm-line shadow-[var(--crm-shadow-lg)] flex flex-col"
      >
        <header className="px-5 pt-4 pb-3 border-b border-crm-line flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <span className="h-10 w-10 shrink-0 rounded-full bg-crm-navy text-white text-[13px] font-semibold flex items-center justify-center ring-2 ring-crm-silver/60">
              {initials(person.name)}
            </span>
            <div className="min-w-0">
              <h2 className="text-[16px] font-semibold truncate">{person.name}</h2>
              <p className="text-[12px] text-crm-dim truncate">
                {person.username}
                {person.email ? ` · ${person.email}` : ""}
              </p>
              <p className="mt-1 flex flex-wrap items-center gap-1.5">
                <AccessChip access={person.access} />
                {person.crmOnly && <span className="text-[10.5px] px-1.5 py-px rounded-full border border-crm-line bg-crm-sunken text-crm-dim">só CRM</span>}
                {!person.active && <span className="text-[10.5px] px-1.5 py-px rounded-full border border-crm-red/25 bg-crm-red/10 text-crm-red">Desativado</span>}
              </p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar painel" className="text-crm-dim hover:text-crm-text text-[20px] leading-none px-1">
            ×
          </button>
        </header>

        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
          {error && (
            <p className={CRM_ALERT} role="alert">
              {error}
            </p>
          )}
          {notice && (
            <p className="rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green" role="status">
              {notice}
            </p>
          )}

          <section className="space-y-2">
            <h3 className={CRM_LABEL}>Cargo e departamento</h3>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <input
                value={details.jobTitle}
                onChange={(e) => setDetails({ ...details, jobTitle: e.target.value })}
                aria-label="Cargo"
                placeholder="Cargo (ex.: SDR)"
                disabled={!person.active}
                className={CRM_INPUT}
              />
              <select
                value={details.department}
                onChange={(e) => setDetails({ ...details, department: e.target.value })}
                aria-label="Departamento"
                disabled={!person.active}
                className={CRM_INPUT}
              >
                <option value="">Sem departamento</option>
                {options("department", person.department).map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <button
              type="button"
              disabled={!dirtyDetails}
              onClick={() => void patch({ jobTitle: details.jobTitle, department: details.department || null }, "Cargo e departamento salvos.")}
              className={CRM_LINK_BTN}
            >
              Salvar cargo e departamento
            </button>
          </section>

          <section className="space-y-3" aria-label="Permissões">
            <div>
              <h3 className={CRM_LABEL}>Permissões</h3>
              <p className="mt-1 text-[12px] text-crm-dim">
                {!role
                  ? "Sem acesso ao CRM. Escolha um perfil na lista para liberar."
                  : person.locked
                    ? "O Administrador geral tem todas as permissões."
                    : self
                      ? "Suas próprias permissões não mudam por aqui."
                      : `O perfil ${accessLabel(person.access)} é o ponto de partida. Marque ou desmarque para abrir uma exceção só para esta pessoa.`}
              </p>
            </div>
            {role &&
              CRM_PERMISSION_MODULES.map((m) => (
                <fieldset key={m.id} className="rounded-xl border border-crm-line bg-crm-card">
                  <legend className="sr-only">{m.label}</legend>
                  <p className="px-3 pt-2.5 pb-1 text-[12px] font-semibold text-crm-text">{m.label}</p>
                  <ul className="divide-y divide-crm-line">
                    {m.items.map((it) => {
                      const fixed = FIXED_CAPS.includes(it.cap);
                      const exception = overrides[it.cap] !== undefined;
                      return (
                        <li key={it.cap} className="flex items-start gap-2.5 px-3 py-2">
                          <input
                            type="checkbox"
                            checked={value(it.cap)}
                            disabled={!canEditPermissions || fixed}
                            onChange={(e) => toggle(it.cap, e.target.checked)}
                            aria-label={it.label}
                            className="mt-0.5 h-4 w-4 shrink-0 accent-[var(--crm-accent)] disabled:opacity-60"
                          />
                          <span className="min-w-0 flex-1 text-[12.5px] leading-snug">
                            {it.label}
                            <span className="ml-1.5 text-[10.5px] text-crm-faint whitespace-nowrap">{it.action}</span>
                          </span>
                          {exception && (
                            <span className="shrink-0 text-[10.5px] font-semibold px-1.5 py-px rounded-full border border-crm-amber/30 bg-crm-amber/10 text-crm-amber">
                              exceção
                            </span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </fieldset>
              ))}
            {canEditPermissions && (
              <div className="flex flex-wrap items-center gap-3">
                <button type="button" disabled={!dirtyPermissions} onClick={() => void patch({ permissions: overrides }, "Permissões salvas. Valem na próxima ação dessa pessoa.")} className={CRM_BTN_PRIMARY}>
                  Salvar permissões
                </button>
                {Object.keys(overrides).length > 0 && (
                  <button type="button" onClick={() => setOverrides({})} className={CRM_LINK_BTN}>
                    Voltar ao padrão do perfil
                  </button>
                )}
              </div>
            )}
          </section>

          <PortfolioSection person={person} targets={targets} onChanged={(m) => (setNotice(m), onChanged())} />

          <ActivitySection personId={person.id} />

          <section className="space-y-2">
            <h3 className={CRM_LABEL}>Acesso</h3>
            <p className="text-[12px] text-crm-dim">
              2FA:{" "}
              {person.totpEnabled ? (
                <span className="text-crm-green font-medium">ativo</span>
              ) : person.access === "administrador" ? (
                <span className="text-crm-amber font-medium">pendente: será pedido no próximo login (obrigatório para Administrador)</span>
              ) : (
                "não usa"
              )}
            </p>
            {newPassword ? (
              <OneTimePassword username={person.username} password={newPassword} onDone={() => setNewPassword(null)} />
            ) : !person.active ? (
              <p className="text-[12.5px] text-crm-dim">Desativado: não entra mais, e tudo o que fez continua no CRM.</p>
            ) : self ? (
              <p className="text-[12.5px] text-crm-dim">Sua senha muda em Intelligence → Trocar senha.</p>
            ) : confirming ? (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void sensitive(confirming);
                }}
                className="rounded-xl border border-crm-line bg-crm-sunken p-3 space-y-2"
              >
                <p className="text-[12.5px]">
                  {confirming === "reset"
                    ? `Gerar uma senha temporária nova para ${person.name}? As sessões abertas dessa pessoa são encerradas.`
                    : confirming === "sessions"
                      ? `Encerrar as sessões de ${person.name} em todos os dispositivos? A pessoa precisa entrar de novo.`
                      : `Desativar ${person.name}? A pessoa não entra mais; leads, tarefas e histórico continuam como estão.`}
                </p>
                <input
                  value={adminPassword}
                  onChange={(e) => setAdminPassword(e.target.value)}
                  type="password"
                  required
                  autoFocus
                  autoComplete="current-password"
                  aria-label="Sua senha para confirmar"
                  placeholder="Sua senha, para confirmar"
                  className={CRM_INPUT}
                />
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => setConfirming(null)} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
                    Cancelar
                  </button>
                  <button type="submit" className={CRM_BTN_PRIMARY}>
                    {confirming === "reset" ? "Gerar senha" : confirming === "sessions" ? "Encerrar sessões" : "Desativar"}
                  </button>
                </div>
              </form>
            ) : (
              <>
                <div className="flex flex-wrap gap-2">
                  {!person.locked && (
                    <button type="button" onClick={() => setConfirming("sessions")} className={CRM_BTN_OUTLINE}>
                      Encerrar sessões
                    </button>
                  )}
                  {person.crmOnly && (
                    <>
                      <button type="button" onClick={() => setConfirming("reset")} className={CRM_BTN_OUTLINE}>
                        Gerar senha temporária
                      </button>
                      <button type="button" onClick={() => setConfirming("deactivate")} className={`${CRM_BTN_OUTLINE} hover:!text-crm-red hover:!border-crm-red/40`}>
                        Desativar acesso
                      </button>
                    </>
                  )}
                </div>
                {!person.crmOnly && (
                  <p className="text-[12.5px] text-crm-dim">Essa pessoa também usa o Intelligence: senha e desativação ficam com o administrador geral, no Intelligence.</p>
                )}
              </>
            )}
            {person.department && <p className="text-[11px] text-crm-faint">Departamento: {label("department", person.department)}</p>}
          </section>
        </div>
      </aside>
    </>
  );
}

/** Administrador only: who uses the CRM, with which profile, exceptions, cargo and departamento. */
export default function CrmTeamView({ currentUserId, onChanged }: { currentUserId: string; onChanged: () => void }) {
  const { label } = useCatalog();
  const [team, setTeam] = useState<CrmTeamRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [showInactive, setShowInactive] = useState(false);
  const [creating, setCreating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/crm/team/${showInactive ? "?inactive=1" : ""}`);
    const data = (await res.json().catch(() => null)) as { team?: CrmTeamRow[]; error?: string } | null;
    if (!res.ok || !data?.team) setError(data?.error ?? "Não foi possível carregar a equipe.");
    else setTeam(data.team);
  }, [showInactive]);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/crm/team/${showInactive ? "?inactive=1" : ""}`)
      .then(async (res) => {
        const data = (await res.json().catch(() => null)) as { team?: CrmTeamRow[]; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !data?.team) setError(data?.error ?? "Não foi possível carregar a equipe.");
        else setTeam(data.team);
      })
      .catch(() => !cancelled && setError("Não foi possível carregar a equipe."));
    return () => {
      cancelled = true;
    };
  }, [showInactive]);

  async function change(m: CrmTeamRow, access: CrmAccess) {
    setBusy(m.id);
    setSaved(null);
    const res = await fetch(`/api/crm/team/${m.id}/`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ access }),
    });
    setBusy(null);
    if (!res.ok) return setError(await errorOf(res, "Não foi possível salvar."));
    const data = (await res.json().catch(() => null)) as { endedSessions?: boolean } | null;
    setError(null);
    setSaved(
      `${m.name}: agora ${accessLabel(access)}.${data?.endedSessions ? " Administrador entra com 2FA: a pessoa foi desconectada e vai cadastrar o 2FA no próximo login." : ""}`
    );
    await load();
    onChanged();
  }

  const open = team?.find((m) => m.id === openId) ?? null;

  return (
    <section aria-label="Equipe" className="space-y-4 max-w-6xl">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
        {ROLE_OPTIONS.map((o) => (
          <div key={o.id} className="rounded-xl border border-crm-line bg-crm-card px-3.5 py-3 shadow-[var(--crm-shadow)]">
            <AccessChip access={o.id} />
            <p className="mt-1.5 text-[12px] text-crm-dim leading-snug">{o.description}</p>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          aria-pressed={showInactive}
          onClick={() => setShowInactive((v) => !v)}
          className={`text-[12.5px] px-3.5 py-1.5 rounded-full border transition-colors duration-200 ${
            showInactive ? "bg-crm-ink text-crm-on-ink border-transparent" : "bg-crm-card border-crm-line text-crm-dim hover:text-crm-text"
          }`}
        >
          Mostrar desativados
        </button>
        <button type="button" onClick={() => setCreating(true)} className={`ml-auto ${CRM_BTN_PRIMARY}`}>
          + Nova pessoa
        </button>
      </div>

      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}
      {saved && (
        <p className="rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green" role="status">
          {saved} A mudança vale na próxima ação dessa pessoa e ficou registrada na auditoria.
        </p>
      )}

      {/* relative: keeps the visually-hidden header inside the scroll box on phones */}
      <div className="relative rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead className="border-b border-crm-line">
            <tr>
              <th className={CRM_TH}>Pessoa</th>
              <th className={`${CRM_TH} hidden md:table-cell`}>Cargo · departamento</th>
              <th className={CRM_TH}>Perfil no CRM</th>
              <th className={`${CRM_TH} hidden sm:table-cell`}>Permissões</th>
              <th className={CRM_TH}>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-line">
            {!team ? (
              <tr>
                <td colSpan={5} className={`${CRM_TD} text-crm-dim`}>
                  {error ? "—" : "Carregando equipe..."}
                </td>
              </tr>
            ) : (
              team.map((m) => {
                const self = m.id === currentUserId;
                const exceptions = Object.keys(m.overrides).length;
                return (
                  <tr key={m.id} className={m.active ? "" : "opacity-60"}>
                    <td className={CRM_TD}>
                      <span className="flex items-center gap-2.5">
                        <span className="hidden sm:flex h-8 w-8 shrink-0 rounded-full bg-crm-navy text-white text-[11px] font-semibold items-center justify-center">{initials(m.name)}</span>
                        <span className="min-w-0">
                          <span className="block font-semibold truncate">
                            {m.name}
                            {self && <span className="font-normal text-crm-dim"> (você)</span>}
                          </span>
                          <span className="block text-[11.5px] text-crm-dim">
                            {m.username} · {m.crmOnly ? "só CRM" : `Intelligence: ${STAFF_ROLE_LABELS[m.staffRole]}`}
                            {!m.active && <span className="text-crm-red"> · desativado</span>}
                          </span>
                        </span>
                      </span>
                    </td>
                    <td className={`${CRM_TD} text-crm-dim hidden md:table-cell`}>
                      {[m.jobTitle, m.department ? label("department", m.department) : null].filter(Boolean).join(" · ") || "—"}
                    </td>
                    <td className={CRM_TD}>
                      {m.locked || self || !m.active ? (
                        <AccessChip access={m.access} />
                      ) : (
                        <select
                          value={m.access}
                          disabled={busy === m.id}
                          onChange={(e) => void change(m, e.target.value as CrmAccess)}
                          aria-label={`Perfil no CRM de ${m.name}`}
                          className={CRM_FILTER}
                        >
                          {CRM_ACCESS_OPTIONS.map((o) => (
                            <option key={o.id} value={o.id}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      )}
                    </td>
                    <td className={`${CRM_TD} hidden sm:table-cell whitespace-nowrap`}>
                      {m.locked ? (
                        <span className="text-[12px] text-crm-dim">Todas</span>
                      ) : exceptions > 0 ? (
                        <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full border border-crm-amber/30 bg-crm-amber/10 text-crm-amber">
                          {exceptions} exceç{exceptions === 1 ? "ão" : "ões"}
                        </span>
                      ) : (
                        <span className="text-[12px] text-crm-dim">Padrão do perfil</span>
                      )}
                    </td>
                    <td className={`${CRM_TD} text-right`}>
                      <button type="button" onClick={() => setOpenId(m.id)} aria-label={`Abrir ${m.name}`} className={CRM_LINK_BTN}>
                        Detalhes
                      </button>
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
      <p className="text-[11.5px] text-crm-faint">
        Quem também usa o Intelligence tem login, senha e desativação gerenciados lá, pelo administrador geral. Pessoas criadas aqui usam só o CRM.
      </p>

      {creating && (
        <NewPersonDialog
          onClose={() => setCreating(false)}
          onCreated={() => {
            void load();
            onChanged();
          }}
        />
      )}
      {open && (
        <PersonPanel
          key={open.id}
          person={open}
          targets={(team ?? []).filter((m) => m.active && m.access !== "sem_acesso" && m.id !== open.id)}
          self={open.id === currentUserId}
          onClose={() => setOpenId(null)}
          onChanged={(message) => {
            // A message means the panel is done (deactivation): once the list is
            // reloaded (so it no longer shows the person), close it and show it there.
            void load().then(() => {
              if (message) {
                setSaved(message);
                setOpenId(null);
              }
            });
            onChanged();
          }}
        />
      )}
    </section>
  );
}
