"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import type { CrmCompanyRow, CrmFacets, CrmPage } from "@/lib/crm-types";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_FILTER, CRM_INPUT, CRM_TD, CRM_TH } from "./crm-styles";
import { relativeTime } from "./crm-format";
import { Mascot } from "./crm-brand";

const PAGE_SIZE = 25;

function NewCompanyForm({ onCreated, onCancel }: { onCreated: (id: string) => void; onCancel: () => void }) {
  const [name, setName] = useState("");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    const res = await fetch("/api/crm/companies/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, segment, city }),
    });
    setSaving(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível criar a empresa.");
      return;
    }
    onCreated(((await res.json()) as { id: string }).id);
  }

  return (
    <form onSubmit={submit} className="rounded-2xl border border-crm-line bg-crm-card p-4 shadow-[var(--crm-shadow)] space-y-3">
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
        <input value={name} onChange={(e) => setName(e.target.value)} required autoFocus placeholder="Nome da empresa *" aria-label="Nome da empresa" className={CRM_INPUT} />
        <input value={segment} onChange={(e) => setSegment(e.target.value)} placeholder="Segmento" aria-label="Segmento" className={CRM_INPUT} />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" aria-label="Cidade" className={CRM_INPUT} />
      </div>
      {error && <p className={CRM_ALERT}>{error}</p>}
      <div className="flex justify-end gap-2">
        <button type="button" onClick={onCancel} className="text-[12.5px] px-3 text-crm-dim hover:text-crm-text">
          Cancelar
        </button>
        <button type="submit" disabled={saving} className={CRM_BTN_PRIMARY}>
          {saving ? "Salvando..." : "Criar empresa"}
        </button>
      </div>
    </form>
  );
}

export default function CrmCompaniesView({ version, onOpenCompany }: { version: number; onOpenCompany: (id: string) => void }) {
  const [query, setQuery] = useState("");
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState("");
  const [city, setCity] = useState("");
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [facets, setFacets] = useState<CrmFacets>({ segments: [], cities: [] });
  const [result, setResult] = useState<{ key: string; data: CrmPage<CrmCompanyRow> | null; error: string | null } | null>(null);

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
    if (segment) p.set("segment", segment);
    if (city) p.set("city", city);
    return p;
  }, [q, segment, city]);
  const key = `${params}|${page}|${version}`;

  useEffect(() => {
    let cancelled = false;
    const p = new URLSearchParams(params);
    p.set("page", String(page));
    p.set("pageSize", String(PAGE_SIZE));
    fetch(`/api/crm/companies/?${p}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("Não foi possível carregar as empresas.");
        return (await res.json()) as CrmPage<CrmCompanyRow>;
      })
      .then((data) => !cancelled && setResult({ key, data, error: null }))
      .catch((err: Error) => !cancelled && setResult({ key, data: null, error: err.message }));
    return () => {
      cancelled = true;
    };
  }, [params, page, key]);

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

  const loading = result?.key !== key;
  const data = result?.data ?? null;
  const total = data?.total ?? 0;
  const pages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <section aria-label="Empresas" className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar empresa"
          aria-label="Buscar empresas"
          className={`${CRM_INPUT} !w-64 max-w-full !rounded-full !py-1.5`}
        />
        {facets.segments.length > 0 && (
          <select value={segment} onChange={(e) => (setSegment(e.target.value), setPage(1))} aria-label="Segmento" className={CRM_FILTER}>
            <option value="">Todos os segmentos</option>
            {facets.segments.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        )}
        {facets.cities.length > 0 && (
          <select value={city} onChange={(e) => (setCity(e.target.value), setPage(1))} aria-label="Cidade" className={CRM_FILTER}>
            <option value="">Todas as cidades</option>
            {facets.cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        )}
        <button type="button" onClick={() => setCreating(true)} className={`ml-auto ${CRM_BTN_PRIMARY}`}>
          + Nova empresa
        </button>
      </div>

      {creating && (
        <NewCompanyForm
          onCancel={() => setCreating(false)}
          onCreated={(id) => {
            setCreating(false);
            onOpenCompany(id);
          }}
        />
      )}

      <p className="text-[12px] text-crm-dim" aria-live="polite">
        {loading && !data ? "Carregando..." : `${total.toLocaleString("pt-BR")} empresa${total === 1 ? "" : "s"}`}
      </p>
      {result?.error && <p className="text-[12.5px] text-crm-red">{result.error}</p>}

      {data && data.rows.length === 0 ? (
        <div className="flex items-end justify-between gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 overflow-hidden">
          <div className="pb-6">
            <p className="crm-display text-[17px] mb-1">{params.toString() ? "Nenhuma empresa encontrada" : "Nenhuma empresa ainda"}</p>
            <p className="text-[12.5px] text-crm-dim">As empresas aparecem aqui quando você informa a empresa de um contato ou importa uma planilha.</p>
          </div>
          <Mascot name="titanDoubt" decorative className="h-28 w-auto shrink-0" />
        </div>
      ) : (
        <div className={`rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-hidden transition-opacity ${loading ? "opacity-60" : ""}`}>
          <table className="w-full text-[12.5px]">
            <thead className="bg-crm-sunken border-b border-crm-line">
              <tr>
                <th className={CRM_TH}>Empresa</th>
                <th className={`${CRM_TH} hidden sm:table-cell`}>Segmento</th>
                <th className={`${CRM_TH} hidden sm:table-cell`}>Cidade</th>
                <th className={`${CRM_TH} text-right`}>Contatos</th>
                <th className={`${CRM_TH} text-right hidden md:table-cell`}>No funil</th>
                <th className={`${CRM_TH} text-right hidden md:table-cell`}>Ganhos</th>
                <th className={`${CRM_TH} hidden lg:table-cell`}>Última atividade</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-crm-line">
              {data?.rows.map((co) => (
                <tr key={co.id} onClick={() => onOpenCompany(co.id)} className="cursor-pointer hover:bg-crm-hover transition-colors">
                  <td className={CRM_TD}>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        onOpenCompany(co.id);
                      }}
                      className="text-left font-semibold text-crm-text hover:underline"
                    >
                      {co.name}
                    </button>
                    <span className="block sm:hidden text-[11.5px] text-crm-faint">{[co.segment, co.city].filter(Boolean).join(" · ")}</span>
                  </td>
                  <td className={`${CRM_TD} text-crm-dim hidden sm:table-cell`}>{co.segment ?? "—"}</td>
                  <td className={`${CRM_TD} text-crm-dim hidden sm:table-cell`}>{co.city ?? "—"}</td>
                  <td className={`${CRM_TD} text-right tabular-nums`}>{co.contactCount}</td>
                  <td className={`${CRM_TD} text-right tabular-nums hidden md:table-cell`}>{co.openCount}</td>
                  <td className={`${CRM_TD} text-right tabular-nums text-crm-green hidden md:table-cell`}>{co.wonCount || ""}</td>
                  <td className={`${CRM_TD} text-crm-faint hidden lg:table-cell`}>{co.lastActivityAt ? relativeTime(co.lastActivityAt) : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
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
