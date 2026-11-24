"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CRM_TEMPERATURES,
  formatPhone,
  stageLabel,
  type CrmContactCard,
  type CrmFacets,
  type CrmPage,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CONSENT_BADGE, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_TD, CRM_TH } from "./crm-styles";
import { TASK_STATE_TONE, relativeTime, taskDueLabel, taskState, todaySp } from "./crm-format";
import { TemperatureChip, brDay } from "./crm-fields";
import CrmAssignDialog from "./CrmAssignDialog";
import { Mascot } from "./crm-brand";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { StageDot, TagChips, useCatalog } from "./crm-catalog-context";

const PAGE_SIZE = 25;

function ConsentBadge({ c }: { c: CrmContactCard }) {
  const key = c.optedOutAt ? "descadastrado" : c.consentStatus;
  const label = c.optedOutAt ? "Descadastrado" : c.consentStatus === "sim" ? "Aceitou" : "Não informado";
  return <span className={`inline-flex whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full border ${CONSENT_BADGE[key]}`}>{label}</span>;
}

/** Última interação, próxima atividade e retorno previsto — the follow-up at a glance. */
function FollowUp({ c, now }: { c: CrmContactCard; now: number }) {
  const t = c.nextTask;
  const overdueReturn = c.returnAt !== null && c.returnAt < todaySp();
  return (
    <span className="block space-y-0.5 text-[11.5px]">
      <span className="block text-crm-dim whitespace-nowrap">Última: {c.lastInteractionAt ? relativeTime(c.lastInteractionAt, now) : "nenhuma"}</span>
      {t ? (
        <span className={`block truncate max-w-[220px] ${TASK_STATE_TONE[taskState(t.dueAt, t.allDay, now)]}`} title={t.title}>
          Próxima: {t.title} · {taskDueLabel(t.dueAt, t.allDay, now)}
        </span>
      ) : (
        <span className="block text-crm-faint">Sem próxima atividade</span>
      )}
      {c.returnAt && <span className={`block whitespace-nowrap ${overdueReturn ? "text-crm-amber font-medium" : "text-crm-dim"}`}>Retorno {brDay(c.returnAt)}</span>}
    </span>
  );
}

function StageTag({ stage }: { stage: CrmContactCard["stage"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <StageDot stage={stage} className="h-2 w-2" />
      {stageLabel(stage)}
    </span>
  );
}

export default function CrmContactsView({
  team,
  version,
  onOpenContact,
  onImport,
  canExport,
  canAssign = false,
  onNew,
}: {
  team: CrmTeamMember[];
  /** Bumped whenever something changed elsewhere (panel, import) — the list refetches. */
  version: number;
  onOpenContact: (id: string) => void;
  /** Absent when the profile can't import. */
  onImport?: () => void;
  canExport: boolean;
  /** "Trocar o responsável de qualquer lead": bulk owner change (carteiras). */
  canAssign?: boolean;
  onNew: () => void;
}) {
  const { label, options, tagGroups, stages } = useCatalog();
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [owner, setOwner] = useState("all");
  const [source, setSource] = useState("");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [consent, setConsent] = useState("");
  const [tag, setTag] = useState("");
  const [temperature, setTemperature] = useState("");
  const [service, setService] = useState("");
  const [returnDue, setReturnDue] = useState("");
  const [archived, setArchived] = useState(false);
  const [now] = useState(() => Date.now());
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
  // Carteiras: rows ticked for a bulk owner change; assigning = dialog open (selection or the whole filter).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [assigning, setAssigning] = useState<null | "selection" | "filter">(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [reload, setReload] = useState(0);
  const [facets, setFacets] = useState<CrmFacets>({ segments: [], cities: [] });
  const [result, setResult] = useState<{ key: string; data: CrmPage<CrmContactCard> | null; error: string | null } | null>(null);

  // Debounced search: the request goes out 300ms after the user stops typing.
  useEffect(() => {
    const t = setTimeout(() => {
      setQ(query);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const params = useMemo(() => {
    const p = new URLSearchParams();
    if (q.trim()) p.set("q", q.trim());
    if (stage) p.set("stage", stage);
    if (owner !== "all") p.set("owner", owner);
    if (source) p.set("source", source);
    if (segment) p.set("segment", segment);
    if (city) p.set("city", city);
    if (consent) p.set("consent", consent);
    if (tag) p.set("tag", tag);
    if (temperature) p.set("temperature", temperature);
    if (service) p.set("service", service);
    if (returnDue) p.set("returnDue", returnDue);
    if (archived) p.set("archived", "1");
    return p;
  }, [q, stage, owner, source, segment, city, consent, tag, temperature, service, returnDue, archived]);

  const key = `${params.toString()}|${sort}|${page}|${version}|${reload}`;

  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams(params);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    p.set("sort", sort);
    fetch(`/api/crm/contacts/?${p}`)
      .then(async (res) => {
        if (!res.ok) throw new Error(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível carregar os contatos.");
        return (await res.json()) as CrmPage<CrmContactCard>;
      })
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((err: Error) => !cancelled && setResult({ key, data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [params, page, sort, key]);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/facets/")
      .then((res) => (res.ok ? res.json() : null))
      .then((f: CrmFacets | null) => f && !cancelled && setFacets(f))
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [version]);

  const activeFilters = [stage, owner !== "all" ? owner : "", source, segment, city, consent, tag, temperature, service, returnDue, archived ? "1" : ""].filter(Boolean).length;
  const services = options("service");
  const loading = result?.key !== key;
  const data = result?.data ?? null;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = params.toString() !== "";
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    setSelected(new Set());
  };
  const pageIds = data?.rows.map((c) => c.id) ?? [];
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  return (
    <section aria-label="Contatos" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar nome, e-mail, empresa ou telefone"
          aria-label="Buscar contatos"
          className={`${CRM_INPUT} !w-72 max-w-full !rounded-full !py-1.5`}
        />
        <button
          type="button"
          aria-expanded={showFilters}
          onClick={() => setShowFilters((v) => !v)}
          className="md:hidden text-[12.5px] px-3.5 py-1.5 rounded-full border border-crm-line bg-crm-card text-crm-dim"
        >
          Filtros{activeFilters > 0 ? ` · ${activeFilters}` : ""}
        </button>
        {/* On phones the filters fold behind the button above; from md up they sit inline. */}
        <div className={`${showFilters ? "flex" : "hidden"} md:contents flex-wrap items-center gap-2 w-full`}>
        <select value={stage} onChange={(e) => resetPage(setStage)(e.target.value)} aria-label="Etapa" className={CRM_FILTER}>
          <option value="">Todas as etapas</option>
          {stages().map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        <select value={owner} onChange={(e) => resetPage(setOwner)(e.target.value)} aria-label="Responsável" className={CRM_FILTER}>
          <option value="all">Todos os responsáveis</option>
          <option value="mine">Meus contatos</option>
          <option value="none">Sem responsável</option>
          {team.map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
          <option value="inactive">Responsável desativado</option>
        </select>
        <select value={source} onChange={(e) => resetPage(setSource)(e.target.value)} aria-label="Origem" className={CRM_FILTER}>
          <option value="">Todas as origens</option>
          {options("source").map((s) => (
            <option key={s.id} value={s.id}>
              {s.label}
            </option>
          ))}
        </select>
        {facets.segments.length > 0 && (
          <select value={segment} onChange={(e) => resetPage(setSegment)(e.target.value)} aria-label="Segmento" className={CRM_FILTER}>
            <option value="">Todos os segmentos</option>
            {facets.segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {facets.cities.length > 0 && (
          <select value={city} onChange={(e) => resetPage(setCity)(e.target.value)} aria-label="Cidade" className={CRM_FILTER}>
            <option value="">Todas as cidades</option>
            {facets.cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <select value={consent} onChange={(e) => resetPage(setConsent)(e.target.value)} aria-label="Consentimento" className={CRM_FILTER}>
          <option value="">Qualquer consentimento</option>
          <option value="sim">Aceitou contato</option>
          <option value="nao_informado">Não informado</option>
          <option value="descadastrado">Descadastrados</option>
        </select>
        <select value={tag} onChange={(e) => resetPage(setTag)(e.target.value)} aria-label="Etiqueta" className={CRM_FILTER}>
          <option value="">Qualquer etiqueta</option>
          {tagGroups.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {g.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <select value={temperature} onChange={(e) => resetPage(setTemperature)(e.target.value)} aria-label="Temperatura" className={CRM_FILTER}>
          <option value="">Qualquer temperatura</option>
          {CRM_TEMPERATURES.map((t) => (
            <option key={t.id} value={t.id}>
              {t.label}
            </option>
          ))}
        </select>
        {services.length > 0 && (
          <select value={service} onChange={(e) => resetPage(setService)(e.target.value)} aria-label="Serviço de interesse" className={CRM_FILTER}>
            <option value="">Qualquer serviço</option>
            {services.map((o) => (
              <option key={o.id} value={o.id}>
                {o.label}
              </option>
            ))}
          </select>
        )}
        <select value={returnDue} onChange={(e) => resetPage(setReturnDue)(e.target.value)} aria-label="Retorno previsto" className={CRM_FILTER}>
          <option value="">Qualquer retorno</option>
          <option value="atrasado">Retorno atrasado</option>
          <option value="7d">Retorno nos próximos 7 dias</option>
        </select>
        <button
          type="button"
          aria-pressed={archived}
          onClick={() => resetPage(setArchived)(!archived)}
          className={`text-[12.5px] px-3.5 py-1.5 rounded-full border transition-colors duration-200 ${
            archived ? "bg-crm-ink text-crm-on-ink border-transparent" : "bg-crm-card border-crm-line text-crm-dim hover:text-crm-text"
          }`}
        >
          Arquivados
        </button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          {canAssign && total > 0 && (
            <button type="button" onClick={() => setAssigning(selected.size > 0 ? "selection" : "filter")} className={CRM_BTN_OUTLINE}>
              Trocar responsável{selected.size > 0 ? ` (${selected.size})` : ""}
            </button>
          )}
          {canExport && (
            <a href={`/api/crm/contacts/export/?${params}`} className={CRM_BTN_OUTLINE} download>
              Exportar CSV
            </a>
          )}
          {onImport && (
            <button type="button" onClick={onImport} className={CRM_BTN_OUTLINE}>
              Importar planilha
            </button>
          )}
          <button type="button" onClick={onNew} className={CRM_BTN_PRIMARY}>
            + Novo contato
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 text-[12px] text-crm-dim">
        <span aria-live="polite">
          {loading && !data ? "Carregando..." : `${total.toLocaleString("pt-BR")} contato${total === 1 ? "" : "s"}${archived ? " arquivado" + (total === 1 ? "" : "s") : ""}`}
        </span>
        <label className="flex items-center gap-2">
          Ordenar
          <select value={sort} onChange={(e) => resetPage(setSort)(e.target.value)} className={CRM_FILTER}>
            <option value="recent">Atividade recente</option>
            <option value="name">Nome (A–Z)</option>
            <option value="created">Cadastro mais novo</option>
          </select>
        </label>
      </div>

      {result?.error && <p className="text-[12.5px] text-crm-red">{result.error}</p>}
      {notice && (
        <p className="rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green" role="status">
          {notice}
        </p>
      )}
      {canAssign && selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-crm-accent/30 bg-crm-accent/[0.06] px-3.5 py-2 text-[12.5px]">
          <span>
            {selected.size} selecionado{selected.size === 1 ? "" : "s"}
          </span>
          {total > selected.size && (
            <button type="button" onClick={() => setAssigning("filter")} className="font-semibold text-crm-accent hover:opacity-80">
              Usar todos os {total.toLocaleString("pt-BR")} do filtro
            </button>
          )}
          <button type="button" onClick={() => setSelected(new Set())} className="ml-auto text-crm-dim hover:text-crm-text">
            Limpar seleção
          </button>
        </div>
      )}
      {assigning && (
        <CrmAssignDialog
          ids={assigning === "selection" ? [...selected] : undefined}
          filters={assigning === "filter" ? Object.fromEntries(params) : undefined}
          count={assigning === "selection" ? selected.size : total}
          team={team}
          onClose={() => setAssigning(null)}
          onDone={(message) => {
            setAssigning(null);
            setSelected(new Set());
            setNotice(message);
            setReload((v) => v + 1);
          }}
        />
      )}

      {data && data.rows.length === 0 ? (
        <div className="flex items-end justify-between gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 overflow-hidden">
          <div className="pb-6">
            <p className="crm-display text-[17px] mb-1">{filtered || archived ? "Nenhum contato encontrado" : "Sua base está vazia"}</p>
            <p className="text-[12.5px] text-crm-dim">
              {filtered || archived ? "Tente outra busca ou limpe os filtros." : "Importe uma planilha ou cadastre o primeiro contato."}
            </p>
          </div>
          <Mascot name={filtered || archived ? "legacyDoubt" : "legacyHello"} decorative className="h-28 w-auto shrink-0" />
        </div>
      ) : (
        <div className={`rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
          <table className="hidden md:table w-full text-[12.5px]">
            <thead className="bg-crm-sunken border-b border-crm-line">
              <tr>
                {canAssign && (
                  <th className={`${CRM_TH} w-8`}>
                    <input
                      type="checkbox"
                      checked={allOnPage}
                      onChange={() =>
                        setSelected((prev) => {
                          const next = new Set(prev);
                          for (const id of pageIds) {
                            if (allOnPage) next.delete(id);
                            else next.add(id);
                          }
                          return next;
                        })
                      }
                      aria-label="Selecionar os contatos desta página"
                      className="h-4 w-4 accent-[var(--crm-accent)]"
                    />
                  </th>
                )}
                <th className={CRM_TH}>Contato</th>
                <th className={CRM_TH}>Empresa</th>
                <th className={CRM_TH}>WhatsApp / e-mail</th>
                <th className={CRM_TH}>Acompanhamento</th>
                <th className={CRM_TH}>Origem</th>
                <th className={CRM_TH}>Etapa</th>
                <th className={CRM_TH}>Responsável</th>
                <th className={CRM_TH}>Consentimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crm-line">
              {data?.rows.map((c) => (
                <tr key={c.id} onClick={() => onOpenContact(c.id)} className="cursor-pointer hover:bg-crm-hover transition-colors">
                  {canAssign && (
                    <td className={CRM_TD} onClick={(e) => e.stopPropagation()}>
                      <input
                        type="checkbox"
                        checked={selected.has(c.id)}
                        onChange={() => toggle(c.id)}
                        aria-label={`Selecionar ${c.name}`}
                        className="h-4 w-4 accent-[var(--crm-accent)]"
                      />
                    </td>
                  )}
                  <td className={CRM_TD}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenContact(c.id);
                      }}
                      className="text-left font-semibold text-crm-text hover:underline"
                    >
                      {c.name}
                    </button>
                    <span className="block text-[11.5px] text-crm-faint">
                      {[c.jobTitle, c.isDecisionMaker ? "decisor" : null].filter(Boolean).join(" · ")}
                    </span>
                    {(c.tagIds.length > 0 || c.temperature) && (
                      <span className="mt-1 flex flex-wrap items-center gap-1">
                        <TemperatureChip value={c.temperature} />
                        <TagChips ids={c.tagIds} max={3} />
                      </span>
                    )}
                  </td>
                  <td className={`${CRM_TD} text-crm-dim`}>
                    {c.company ?? "—"}
                    {(c.segment || c.city) && <span className="block text-[11.5px] text-crm-faint">{[c.segment, c.city].filter(Boolean).join(" · ")}</span>}
                  </td>
                  <td className={`${CRM_TD} text-crm-dim`}>
                    {c.phone && <span className="block whitespace-nowrap">{formatPhone(c.phone)}</span>}
                    {c.email && <span className="block truncate max-w-[200px]">{c.email}</span>}
                  </td>
                  <td className={CRM_TD}>
                    <FollowUp c={c} now={now} />
                  </td>
                  <td className={`${CRM_TD} text-crm-dim whitespace-nowrap`}>
                    {label("source", c.source)}
                    {c.serviceInterest && <span className="block text-[11.5px] text-crm-faint">{label("service", c.serviceInterest)}</span>}
                  </td>
                  <td className={CRM_TD}>
                    <StageTag stage={c.stage} />
                  </td>
                  <td className={CRM_TD}>
                    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-crm-dim">
                      <OwnerAvatar name={c.ownerName} />
                      {c.ownerName ?? ""}
                    </span>
                  </td>
                  <td className={CRM_TD}>
                    <ConsentBadge c={c} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <ul className="md:hidden divide-y divide-crm-line">
            {data?.rows.map((c) => (
              <li key={c.id}>
                <button type="button" onClick={() => onOpenContact(c.id)} className="w-full text-left px-4 py-3 space-y-1 hover:bg-crm-hover">
                  <span className="flex items-center justify-between gap-2">
                    <span className="font-semibold text-[13px] truncate">{c.name}</span>
                    <OwnerAvatar name={c.ownerName} />
                  </span>
                  <span className="block text-[12px] text-crm-dim truncate">
                    {[c.company, c.phone ? formatPhone(c.phone) : c.email].filter(Boolean).join(" · ")}
                  </span>
                  <span className="flex flex-wrap items-center gap-2 text-[11.5px] text-crm-dim">
                    <StageTag stage={c.stage} />
                    <ConsentBadge c={c} />
                    <TemperatureChip value={c.temperature} />
                    <TagChips ids={c.tagIds} max={2} />
                  </span>
                  <FollowUp c={c} now={now} />
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {total > PAGE_SIZE && (
        <nav aria-label="Páginas" className="flex items-center justify-end gap-3 text-[12px] text-crm-dim">
          <span>
            {(page - 1) * PAGE_SIZE + 1}–{Math.min(page * PAGE_SIZE, total)} de {total.toLocaleString("pt-BR")}
          </span>
          <button type="button" disabled={page <= 1} onClick={() => setPage((p) => p - 1)} className={`${CRM_BTN_OUTLINE} disabled:opacity-40`}>
            ← Anterior
          </button>
          <button type="button" disabled={page >= pages} onClick={() => setPage((p) => p + 1)} className={`${CRM_BTN_OUTLINE} disabled:opacity-40`}>
            Próxima →
          </button>
        </nav>
      )}
    </section>
  );
}
