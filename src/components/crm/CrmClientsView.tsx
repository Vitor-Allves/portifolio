"use client";

import { useEffect, useState } from "react";
import { CRM_CLIENT_STATUSES, CRM_RENEWAL_FILTERS, formatBRL, type CrmClientRow, type CrmClientSuggestions, type CrmCompanyRow, type CrmPage, type CrmTeamMember } from "@/lib/crm-types";
import type { CrmCapabilities } from "@/lib/crm-permissions";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { Mascot } from "./crm-brand";
import { TagChips, useCatalog } from "./crm-catalog-context";
import { brDay } from "./crm-fields";
import { shortDate } from "./crm-format";
import { ClientStatusChip, contractDue } from "./crm-client-ui";

type ListResponse = { clients: CrmClientRow[]; valuesHidden: boolean; suggestions: CrmClientSuggestions | null };

async function post(url: string, body: unknown): Promise<{ id?: string; error?: string }> {
  const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
  if (!res.ok || !data?.id) return { error: data?.error ?? "Não foi possível cadastrar o cliente." };
  return data;
}

export default function CrmClientsView({
  team,
  caps,
  currentUserId,
  version,
  onOpenClient,
  onOpenContact,
}: {
  team: CrmTeamMember[];
  caps: CrmCapabilities;
  currentUserId: string;
  /** Bumped after a change elsewhere (a client panel saved): reload. */
  version: number;
  onOpenClient: (id: string) => void;
  onOpenContact: (id: string) => void;
}) {
  const { label, options } = useCatalog();
  const [status, setStatus] = useState("atuais");
  const [owner, setOwner] = useState("all");
  const [service, setService] = useState("");
  const [renewal, setRenewal] = useState("");
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [result, setResult] = useState<{ key: string; data: ListResponse | null; error: string | null } | null>(null);
  const [creating, setCreating] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setQ(query.trim()), 250);
    return () => clearTimeout(t);
  }, [query]);

  const params = new URLSearchParams();
  if (status !== "atuais") params.set("status", status);
  if (owner !== "all") params.set("owner", owner);
  if (service) params.set("service", service);
  if (renewal) params.set("renewal", renewal);
  if (q) params.set("q", q);
  const key = `${params.toString()}#${version}`;

  useEffect(() => {
    let cancelled = false;
    const qs = key.split("#")[0];
    fetch(`/api/crm/clients/${qs ? `?${qs}` : ""}`)
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (ListResponse & { error?: string }) | null;
        if (cancelled) return;
        if (!res.ok || !body) setResult({ key, data: null, error: body?.error ?? "Não foi possível carregar os clientes." });
        else setResult({ key, data: body, error: null });
      })
      .catch(() => !cancelled && setResult({ key, data: null, error: "Não foi possível falar com o CRM agora." }));
    return () => {
      cancelled = true;
    };
  }, [key]);

  const loading = result?.key !== key;
  const data = result?.data ?? null;
  const clients = data?.clients ?? [];
  const monthly = clients.reduce((sum, c) => sum + (c.monthlyCents ?? 0), 0);
  const dueSoon = clients.filter((c) => c.daysLeft !== null && c.daysLeft <= 30).length;
  const suggestions = data?.suggestions ?? null;
  const hasSuggestions = !!suggestions && (suggestions.deals.length > 0 || suggestions.companies.length > 0);

  async function become(key: string, body: unknown) {
    setBusy(key);
    setActionError(null);
    const r = await post("/api/crm/clients/", body);
    setBusy(null);
    if (r.error) setActionError(r.error);
    else onOpenClient(r.id!);
  }

  return (
    <section aria-label="Clientes ativos" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar cliente"
          aria-label="Buscar clientes"
          className={`${CRM_INPUT} !w-56 max-w-full !rounded-full !py-1.5`}
        />
        <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação do cliente" className={CRM_FILTER}>
          <option value="atuais">Atuais (sem encerrados)</option>
          {CRM_CLIENT_STATUSES.map((st) => (
            <option key={st.id} value={st.id}>
              {st.label}
            </option>
          ))}
          <option value="todos">Todos, inclusive encerrados</option>
        </select>
        <select value={owner} onChange={(e) => setOwner(e.target.value)} aria-label="Responsável pelo cliente" className={CRM_FILTER}>
          <option value="all">Todos os responsáveis</option>
          <option value="mine">Meus clientes</option>
          <option value="none">Sem responsável</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
        </select>
        <select value={service} onChange={(e) => setService(e.target.value)} aria-label="Serviço contratado" className={CRM_FILTER}>
          <option value="">Qualquer serviço</option>
          {options("service").map((o) => (
            <option key={o.id} value={o.id}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={renewal} onChange={(e) => setRenewal(e.target.value)} aria-label="Vencimento do contrato" className={CRM_FILTER}>
          <option value="">Qualquer vencimento</option>
          {CRM_RENEWAL_FILTERS.map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        {caps.editClients && (
          <button type="button" onClick={() => setCreating(true)} className={`ml-auto ${CRM_BTN_PRIMARY}`}>
            + Novo cliente
          </button>
        )}
      </div>

      {creating && (
        <NewClientForm
          team={caps.assignAnyOwner ? team : team.filter((m) => m.id === currentUserId)}
          currentUserId={currentUserId}
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpenClient(id);
          }}
        />
      )}

      {actionError && (
        <p className={CRM_ALERT} role="alert">
          {actionError}
        </p>
      )}

      {hasSuggestions && (
        <section aria-label="Prontos para virar cliente" className="rounded-2xl border border-crm-green/30 bg-crm-green/[0.05] p-4 space-y-2">
          <h2 className="text-[13.5px] font-semibold">Prontos para virar cliente</h2>
          <ul className="divide-y divide-crm-line/70">
            {suggestions!.deals.map((d) => (
              <li key={d.dealId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 basis-60">
                  <span className="block text-[13px] font-semibold truncate">{d.companyName ?? d.contactName}</span>
                  <span className="block text-[11.5px] text-crm-dim truncate">
                    Ganhou “{d.title}”{d.closedAt ? ` em ${shortDate(d.closedAt)}` : ""} · {d.contactName}
                    {d.clientId ? " · já é cliente: vira um contrato novo" : ""}
                  </span>
                </span>
                {d.companyId ? (
                  <button type="button" disabled={busy !== null} onClick={() => void become(d.dealId, { dealId: d.dealId })} className={CRM_LINK_BTN}>
                    {busy === d.dealId ? "Cadastrando..." : d.clientId ? "Adicionar contrato" : "Tornar cliente"}
                  </button>
                ) : (
                  <span className="text-[11.5px] text-crm-faint">
                    Sem empresa.{" "}
                    <button type="button" onClick={() => onOpenContact(d.contactId)} className={CRM_LINK_BTN}>
                      Vincular no contato
                    </button>
                  </span>
                )}
              </li>
            ))}
            {suggestions!.companies.map((c) => (
              <li key={c.companyId} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
                <span className="min-w-0 flex-1 basis-60">
                  <span className="block text-[13px] font-semibold truncate">{c.companyName}</span>
                  <span className="block text-[11.5px] text-crm-dim">Marcada como Cliente ativo na empresa, sem cadastro de cliente.</span>
                </span>
                <button type="button" disabled={busy !== null} onClick={() => void become(c.companyId, { companyId: c.companyId })} className={CRM_LINK_BTN}>
                  {busy === c.companyId ? "Cadastrando..." : "Completar cadastro"}
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-[12px] text-crm-dim" aria-live="polite">
        {loading && !data
          ? "Carregando..."
          : `${clients.length} ${clients.length === 1 ? "cliente" : "clientes"}${!data?.valuesHidden && monthly > 0 ? ` · ${formatBRL(monthly)}/mês em contratos vigentes` : ""}${
              dueSoon > 0 ? ` · ${dueSoon} com contrato vencendo em até 30 dias` : ""
            }`}
      </p>
      {result?.error && <p className={CRM_ALERT}>{result.error}</p>}

      {data && clients.length === 0 ? (
        <div className="flex items-end justify-between gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 overflow-hidden">
          <div className="pb-6">
            <p className="crm-display text-[17px] mb-1">{params.toString() ? "Nenhum cliente encontrado" : "Nenhum cliente ativo ainda"}</p>
            <p className="text-[12.5px] text-crm-dim leading-relaxed">
              Um cliente nasce de uma oportunidade ganha (botão Tornar cliente na oportunidade) ou de uma empresa. Nada vira cliente sozinho.
            </p>
          </div>
          <Mascot name="legacyWin" decorative className="h-28 w-auto shrink-0" />
        </div>
      ) : (
        data && (
          <div className={`rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
            <table className="w-full text-[12.5px]">
              <caption className="sr-only">Clientes ativos</caption>
              <thead className="bg-crm-sunken border-b border-crm-line">
                <tr>
                  <th className={CRM_TH}>Cliente</th>
                  <th className={`${CRM_TH} hidden sm:table-cell`}>Situação</th>
                  <th className={`${CRM_TH} hidden lg:table-cell`}>Responsável</th>
                  <th className={`${CRM_TH} hidden md:table-cell`}>Serviços</th>
                  {!data.valuesHidden && <th className={`${CRM_TH} text-right hidden md:table-cell`}>Valor mensal</th>}
                  <th className={CRM_TH}>Contrato</th>
                  <th className={`${CRM_TH} hidden lg:table-cell`}>Cliente desde</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-crm-line">
                {clients.map((c) => {
                  const due = contractDue(c.daysLeft, c.nextEndsOn);
                  return (
                    <tr key={c.id} onClick={() => onOpenClient(c.id)} className="cursor-pointer hover:bg-crm-hover transition-colors">
                      <td className={CRM_TD}>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            onOpenClient(c.id);
                          }}
                          className="text-left font-semibold text-crm-text hover:underline"
                        >
                          {c.companyName}
                        </button>
                        <span className="block text-[11.5px] text-crm-faint truncate max-w-[260px]">
                          {[c.segment, c.city].filter(Boolean).join(" · ") || (c.decisionMakers[0] ? `Decisor: ${c.decisionMakers[0].name}` : "")}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-1">
                          <span className="sm:hidden">
                            <ClientStatusChip value={c.status} />
                          </span>
                          <TagChips ids={c.tagIds} max={2} />
                        </span>
                        <span className="md:hidden block text-[11.5px] text-crm-dim mt-0.5">{c.services.map((s) => label("service", s)).join(", ")}</span>
                      </td>
                      <td className={`${CRM_TD} hidden sm:table-cell`}>
                        <ClientStatusChip value={c.status} />
                      </td>
                      <td className={`${CRM_TD} hidden lg:table-cell`}>
                        {c.ownerName ? (
                          <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-crm-dim">
                            <OwnerAvatar name={c.ownerName} />
                            {c.ownerName}
                          </span>
                        ) : (
                          <span className="text-crm-faint">—</span>
                        )}
                      </td>
                      <td className={`${CRM_TD} text-crm-dim hidden md:table-cell`}>{c.services.map((s) => label("service", s)).join(", ") || "—"}</td>
                      {!data.valuesHidden && (
                        <td className={`${CRM_TD} text-right tabular-nums font-semibold hidden md:table-cell`}>{c.monthlyCents !== null ? formatBRL(c.monthlyCents) : "—"}</td>
                      )}
                      <td className={`${CRM_TD} whitespace-nowrap`}>
                        {c.activeContracts === 0 ? (
                          <span className="text-crm-faint">Sem contrato vigente</span>
                        ) : (
                          <>
                            <span className={`font-medium ${due.tone}`}>{due.text}</span>
                            {c.nextEndsOn && <span className="block text-[11px] text-crm-faint">{brDay(c.nextEndsOn)}</span>}
                          </>
                        )}
                      </td>
                      <td className={`${CRM_TD} text-crm-dim hidden lg:table-cell`}>{c.startedOn ? brDay(c.startedOn) : "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      )}
    </section>
  );
}

/** "+ Novo cliente": pick the company (one not yet a client), the responsible and the situation. Contracts come next, in the client's panel. */
function NewClientForm({
  team,
  currentUserId,
  onCancel,
  onCreated,
}: {
  team: CrmTeamMember[];
  currentUserId: string;
  onCancel: () => void;
  onCreated: (id: string) => void;
}) {
  const [search, setSearch] = useState("");
  const [found, setFound] = useState<CrmCompanyRow[]>([]);
  const [company, setCompany] = useState<CrmCompanyRow | null>(null);
  const [ownerId, setOwnerId] = useState(team.some((m) => m.id === currentUserId) ? currentUserId : "");
  const [status, setStatus] = useState("onboarding");
  const [startedOn, setStartedOn] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const term = search.trim();
    if (term.length < 2 || company) return;
    let cancelled = false;
    const t = setTimeout(() => {
      fetch(`/api/crm/companies/?q=${encodeURIComponent(term)}&pageSize=8`)
        .then((res) => (res.ok ? (res.json() as Promise<CrmPage<CrmCompanyRow>>) : null))
        .then((page) => page && !cancelled && setFound(page.rows))
        .catch(() => {});
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [search, company]);

  async function submit() {
    if (!company) return;
    setBusy(true);
    const r = await post("/api/crm/clients/", { companyId: company.id, ownerId: ownerId || null, status, startedOn: startedOn || null });
    setBusy(false);
    if (r.error) setError(r.error);
    else onCreated(r.id!);
  }

  return (
    <form
      aria-label="Novo cliente"
      onSubmit={(e) => {
        e.preventDefault();
        void submit();
      }}
      className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4 space-y-3 max-w-2xl"
    >
      <h2 className="text-[14px] font-semibold">Novo cliente</h2>
      {company ? (
        <p className="flex flex-wrap items-center gap-2 text-[13px]">
          Empresa: <strong>{company.name}</strong>
          <button type="button" onClick={() => (setCompany(null), setFound([]))} className={CRM_LINK_BTN}>
            Trocar
          </button>
        </p>
      ) : (
        <label className="block">
          <span className={CRM_LABEL}>Empresa</span>
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Digite o nome da empresa" aria-label="Buscar empresa" autoFocus className={`${CRM_INPUT} mt-1`} />
          {search.trim().length >= 2 && (
            <ul className="mt-1 rounded-xl border border-crm-line divide-y divide-crm-line max-h-56 overflow-y-auto" aria-label="Empresas encontradas">
              {found.length === 0 && <li className="px-3 py-2 text-[12px] text-crm-faint">Nenhuma empresa com esse nome. Cadastre em Empresas primeiro.</li>}
              {found.map((co) => (
                <li key={co.id}>
                  {co.clientId ? (
                    <span className="block px-3 py-2 text-[12.5px] text-crm-faint">{co.name} · já é cliente</span>
                  ) : (
                    <button type="button" onClick={() => setCompany(co)} className="w-full text-left px-3 py-2 text-[12.5px] hover:bg-crm-hover">
                      <span className="font-semibold">{co.name}</span>
                      <span className="text-crm-faint">{[co.segment, co.city].filter(Boolean).length ? ` · ${[co.segment, co.city].filter(Boolean).join(" · ")}` : ""}</span>
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </label>
      )}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <label className="block min-w-0">
          <span className={CRM_LABEL}>Responsável</span>
          <select value={ownerId} onChange={(e) => setOwnerId(e.target.value)} aria-label="Responsável pelo cliente" className={`${CRM_INPUT} mt-1`}>
            <option value="">Sem responsável</option>
            {team.map((m) => (
              <option key={m.id} value={m.id}>
                {m.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={CRM_LABEL}>Situação</span>
          <select value={status} onChange={(e) => setStatus(e.target.value)} aria-label="Situação" className={`${CRM_INPUT} mt-1`}>
            {CRM_CLIENT_STATUSES.filter((s) => s.id !== "encerrado").map((s) => (
              <option key={s.id} value={s.id}>
                {s.label}
              </option>
            ))}
          </select>
        </label>
        <label className="block min-w-0">
          <span className={CRM_LABEL}>Cliente desde</span>
          <input type="date" value={startedOn} onChange={(e) => setStartedOn(e.target.value)} aria-label="Cliente desde" className={`${CRM_INPUT} mt-1`} />
        </label>
      </div>
      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-2">
        <button type="submit" disabled={!company || busy} className={CRM_BTN_PRIMARY}>
          {busy ? "Cadastrando..." : "Cadastrar cliente"}
        </button>
        <button type="button" onClick={onCancel} className={CRM_BTN_OUTLINE}>
          Cancelar
        </button>
        <span className="text-[11.5px] text-crm-faint basis-full">Sem data, vale hoje. Os contratos (serviços, vigência e valor) você registra no cadastro do cliente.</span>
      </div>
    </form>
  );
}
