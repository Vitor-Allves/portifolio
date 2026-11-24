"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CRM_STAGES, type CrmFacets, type CrmTeamMember, type CrmTemplate } from "@/lib/crm-types";
import {
  MAX_EXCLUDED,
  PARAM_SOURCES,
  campaignStatusLabel,
  type AudienceMember,
  type AudiencePreview,
  type CampaignAudience,
  type CampaignCounts,
  type CampaignDetail,
  type CampaignParam,
  type CampaignStatus,
  type CampaignSummary,
  type ParamSource,
  type SavedAudience,
} from "@/lib/crm-campaign-rules";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, CRM_TD, CRM_TH } from "./crm-styles";
import { dateTime } from "./crm-format";
import { Mascot } from "./crm-brand";
import { useCatalog } from "./crm-catalog-context";

const STATUS_TONE: Record<CampaignStatus, string> = {
  rascunho: "bg-crm-sunken text-crm-dim border-crm-line",
  enviando: "bg-crm-accent/10 text-crm-accent border-crm-accent/25",
  pausada: "bg-crm-amber/10 text-crm-amber border-crm-amber/25",
  concluida: "bg-crm-green/10 text-crm-green border-crm-green/25",
  cancelada: "bg-crm-red/10 text-crm-red border-crm-red/25",
};

const RECIPIENT_LABEL: Record<string, string> = {
  pendente: "Na fila",
  enviando: "Enviando",
  enviada: "Enviada",
  falhou: "Falhou",
  pulada: "Ficou de fora",
};
const DELIVERY_LABEL: Record<string, string> = { sent: "Enviada", delivered: "Entregue", read: "Lida", failed: "Falhou" };

function StatusPill({ status }: { status: CampaignStatus }) {
  return <span className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${STATUS_TONE[status]}`}>{campaignStatusLabel(status)}</span>;
}

async function api<T>(url: string, init?: { method?: string; body?: unknown }): Promise<T> {
  const res = await fetch(url, {
    method: init?.method ?? "GET",
    headers: init?.body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: init?.body !== undefined ? JSON.stringify(init.body) : undefined,
  });
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error ?? "Não foi possível falar com o CRM agora.");
  return data;
}

const pctOf = (n: number, of: number) => (of > 0 ? `${Math.round((n / of) * 100)}%` : "—");

type Screen = { kind: "list" } | { kind: "edit"; id: string | null } | { kind: "detail"; id: string };

export default function CrmCampaignsView({
  team,
  canSend,
  templatesConfigured,
  onOpenContact,
}: {
  team: CrmTeamMember[];
  canSend: boolean;
  templatesConfigured: boolean;
  onOpenContact: (contactId: string) => void;
}) {
  const [screen, setScreen] = useState<Screen>({ kind: "list" });
  if (screen.kind === "edit")
    return (
      <CampaignEditor
        key={screen.id ?? "new"}
        id={screen.id}
        team={team}
        canSend={canSend}
        templatesConfigured={templatesConfigured}
        onBack={() => setScreen({ kind: "list" })}
        onStarted={(id) => setScreen({ kind: "detail", id })}
      />
    );
  if (screen.kind === "detail")
    return <CampaignResults key={screen.id} id={screen.id} canSend={canSend} autoSend onBack={() => setScreen({ kind: "list" })} onOpenContact={onOpenContact} />;
  return <CampaignList canSend={canSend} onNew={() => setScreen({ kind: "edit", id: null })} onOpen={(c) => setScreen(c.status === "rascunho" ? { kind: "edit", id: c.id } : { kind: "detail", id: c.id })} />;
}

// ---------------- list ----------------

function CampaignList({ canSend, onNew, onOpen }: { canSend: boolean; onNew: () => void; onOpen: (c: CampaignSummary) => void }) {
  const [campaigns, setCampaigns] = useState<CampaignSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<{ campaigns: CampaignSummary[] }>("/api/crm/campaigns/")
      .then((d) => !cancelled && setCampaigns(d.campaigns))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <section aria-label="Campanhas" className="space-y-4 max-w-5xl">
      <div className="flex flex-wrap items-center gap-3">
        <p className="text-[12.5px] text-crm-dim">
          {canSend ? "Monte o público, escolha o modelo e envie." : "Monte a campanha e salve o rascunho. Um Administrador ou Gestor faz o disparo."}
        </p>
        <button type="button" onClick={onNew} className={`${CRM_BTN_PRIMARY} ml-auto gap-1`}>
          <span aria-hidden="true">+</span> Nova campanha
        </button>
      </div>
      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}
      {campaigns && campaigns.length === 0 && (
        <div className="flex items-end gap-4 rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] px-6 pt-5 max-w-xl overflow-hidden">
          <div className="pb-5">
            <p className="crm-display text-[17px] mb-1">Nenhuma campanha ainda</p>
            <p className="text-[12.5px] text-crm-dim leading-relaxed">
              Uma campanha manda um modelo aprovado do WhatsApp para um grupo de contatos, por exemplo todos os leads do BNI que aceitaram contato.
              Só recebe quem aceitou contato e não pediu para sair.
            </p>
          </div>
          <Mascot name="legacyHello" decorative className="h-28 w-auto shrink-0" />
        </div>
      )}
      {!campaigns && !error && <p className="text-[12.5px] text-crm-dim">Carregando campanhas...</p>}
      {campaigns && campaigns.length > 0 && (
        <ul className="space-y-2">
          {campaigns.map((c) => {
            const k = c.counts;
            return (
              <li key={c.id}>
                <button
                  type="button"
                  onClick={() => onOpen(c)}
                  className="w-full text-left rounded-xl border border-crm-line bg-crm-card px-4 py-3 shadow-[var(--crm-shadow)] hover:border-crm-line-strong transition-colors"
                >
                  <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                    <span className="font-semibold text-[14px] min-w-0 truncate">{c.name}</span>
                    <StatusPill status={c.status} />
                    <span className="text-[11.5px] text-crm-faint ml-auto">
                      {c.startedAt ? `Enviada em ${dateTime(c.startedAt)}${c.startedByName ? ` por ${c.startedByName}` : ""}` : `Criada em ${dateTime(c.createdAt)}${c.createdByName ? ` por ${c.createdByName}` : ""}`}
                    </span>
                  </span>
                  <span className="mt-1 block text-[12px] text-crm-dim">
                    {c.status === "rascunho" ? (
                      <>Rascunho{c.templateName ? ` · modelo ${c.templateName}` : " · sem modelo escolhido"}</>
                    ) : (
                      <>
                        {k.sent} enviadas · {k.delivered} entregues · {k.read} lidas · {k.replied} responderam
                        {k.interested > 0 ? ` · ${k.interested} ${k.interested === 1 ? "interessado" : "interessados"}` : ""}
                        {k.failed > 0 ? ` · ${k.failed} falharam` : ""}
                        {k.pending > 0 ? ` · ${k.pending} na fila` : ""}
                      </>
                    )}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

// ---------------- editor ----------------

const EMPTY_AUDIENCE: CampaignAudience = {};

/** The filters a saved audience holds (everything but the people taken out by hand). */
type FilterKey = Exclude<keyof CampaignAudience, "exclude">;
const filtersOf = ({ exclude: _out, ...filters }: CampaignAudience): Omit<CampaignAudience, "exclude"> => {
  void _out;
  return filters;
};
const sameFilters = (a: CampaignAudience, b: CampaignAudience) => {
  const norm = (x: CampaignAudience) => JSON.stringify(Object.entries(filtersOf(x)).sort(([k1], [k2]) => k1.localeCompare(k2)));
  return norm(a) === norm(b);
};

function placeholdersOf(body: string | null | undefined): number {
  return new Set(body?.match(/\{\{\d+\}\}/g) ?? []).size;
}

function CampaignEditor({
  id: initialId,
  team,
  canSend,
  templatesConfigured,
  onBack,
  onStarted,
}: {
  id: string | null;
  team: CrmTeamMember[];
  canSend: boolean;
  templatesConfigured: boolean;
  onBack: () => void;
  onStarted: (id: string) => void;
}) {
  const { options, tagGroups } = useCatalog();
  const [id, setId] = useState(initialId);
  const [loaded, setLoaded] = useState(initialId === null);
  const [name, setName] = useState("");
  const [audience, setAudience] = useState<CampaignAudience>(EMPTY_AUDIENCE);
  const [template, setTemplate] = useState<{ name: string; language: string; body: string | null } | null>(null);
  const [params, setParams] = useState<CampaignParam[]>([]);
  const [templates, setTemplates] = useState<CrmTemplate[] | null>(null);
  const [templatesError, setTemplatesError] = useState<string | null>(null);
  const [facets, setFacets] = useState<CrmFacets>({ segments: [], cities: [] });
  const [preview, setPreview] = useState<{ key: string; data: AudiencePreview } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saved, setSaved] = useState<SavedAudience[]>([]);
  const [savingAs, setSavingAs] = useState<string | null>(null);
  /** Feedback next to the audience controls (saved audiences, people taken out). */
  const [audienceMsg, setAudienceMsg] = useState<{ error: boolean; text: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    api<CrmFacets>("/api/crm/facets/").then((f) => !cancelled && setFacets(f)).catch(() => {});
    api<{ audiences: SavedAudience[] }>("/api/crm/campaigns/audiences/").then((d) => !cancelled && setSaved(d.audiences)).catch(() => {});
    if (templatesConfigured) {
      api<{ templates: CrmTemplate[] }>("/api/crm/templates/")
        .then((d) => !cancelled && setTemplates(d.templates))
        .catch((e: Error) => !cancelled && setTemplatesError(e.message));
    }
    if (initialId) {
      api<{ campaign: CampaignDetail }>(`/api/crm/campaigns/${initialId}/`)
        .then(({ campaign: c }) => {
          if (cancelled) return;
          setName(c.name);
          setAudience(c.audience);
          setTemplate(c.templateName && c.templateLanguage ? { name: c.templateName, language: c.templateLanguage, body: c.templateBody } : null);
          setParams(c.params);
          setLoaded(true);
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    }
    return () => {
      cancelled = true;
    };
  }, [initialId, templatesConfigured]);

  // Live count of who receives it, refreshed a moment after the filters or the message change.
  const previewKey = JSON.stringify({ audience, params, body: template?.body ?? null });
  useEffect(() => {
    if (!loaded) return;
    let cancelled = false;
    const timer = setTimeout(() => {
      api<{ preview: AudiencePreview }>("/api/crm/campaigns/preview/", { method: "POST", body: { audience, params, templateBody: template?.body ?? null } })
        .then((d) => !cancelled && setPreview({ key: previewKey, data: d.preview }))
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [previewKey, loaded, audience, params, template]);

  const paramCount = placeholdersOf(template?.body);
  const pv = preview?.data ?? null;
  const previewStale = preview?.key !== previewKey;

  function pickTemplate(value: string) {
    const t = templates?.find((x) => `${x.name}|${x.language}` === value) ?? null;
    setTemplate(t ? { name: t.name, language: t.language, body: t.bodyText } : null);
    const n = placeholdersOf(t?.bodyText);
    setParams((prev) => Array.from({ length: n }, (_, i) => prev[i] ?? { source: i === 0 ? "first_name" : "text", text: "" }));
  }

  function setParam(i: number, patch: Partial<CampaignParam>) {
    setParams((prev) => prev.map((p, j) => (j === i ? { ...p, ...patch } : p)));
  }

  function setFilter(key: FilterKey, value: string) {
    setAudience((prev) => {
      const next = { ...prev };
      if (value && value !== "all") next[key] = value;
      else delete next[key];
      return next;
    });
  }

  /** Takes people out of this campaign (or brings them back). */
  function setExcluded(contactIds: string[], out: boolean) {
    if (out && (audience.exclude?.length ?? 0) + contactIds.length > MAX_EXCLUDED) {
      setAudienceMsg({ error: true, text: `Dá para tirar até ${MAX_EXCLUDED} pessoas à mão. Use um filtro para deixar de fora um grupo maior.` });
      return;
    }
    setAudienceMsg(null);
    setAudience((prev) => {
      const set = new Set(prev.exclude ?? []);
      for (const id of contactIds) {
        if (out) set.add(id);
        else set.delete(id);
      }
      const next = { ...prev };
      if (set.size > 0) next.exclude = [...set];
      else delete next.exclude;
      return next;
    });
  }

  // ---- públicos salvos ----
  const savedMatch = saved.find((a) => sameFilters(a.audience, audience)) ?? null;
  const hasFilters = Object.keys(filtersOf(audience)).length > 0;

  function applySaved(savedId: string) {
    const a = saved.find((x) => x.id === savedId);
    if (!a) return;
    setAudience((prev) => ({ ...a.audience, ...(prev.exclude ? { exclude: prev.exclude } : {}) }));
  }

  async function saveCurrentAudience() {
    if (savingAs === null) return;
    setAudienceMsg(null);
    try {
      const { audience: a } = await api<{ audience: SavedAudience }>("/api/crm/campaigns/audiences/", { method: "POST", body: { name: savingAs, audience: filtersOf(audience) } });
      setSaved((prev) => [...prev.filter((x) => x.id !== a.id), a].sort((x, y) => x.name.localeCompare(y.name, "pt-BR")));
      setSavingAs(null);
      setAudienceMsg({ error: false, text: `Público “${a.name}” salvo. Ele aparece em “Público salvo” nas próximas campanhas.` });
    } catch (e) {
      setAudienceMsg({ error: true, text: (e as Error).message });
    }
  }

  async function deleteSaved(a: SavedAudience) {
    if (!window.confirm(`Apagar o público salvo “${a.name}”? As campanhas que já usaram continuam como estão.`)) return;
    try {
      await api(`/api/crm/campaigns/audiences/${a.id}/`, { method: "DELETE" });
      setSaved((prev) => prev.filter((x) => x.id !== a.id));
      setAudienceMsg({ error: false, text: `Público “${a.name}” apagado. Os filtros continuam nesta campanha.` });
    } catch (e) {
      setAudienceMsg({ error: true, text: (e as Error).message });
    }
  }

  const missing = useMemo(() => {
    const out: string[] = [];
    if (!name.trim()) out.push("o nome");
    if (!template) out.push("o modelo");
    if (params.slice(0, paramCount).some((p) => p.source !== "first_name" && p.source !== "name" && !p.text.trim())) out.push("os textos dos campos");
    return out;
  }, [name, template, params, paramCount]);

  async function save(): Promise<string | null> {
    setBusy(true);
    setError(null);
    setNotice(null);
    const body = { name, templateName: template?.name ?? null, templateLanguage: template?.language ?? null, templateBody: template?.body ?? null, params, audience };
    try {
      if (id) await api(`/api/crm/campaigns/${id}/`, { method: "PATCH", body });
      else {
        const r = await api<{ id: string }>("/api/crm/campaigns/", { method: "POST", body });
        setId(r.id);
        return r.id;
      }
      return id;
    } catch (e) {
      setError((e as Error).message);
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function saveDraft() {
    if (await save()) setNotice(canSend ? "Rascunho salvo." : "Rascunho salvo. Avise um Administrador ou Gestor para disparar.");
  }

  async function remove() {
    if (!id) return onBack();
    if (!window.confirm("Excluir este rascunho?")) return;
    try {
      await api(`/api/crm/campaigns/${id}/`, { method: "DELETE" });
      onBack();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function start() {
    const savedId = await save();
    if (!savedId) return;
    setBusy(true);
    try {
      await api(`/api/crm/campaigns/${savedId}/send/`, { method: "POST", body: { action: "start" } });
      onStarted(savedId);
    } catch (e) {
      setError((e as Error).message);
      setConfirming(false);
    } finally {
      setBusy(false);
    }
  }

  if (!loaded) return <p className="text-[12.5px] text-crm-dim">{error ?? "Carregando campanha..."}</p>;

  return (
    <section aria-label="Montar campanha" className="space-y-4 max-w-5xl">
      <button type="button" onClick={onBack} className={CRM_LINK_BTN}>
        ← Todas as campanhas
      </button>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_320px] items-start">
        <div className="space-y-4 min-w-0">
          {/* 1. Nome e público */}
          <Step n={1} title="Nome e público">
            <label className="block">
              <span className={CRM_LABEL}>Nome da campanha</span>
              <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} placeholder="Ex.: Condição de novembro · BNI" className={`${CRM_INPUT} mt-1`} />
            </label>
            <div className="mt-3 flex flex-wrap items-end gap-x-3 gap-y-1">
              <label className="block min-w-0 flex-1 basis-56">
                <span className={CRM_LABEL}>Público salvo</span>
                <select value={savedMatch?.id ?? ""} onChange={(e) => applySaved(e.target.value)} className={`${CRM_INPUT} mt-1`} aria-label="Público salvo">
                  <option value="">{saved.length ? (hasFilters ? "Filtros abaixo (não salvos)" : "Nenhum: escolha os filtros") : "Nenhum público salvo ainda"}</option>
                  {saved.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name}
                    </option>
                  ))}
                </select>
              </label>
              {savedMatch && (
                <button type="button" onClick={() => void deleteSaved(savedMatch)} className={`${CRM_LINK_BTN} !text-crm-red pb-2`}>
                  Apagar público salvo
                </button>
              )}
            </div>
            <p className="mt-3 text-[12px] text-crm-dim">Quem deve receber? Deixe em “Todos” o que não importa.</p>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              <FilterSelect label="Etapa do funil" value={audience.stage} onChange={(v) => setFilter("stage", v)} options={CRM_STAGES.map((s) => [s.id, s.label])} />
              <FilterSelect label="Origem" value={audience.source} onChange={(v) => setFilter("source", v)} options={options("source").map((s) => [s.id, s.label] as [string, string])} />
              <FilterSelect
                label="Responsável"
                value={audience.owner}
                onChange={(v) => setFilter("owner", v)}
                options={[["none", "Sem responsável"], ...team.map((m) => [m.id, m.name] as [string, string])]}
              />
              <FilterSelect label="Segmento" value={audience.segment} onChange={(v) => setFilter("segment", v)} options={facets.segments.map((s) => [s, s])} />
              <FilterSelect label="Cidade" value={audience.city} onChange={(v) => setFilter("city", v)} options={facets.cities.map((s) => [s, s])} />
              <FilterSelect
                label="Etiqueta"
                value={audience.tag}
                onChange={(v) => setFilter("tag", v)}
                options={tagGroups.flatMap((g) => g.tags.map((t) => [t.id, `${g.label}: ${t.label}`] as [string, string]))}
              />
              <label className="block min-w-0">
                <span className={CRM_LABEL}>Cadastrado a partir de</span>
                <input type="date" value={audience.createdFrom ?? ""} onChange={(e) => setFilter("createdFrom", e.target.value)} className={`${CRM_INPUT} mt-1`} />
              </label>
              <label className="block min-w-0">
                <span className={CRM_LABEL}>Cadastrado até</span>
                <input type="date" value={audience.createdTo ?? ""} onChange={(e) => setFilter("createdTo", e.target.value)} className={`${CRM_INPUT} mt-1`} />
              </label>
            </div>
            {audience.createdFrom && audience.createdTo && audience.createdFrom > audience.createdTo && (
              <p className="mt-1.5 text-[12px] text-crm-amber">A data “a partir de” é depois da data “até”: ninguém entra nesse período.</p>
            )}
            {savingAs === null ? (
              <button type="button" disabled={!hasFilters} onClick={() => setSavingAs(savedMatch?.name ?? "")} className={`${CRM_LINK_BTN} mt-2`}>
                {savedMatch ? "Salvar com outro nome" : "Salvar estes filtros como público"}
              </button>
            ) : (
              <form
                className="mt-2 flex flex-wrap items-center gap-2"
                onSubmit={(e) => {
                  e.preventDefault();
                  void saveCurrentAudience();
                }}
              >
                <input
                  value={savingAs}
                  onChange={(e) => setSavingAs(e.target.value)}
                  maxLength={80}
                  autoFocus
                  aria-label="Nome do público"
                  placeholder="Ex.: Leads do BNI em Sorocaba"
                  className={`${CRM_INPUT} flex-1 basis-56 min-w-0`}
                />
                <button type="submit" disabled={!savingAs.trim()} className={CRM_BTN_PRIMARY}>
                  Salvar público
                </button>
                <button type="button" onClick={() => setSavingAs(null)} className={CRM_BTN_OUTLINE}>
                  Cancelar
                </button>
                <p className="basis-full text-[11.5px] text-crm-faint">Guarda só os filtros. Usar um nome que já existe troca os filtros dele.</p>
              </form>
            )}
            {audienceMsg && (
              <p
                role={audienceMsg.error ? "alert" : "status"}
                className={audienceMsg.error ? `${CRM_ALERT} mt-2` : "mt-2 rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green"}
              >
                {audienceMsg.text}
              </p>
            )}
            <AudienceMembers audience={audience} onExclude={setExcluded} />
          </Step>

          {/* 2. Mensagem */}
          <Step n={2} title="Mensagem">
            {!templatesConfigured ? (
              <p className={CRM_ALERT}>Os modelos aparecem aqui depois que o WhatsApp oficial for conectado ao CRM. Até lá, dá para montar o público e salvar o rascunho.</p>
            ) : templatesError ? (
              <p className={CRM_ALERT}>{templatesError}</p>
            ) : (
              <>
                <label className="block">
                  <span className={CRM_LABEL}>Modelo aprovado pela Meta</span>
                  <select
                    value={template ? `${template.name}|${template.language}` : ""}
                    onChange={(e) => pickTemplate(e.target.value)}
                    className={`${CRM_INPUT} mt-1`}
                    aria-label="Modelo aprovado pela Meta"
                  >
                    <option value="">{templates ? "Escolha um modelo" : "Carregando modelos..."}</option>
                    {template && templates && !templates.some((t) => t.name === template.name && t.language === template.language) && (
                      <option value={`${template.name}|${template.language}`}>{template.name} (não está mais aprovado)</option>
                    )}
                    {(templates ?? []).map((t) => (
                      <option key={`${t.name}|${t.language}`} value={`${t.name}|${t.language}`}>
                        {t.name} · {t.language}
                        {t.category === "MARKETING" ? " · marketing" : t.category === "UTILITY" ? " · utilidade" : ""}
                      </option>
                    ))}
                  </select>
                </label>
                {template?.body && <p className="mt-2 rounded-lg bg-crm-sunken px-3 py-2 text-[12.5px] text-crm-dim whitespace-pre-wrap">{template.body}</p>}
                {paramCount > 0 && (
                  <div className="mt-3 space-y-2">
                    <p className="text-[12px] text-crm-dim">O que vai em cada campo do modelo:</p>
                    {params.slice(0, paramCount).map((p, i) => {
                      const isName = p.source === "first_name" || p.source === "name";
                      return (
                        <div key={i} className="grid grid-cols-[2.5rem_minmax(0,1fr)] sm:grid-cols-[2.5rem_minmax(0,14rem)_minmax(0,1fr)] gap-2 items-center">
                          <span className="text-[12px] font-semibold text-crm-faint">{`{{${i + 1}}}`}</span>
                          <select
                            value={p.source}
                            onChange={(e) => setParam(i, { source: e.target.value as ParamSource })}
                            aria-label={`Campo ${i + 1}: de onde vem`}
                            className={CRM_INPUT}
                          >
                            {PARAM_SOURCES.map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.label}
                              </option>
                            ))}
                          </select>
                          <input
                            value={p.text}
                            onChange={(e) => setParam(i, { text: e.target.value })}
                            maxLength={200}
                            aria-label={p.source === "text" ? `Campo ${i + 1}: texto` : `Campo ${i + 1}: texto se o dado faltar`}
                            placeholder={p.source === "text" ? "Texto" : isName ? "Texto se faltar (opcional)" : "Texto se o dado faltar"}
                            className={`${CRM_INPUT} col-start-2 sm:col-start-auto`}
                          />
                        </div>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </Step>

          {/* 3. Revisão e envio */}
          <Step n={3} title="Revisar e enviar">
            {error && (
              <p className={`${CRM_ALERT} mb-3`} role="alert">
                {error}
              </p>
            )}
            {notice && (
              <p className="mb-3 rounded-lg border border-crm-green/30 bg-crm-green/[0.07] px-3 py-2 text-[12px] text-crm-green" role="status">
                {notice}
              </p>
            )}
            {pv && (
              <p className="lg:hidden mb-2 text-[13px]">
                <strong className="text-[16px]">{pv.eligible}</strong> {pv.eligible === 1 ? "pessoa vai" : "pessoas vão"} receber · {pv.matched + pv.excludedByHand - pv.eligible}{" "}
                ficam de fora (detalhes abaixo)
              </p>
            )}
            <p className="text-[12.5px] text-crm-dim leading-relaxed">
              O envio acontece com esta página aberta, em pequenos lotes. Cada mensagem de modelo é cobrada pela Meta. Quem responder <strong className="text-crm-text">SAIR</strong> é
              descadastrado na hora.
            </p>
            {confirming ? (
              <div className="mt-3 rounded-xl border border-crm-accent/30 bg-crm-accent/[0.06] px-4 py-3" role="alertdialog" aria-label="Confirmar envio">
                <p className="text-[13px] font-semibold">
                  Enviar “{template?.name}” para {pv?.eligible ?? "…"} {pv?.eligible === 1 ? "pessoa" : "pessoas"} agora?
                </p>
                <p className="text-[12px] text-crm-dim mt-0.5">Depois de começar, a mensagem e o público não mudam mais. Dá para pausar ou cancelar.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" disabled={busy} onClick={() => void start()} className={CRM_BTN_PRIMARY}>
                    {busy ? "Começando..." : "Confirmar e enviar"}
                  </button>
                  <button type="button" disabled={busy} onClick={() => setConfirming(false)} className={CRM_BTN_OUTLINE}>
                    Voltar
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-3 flex flex-wrap items-center gap-2">
                <button type="button" disabled={busy || !name.trim()} onClick={() => void saveDraft()} className={CRM_BTN_OUTLINE}>
                  Salvar rascunho
                </button>
                {canSend && (
                  <button
                    type="button"
                    disabled={busy || missing.length > 0 || !pv || previewStale || pv.eligible === 0}
                    onClick={() => setConfirming(true)}
                    className={CRM_BTN_PRIMARY}
                  >
                    Enviar agora
                  </button>
                )}
                <button type="button" onClick={() => void remove()} className={`${CRM_LINK_BTN} !text-crm-red ml-auto`}>
                  {id ? "Excluir rascunho" : "Descartar"}
                </button>
                {missing.length > 0 && <p className="basis-full text-[11.5px] text-crm-faint">Falta preencher {missing.join(", ")}.</p>}
                {!canSend && <p className="basis-full text-[11.5px] text-crm-faint">Seu perfil monta campanhas; o disparo é feito por um Administrador ou Gestor.</p>}
              </div>
            )}
          </Step>
        </div>

        {/* Who receives it — always in view */}
        <aside aria-label="Quem vai receber" className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4 lg:sticky lg:top-20 space-y-3">
          <div>
            <p className={CRM_LABEL}>Vão receber</p>
            <p className={`crm-display text-[34px] leading-none mt-1 ${previewStale ? "opacity-50" : ""}`} aria-live="polite">
              {pv ? pv.eligible : "…"}
            </p>
            {pv && (
              <p className="text-[12px] text-crm-dim mt-1">
                de {pv.matched + pv.excludedByHand} {pv.matched + pv.excludedByHand === 1 ? "contato" : "contatos"} no filtro
              </p>
            )}
          </div>
          {pv && (pv.excluded.length > 0 || pv.excludedByHand > 0) && (
            <div>
              <p className={CRM_LABEL}>Ficam de fora</p>
              <ul className="mt-1 space-y-0.5 text-[12.5px]">
                {pv.excludedByHand > 0 && (
                  <li className="flex justify-between gap-2">
                    <span className="text-crm-dim">Tirados por você</span>
                    <span className="font-semibold tabular-nums">{pv.excludedByHand}</span>
                  </li>
                )}
                {pv.excluded.map((e) => (
                  <li key={e.reason} className="flex justify-between gap-2">
                    <span className="text-crm-dim">{e.label}</span>
                    <span className="font-semibold tabular-nums">{e.count}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pv && pv.sample.length > 0 && template?.body && (
            <div>
              <p className={CRM_LABEL}>Como chega</p>
              <ul className="mt-1.5 space-y-2">
                {pv.sample.slice(0, 2).map((s) => (
                  <li key={s.name}>
                    <p className="text-[11px] text-crm-faint">Para {s.name}</p>
                    <p className="mt-0.5 rounded-xl rounded-tr-sm bg-crm-accent/[0.09] px-3 py-2 text-[12.5px] whitespace-pre-wrap break-words">{s.message}</p>
                  </li>
                ))}
              </ul>
            </div>
          )}
          {pv && pv.eligible === 0 && <p className="text-[12px] text-crm-amber">Ninguém deste filtro pode receber. Confira o consentimento dos contatos.</p>}
          {!template && <p className="text-[12px] text-crm-faint">Escolha o modelo para ver como a mensagem chega.</p>}
        </aside>
      </div>
    </section>
  );
}

/**
 * "Quem vai receber": everyone the filters would send to, searchable, with a
 * way to take someone out of this campaign (and bring them back). Opens on
 * demand; the list only reloads when the filters or the search change.
 */
function AudienceMembers({ audience, onExclude }: { audience: CampaignAudience; onExclude: (contactIds: string[], out: boolean) => void }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const [data, setData] = useState<{ key: string; rows: AudienceMember[]; total: number; page: number; pageSize: number } | null>(null);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const excluded = useMemo(() => new Set(audience.exclude ?? []), [audience.exclude]);
  const key = JSON.stringify({ filters: filtersOf(audience), q: q.trim() });

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const { filters, q: search } = JSON.parse(key) as { filters: CampaignAudience; q: string };
    const timer = setTimeout(() => {
      api<{ rows: AudienceMember[]; total: number; page: number; pageSize: number }>("/api/crm/campaigns/preview/list/", { method: "POST", body: { audience: filters, q: search, page: 1 } })
        .then((d) => {
          if (cancelled) return;
          setError(null);
          setData({ key, ...d });
        })
        .catch((e: Error) => !cancelled && setError(e.message));
    }, 250);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [open, key]);

  async function more() {
    if (!data) return;
    setLoadingMore(true);
    try {
      const { filters, q: search } = JSON.parse(data.key) as { filters: CampaignAudience; q: string };
      const d = await api<{ rows: AudienceMember[]; total: number; page: number; pageSize: number }>("/api/crm/campaigns/preview/list/", {
        method: "POST",
        body: { audience: filters, q: search, page: data.page + 1 },
      });
      setData((prev) => (prev && prev.key === data.key ? { ...prev, rows: [...prev.rows, ...d.rows], page: d.page, total: d.total } : prev));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoadingMore(false);
    }
  }

  const stale = data?.key !== key;
  return (
    <div className="mt-4 border-t border-crm-line pt-3">
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className={CRM_LINK_BTN}>
        {open ? "Esconder a lista" : "Ver a lista de quem vai receber"}
        {excluded.size > 0 && ` · ${excluded.size} ${excluded.size === 1 ? "tirado" : "tirados"} por você`}
      </button>
      {open && (
        <div role="region" aria-label="Lista de destinatários" className="mt-2">
          <div className="flex flex-wrap items-center gap-2">
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar por nome, empresa ou telefone" aria-label="Buscar na lista" className={`${CRM_INPUT} flex-1 basis-56 min-w-0`} />
            {excluded.size > 0 && (
              <button type="button" onClick={() => onExclude([...excluded], false)} className={CRM_LINK_BTN}>
                Incluir todos de volta
              </button>
            )}
          </div>
          {error && <p className={`${CRM_ALERT} mt-2`}>{error}</p>}
          {!data && !error && <p className="mt-2 text-[12px] text-crm-dim">Carregando...</p>}
          {data && (
            <div className={stale ? "opacity-60" : undefined}>
              <p className="mt-2 text-[12px] text-crm-dim">
                {data.total} {data.total === 1 ? "pessoa pode" : "pessoas podem"} receber{q.trim() ? " nesta busca" : ""}. Quem você tirar fica fora só desta campanha.
              </p>
              {data.rows.length === 0 ? (
                <p className="mt-2 text-[12px] text-crm-faint">Ninguém aqui.</p>
              ) : (
                <ul className="mt-1 divide-y divide-crm-line max-h-80 overflow-y-auto pr-1">
                  {data.rows.map((m) => {
                    const out = excluded.has(m.id);
                    const sub = [m.company, m.ownerName ? `com ${m.ownerName}` : null].filter(Boolean).join(" · ");
                    return (
                      <li key={m.id} className="flex items-center gap-3 py-1.5">
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate text-[13px] font-medium ${out ? "line-through text-crm-faint" : ""}`}>{m.name}</span>
                          {sub && <span className="block truncate text-[11.5px] text-crm-faint">{sub}</span>}
                        </span>
                        <button
                          type="button"
                          onClick={() => onExclude([m.id], !out)}
                          aria-label={out ? `Incluir ${m.name} de volta` : `Tirar ${m.name} da campanha`}
                          className={`${CRM_LINK_BTN} shrink-0 ${out ? "" : "!text-crm-red"}`}
                        >
                          {out ? "Incluir de volta" : "Tirar"}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
              {data.rows.length < data.total && (
                <button type="button" disabled={loadingMore || stale} onClick={() => void more()} className={`${CRM_LINK_BTN} mt-2`}>
                  {loadingMore ? "Carregando..." : `Mostrar mais (${data.total - data.rows.length})`}
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4 sm:p-5">
      <h2 className="flex items-center gap-2 text-[14px] font-semibold mb-3">
        <span className="h-6 w-6 shrink-0 rounded-full bg-crm-navy text-white text-[12px] inline-flex items-center justify-center" aria-hidden="true">
          {n}
        </span>
        {title}
      </h2>
      {children}
    </div>
  );
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string | undefined; onChange: (v: string) => void; options: [string, string][] }) {
  return (
    <label className="block min-w-0">
      <span className={CRM_LABEL}>{label}</span>
      <select value={value ?? "all"} onChange={(e) => onChange(e.target.value)} className={`${CRM_INPUT} mt-1`} aria-label={label}>
        <option value="all">Todos</option>
        {options.map(([v, l]) => (
          <option key={v} value={v}>
            {l}
          </option>
        ))}
      </select>
    </label>
  );
}

// ---------------- results ----------------

function CampaignResults({
  id,
  canSend,
  autoSend,
  onBack,
  onOpenContact,
}: {
  id: string;
  canSend: boolean;
  autoSend: boolean;
  onBack: () => void;
  onOpenContact: (contactId: string) => void;
}) {
  const [campaign, setCampaign] = useState<CampaignDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [version, setVersion] = useState(0);
  const stopRef = useRef(false);
  const autoStarted = useRef(false);

  useEffect(() => {
    let cancelled = false;
    api<{ campaign: CampaignDetail }>(`/api/crm/campaigns/${id}/`)
      .then((d) => !cancelled && setCampaign(d.campaign))
      .catch((e: Error) => !cancelled && setError(e.message));
    return () => {
      cancelled = true;
    };
  }, [id, version]);

  // Sends batch after batch while the campaign is "enviando" and this page is open.
  const runSending = useCallback(async () => {
    if (!canSend) return;
    stopRef.current = false;
    setSending(true);
    setError(null);
    try {
      for (;;) {
        if (stopRef.current) break;
        const r = await api<{ status: CampaignStatus; counts: CampaignCounts; pauseReason: string | null }>(`/api/crm/campaigns/${id}/send/`, {
          method: "POST",
          body: { action: "batch" },
        });
        setCampaign((c) => (c ? { ...c, status: r.status, counts: r.counts, pauseReason: r.pauseReason } : c));
        if (r.status !== "enviando") break;
      }
    } catch (e) {
      setError(`${(e as Error).message} O envio parou; clique em Continuar envio para retomar.`);
    } finally {
      setSending(false);
      setVersion((v) => v + 1);
    }
  }, [canSend, id]);

  // Right after "Confirmar e enviar" the batches start on their own.
  useEffect(() => {
    if (!autoSend || autoStarted.current || !campaign || campaign.status !== "enviando" || !canSend) return;
    autoStarted.current = true;
    const t = setTimeout(() => void runSending(), 0);
    return () => clearTimeout(t);
  }, [autoSend, campaign, canSend, runSending]);

  // Leaving mid-send stops after the current batch; warn before closing the tab.
  useEffect(() => {
    if (!sending) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [sending]);
  useEffect(
    () => () => {
      stopRef.current = true;
    },
    []
  );

  async function act(action: "pause" | "resume" | "cancel") {
    if (action === "cancel" && !window.confirm("Cancelar a campanha? Quem ainda não recebeu não vai receber.")) return;
    stopRef.current = true;
    try {
      const r = await api<{ status: CampaignStatus; counts: CampaignCounts; pauseReason: string | null }>(`/api/crm/campaigns/${id}/send/`, {
        method: "POST",
        body: { action },
      });
      setCampaign((c) => (c ? { ...c, status: r.status, counts: r.counts, pauseReason: r.pauseReason } : c));
      setVersion((v) => v + 1);
      if (action === "resume") void runSending();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  if (!campaign) return <p className="text-[12.5px] text-crm-dim">{error ?? "Carregando campanha..."}</p>;
  const k = campaign.counts;
  const toSend = k.audience - k.skipped;
  const done = toSend - k.pending;
  const progress = toSend > 0 ? done / toSend : 1;

  return (
    <section aria-label={`Campanha ${campaign.name}`} className="space-y-4 max-w-5xl">
      <button type="button" onClick={onBack} className={CRM_LINK_BTN}>
        ← Todas as campanhas
      </button>

      <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4 sm:p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <h2 className="crm-display text-[18px] min-w-0 break-words">{campaign.name}</h2>
          <StatusPill status={campaign.status} />
          <span className="text-[11.5px] text-crm-faint sm:ml-auto">
            {campaign.startedAt && `Enviada em ${dateTime(campaign.startedAt)}${campaign.startedByName ? ` por ${campaign.startedByName}` : ""}`}
          </span>
        </div>

        {(campaign.status === "enviando" || campaign.status === "pausada") && (
          <div>
            <div className="flex justify-between text-[12px] text-crm-dim mb-1">
              <span>
                {done} de {toSend} {sending ? "· enviando, mantenha esta página aberta" : ""}
              </span>
              <span className="tabular-nums">{Math.round(progress * 100)}%</span>
            </div>
            <div
              className="h-2 rounded-full bg-crm-sunken overflow-hidden"
              role="progressbar"
              aria-label="Progresso do envio"
              aria-valuemin={0}
              aria-valuemax={toSend}
              aria-valuenow={done}
            >
              <div className="h-full rounded-full bg-crm-accent transition-[width] duration-300" style={{ width: `${progress * 100}%` }} />
            </div>
          </div>
        )}
        {campaign.pauseReason && campaign.status === "pausada" && <p className="text-[12.5px] text-crm-amber">{campaign.pauseReason}</p>}
        {error && (
          <p className={CRM_ALERT} role="alert">
            {error}
          </p>
        )}

        {canSend && (campaign.status === "enviando" || campaign.status === "pausada") && (
          <div className="flex flex-wrap gap-2">
            {campaign.status === "enviando" && !sending && (
              <button type="button" onClick={() => void runSending()} className={CRM_BTN_PRIMARY}>
                Continuar envio
              </button>
            )}
            {campaign.status === "enviando" && (
              <button type="button" onClick={() => void act("pause")} className={CRM_BTN_OUTLINE}>
                Pausar
              </button>
            )}
            {campaign.status === "pausada" && (
              <button type="button" onClick={() => void act("resume")} className={CRM_BTN_PRIMARY}>
                Continuar
              </button>
            )}
            <button type="button" onClick={() => void act("cancel")} className={`${CRM_BTN_OUTLINE} !text-crm-red`}>
              Cancelar campanha
            </button>
          </div>
        )}
        {!canSend && campaign.status === "enviando" && !sending && <p className="text-[12px] text-crm-faint">O envio continua quando um Administrador ou Gestor abrir esta campanha.</p>}
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2" role="region" aria-label="Resultados da campanha">
        <Num label="Enviadas" value={k.sent} note={`de ${toSend} que podiam receber`} />
        <Num label="Entregues" value={k.delivered} note={`${pctOf(k.delivered, k.sent)} das enviadas`} />
        <Num label="Lidas" value={k.read} note={`${pctOf(k.read, k.sent)} das enviadas`} />
        <Num label="Responderam" value={k.replied} note="em até 3 dias" />
        <Num label="Interessados" value={k.interested} note="responderam com interesse" tone={k.interested > 0 ? "text-crm-green" : undefined} />
        <Num label="Viraram oportunidade" value={k.newDeals} note="em até 30 dias" />
        <Num label="Pediram para sair" value={k.optedOut} tone={k.optedOut > 0 ? "text-crm-amber" : undefined} />
        <Num label="Falharam" value={k.failed} tone={k.failed > 0 ? "text-crm-red" : undefined} />
        <Num label="Ficaram de fora" value={k.skipped} note="sem consentimento, descadastrados..." />
      </div>
      {(campaign.audience.exclude?.length ?? 0) > 0 && (
        <p className="text-[12px] text-crm-faint -mt-2">
          Antes do envio, {campaign.audience.exclude!.length} {campaign.audience.exclude!.length === 1 ? "pessoa foi tirada" : "pessoas foram tiradas"} à mão desta campanha.
        </p>
      )}

      {campaign.templateBody && (
        <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-4">
          <p className={CRM_LABEL}>Mensagem · modelo {campaign.templateName}</p>
          <p className="mt-1.5 text-[12.5px] text-crm-dim whitespace-pre-wrap">{campaign.templateBody}</p>
        </div>
      )}

      <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] overflow-x-auto">
        <table className="w-full text-[13px]">
          <caption className="sr-only">Quem recebeu</caption>
          <thead className="border-b border-crm-line">
            <tr>
              <th className={CRM_TH}>Contato</th>
              <th className={CRM_TH}>Situação</th>
              <th className={CRM_TH}>Detalhe</th>
              <th className={CRM_TH}>Respondeu</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-crm-line">
            {campaign.recipients.map((r) => (
              <tr key={r.contactId}>
                <td className={CRM_TD}>
                  <button type="button" onClick={() => onOpenContact(r.contactId)} className="font-semibold text-left hover:text-crm-accent">
                    {r.name}
                  </button>
                </td>
                <td className={`${CRM_TD} whitespace-nowrap`}>
                  <span className={r.status === "falhou" ? "text-crm-red" : r.status === "pulada" ? "text-crm-faint" : ""}>
                    {r.status === "enviada" && r.messageStatus ? DELIVERY_LABEL[r.messageStatus] ?? RECIPIENT_LABEL[r.status] : RECIPIENT_LABEL[r.status]}
                  </span>
                </td>
                <td className={`${CRM_TD} text-crm-dim text-[12px]`}>{r.detail ?? (r.sentAt ? dateTime(r.sentAt) : "—")}</td>
                <td className={`${CRM_TD} text-[12px] whitespace-nowrap`}>
                  {r.interested ? (
                    <span className="text-crm-green font-semibold">Sim · interessado</span>
                  ) : r.replied ? (
                    <span className="text-crm-green font-semibold">Sim</span>
                  ) : (
                    <span className="text-crm-faint">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Num({ label, value, note, tone }: { label: string; value: number; note?: string; tone?: string }) {
  return (
    <div className="rounded-xl border border-crm-line bg-crm-card px-3.5 py-3 shadow-[var(--crm-shadow)] min-w-0">
      <p className={`${CRM_LABEL} leading-snug`}>{label}</p>
      <p className={`crm-display text-[24px] leading-tight mt-1 tabular-nums ${tone ?? ""}`}>{value}</p>
      {note && <p className="text-[11px] text-crm-faint leading-snug">{note}</p>}
    </div>
  );
}
