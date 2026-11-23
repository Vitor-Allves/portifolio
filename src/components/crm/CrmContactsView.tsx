"use client";

import { useEffect, useMemo, useState } from "react";
import {
  CRM_STAGES,
  formatPhone,
  stageLabel,
  type CrmContactCard,
  type CrmFacets,
  type CrmPage,
  type CrmTeamMember,
} from "@/lib/crm-types";
import { CONSENT_BADGE, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_TD, CRM_TH, STAGE_DOT } from "./crm-styles";
import { relativeTime } from "./crm-format";
import { Mascot } from "./crm-brand";
import { OwnerAvatar } from "./CrmOwnerAvatar";
import { TagChips, useCatalog } from "./crm-catalog-context";

const PAGE_SIZE = 25;

function ConsentBadge({ c }: { c: CrmContactCard }) {
  const key = c.optedOutAt ? "descadastrado" : c.consentStatus;
  const label = c.optedOutAt ? "Descadastrado" : c.consentStatus === "sim" ? "Aceitou" : "Não informado";
  return <span className={`inline-flex whitespace-nowrap text-[11px] px-2 py-0.5 rounded-full border ${CONSENT_BADGE[key]}`}>{label}</span>;
}

function StageTag({ stage }: { stage: CrmContactCard["stage"] }) {
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap">
      <span className={`h-2 w-2 rounded-full ${STAGE_DOT[stage]}`} aria-hidden="true" />
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
  onNew,
}: {
  team: CrmTeamMember[];
  /** Bumped whenever something changed elsewhere (panel, import) — the list refetches. */
  version: number;
  onOpenContact: (id: string) => void;
  /** Absent when the profile can't import. */
  onImport?: () => void;
  canExport: boolean;
  onNew: () => void;
}) {
  const { label, options, tagGroups } = useCatalog();
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [stage, setStage] = useState("");
  const [owner, setOwner] = useState("all");
  const [source, setSource] = useState("");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [consent, setConsent] = useState("");
  const [tag, setTag] = useState("");
  const [archived, setArchived] = useState(false);
  const [sort, setSort] = useState("recent");
  const [page, setPage] = useState(1);
  const [showFilters, setShowFilters] = useState(false);
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
    if (archived) p.set("archived", "1");
    return p;
  }, [q, stage, owner, source, segment, city, consent, tag, archived]);

  const key = `${params.toString()}|${sort}|${page}|${version}`;

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

  const activeFilters = [stage, owner !== "all" ? owner : "", source, segment, city, consent, tag, archived ? "1" : ""].filter(Boolean).length;
  const loading = result?.key !== key;
  const data = result?.data ?? null;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const filtered = params.toString() !== "";
  const resetPage = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
  };

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
          {CRM_STAGES.map((s) => (
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
                <th className={CRM_TH}>Contato</th>
                <th className={CRM_TH}>Empresa</th>
                <th className={CRM_TH}>WhatsApp / e-mail</th>
                <th className={CRM_TH}>Segmento · cidade</th>
                <th className={CRM_TH}>Origem</th>
                <th className={CRM_TH}>Etapa</th>
                <th className={CRM_TH}>Responsável</th>
                <th className={CRM_TH}>Consentimento</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crm-line">
              {data?.rows.map((c) => (
                <tr key={c.id} onClick={() => onOpenContact(c.id)} className="cursor-pointer hover:bg-crm-hover transition-colors">
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
                      {c.jobTitle ?? (c.lastMessageAt ? `msg ${relativeTime(c.lastMessageAt)}` : "")}
                    </span>
                    {c.tagIds.length > 0 && (
                      <span className="mt-1 block">
                        <TagChips ids={c.tagIds} max={3} />
                      </span>
                    )}
                  </td>
                  <td className={`${CRM_TD} text-crm-dim`}>{c.company ?? "—"}</td>
                  <td className={`${CRM_TD} text-crm-dim`}>
                    {c.phone && <span className="block whitespace-nowrap">{formatPhone(c.phone)}</span>}
                    {c.email && <span className="block truncate max-w-[200px]">{c.email}</span>}
                  </td>
                  <td className={`${CRM_TD} text-crm-dim`}>{[c.segment, c.city].filter(Boolean).join(" · ") || "—"}</td>
                  <td className={`${CRM_TD} text-crm-dim whitespace-nowrap`}>{label("source", c.source)}</td>
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
                    <TagChips ids={c.tagIds} max={2} />
                  </span>
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
