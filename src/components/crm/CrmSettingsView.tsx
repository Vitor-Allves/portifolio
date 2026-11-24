"use client";

import { useCallback, useEffect, useState } from "react";
import {
  CLOSE_GROUPS,
  COLORED_KINDS,
  OPTION_KINDS,
  reasonGroup,
  stageMeta,
  type LostCloseGroup,
  TAG_CATEGORIES,
  TAG_COLORS,
  usageKey,
  type CrmCatalog,
  type CrmCatalogUsage,
  type CrmOption,
  type CrmTag,
  type OptionKind,
  type TagCategory,
  type TagColor,
} from "@/lib/crm-catalog";
import { CRM_ALERT, CRM_BTN_OUTLINE, CRM_BTN_PRIMARY, CRM_INPUT, CRM_LABEL, CRM_LINK_BTN, crmSegment } from "./crm-styles";
import { TAG_DOT, TagChip, useCatalog } from "./crm-catalog-context";

type Tab = OptionKind | "tags";

async function call(url: string, method: string, body?: unknown): Promise<string | null> {
  const res = await fetch(url, {
    method,
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  if (res.ok) return null;
  return ((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar.";
}

const usedLabel = (n: number) => (n === 0 ? "sem uso" : n === 1 ? "usada em 1 registro" : `usada em ${n} registros`);

/** Administrador only (the server checks it too): the CRM's editable lists and tags. */
export default function CrmSettingsView() {
  const app = useCatalog();
  const [tab, setTab] = useState<Tab>("source");
  const [data, setData] = useState<{ catalog: CrmCatalog; usage: CrmCatalogUsage } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/crm/catalog/?usage=1")
      .then(async (res) => {
        const d = (await res.json().catch(() => null)) as { catalog?: CrmCatalog; usage?: CrmCatalogUsage; error?: string } | null;
        if (cancelled) return;
        if (!res.ok || !d?.catalog || !d.usage) setError(d?.error ?? "Não foi possível carregar a Personalização.");
        else setData({ catalog: d.catalog, usage: d.usage });
      })
      .catch(() => !cancelled && setError("Não foi possível carregar a Personalização."));
    return () => {
      cancelled = true;
    };
  }, [version]);

  /** Runs a change, then reloads this screen and the catalog every other screen uses. */
  const run = useCallback(
    async (fn: () => Promise<string | null>, ok?: string) => {
      setNotice(null);
      const err = await fn();
      setError(err);
      if (!err) {
        if (ok) setNotice(ok);
        setVersion((v) => v + 1);
        await app.refresh();
      }
      return !err;
    },
    [app]
  );

  const tabs: { id: Tab; label: string }[] = [...OPTION_KINDS.map((k) => ({ id: k.id as Tab, label: k.label })), { id: "tags", label: "Etiquetas" }];

  return (
    <section aria-label="Personalização do CRM" className="space-y-4 max-w-4xl">
      <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Listas">
        {tabs.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => (setTab(t.id), setNotice(null), setError(null))} className={`${crmSegment(tab === t.id)} border border-crm-line`}>
            {t.label}
          </button>
        ))}
      </div>
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
      {!data ? (
        !error && <p className="text-[12.5px] text-crm-dim">Carregando...</p>
      ) : tab === "tags" ? (
        <TagsPanel catalog={data.catalog} usage={data.usage} run={run} />
      ) : (
        <OptionsPanel key={tab} kind={tab} catalog={data.catalog} usage={data.usage} run={run} />
      )}
      <p className="text-[11.5px] text-crm-faint">
        Nada é apagado: arquivar tira a opção dos formulários, mas os registros antigos continuam com ela e o histórico fica. Toda mudança vai para a auditoria.
      </p>
    </section>
  );
}

type Run = (fn: () => Promise<string | null>, ok?: string) => Promise<boolean>;

function MoveButtons({ index, count, onMove, label }: { index: number; count: number; onMove: (to: number) => void; label: string }) {
  return (
    <span className="inline-flex shrink-0">
      <button type="button" disabled={index === 0} onClick={() => onMove(index - 1)} aria-label={`Subir ${label}`} className="h-7 w-7 rounded-md text-crm-dim hover:text-crm-text hover:bg-crm-hover disabled:opacity-30">
        ↑
      </button>
      <button type="button" disabled={index === count - 1} onClick={() => onMove(index + 1)} aria-label={`Descer ${label}`} className="h-7 w-7 rounded-md text-crm-dim hover:text-crm-text hover:bg-crm-hover disabled:opacity-30">
        ↓
      </button>
    </span>
  );
}

function OptionsPanel({ kind, catalog, usage, run }: { kind: OptionKind; catalog: CrmCatalog; usage: CrmCatalogUsage; run: Run }) {
  const meta = OPTION_KINDS.find((k) => k.id === kind)!;
  const all = catalog.options.filter((o) => o.kind === kind).sort((a, b) => a.sort - b.sort);
  const active = all.filter((o) => !o.archived);
  const archived = all.filter((o) => o.archived);
  const colored = COLORED_KINDS.includes(kind);
  // Etapas carry a probability; motivos de encerramento, their tabulação group.
  const isStage = kind === "stage";
  const isReason = kind === "lost_reason";
  const newWord = /^(origem|etapa|prioridade)$/.test(meta.singular) ? "Nova" : "Novo";
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; description: string; color: TagColor; probability: string; group: LostCloseGroup }>({
    label: "",
    description: "",
    color: "cinza",
    probability: "",
    group: "negativo",
  });
  const [newLabel, setNewLabel] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState<TagColor>("azul");
  const [newProbability, setNewProbability] = useState("");
  const [newGroup, setNewGroup] = useState<LostCloseGroup>("negativo");
  const metaOf = (probability: string, group: LostCloseGroup) =>
    isStage ? (probability.trim() ? { meta: { probability: probability.trim() } } : {}) : isReason ? { meta: { group } } : {};
  const [showArchived, setShowArchived] = useState(false);
  const base = "/api/crm/catalog/options/";

  function move(from: number, to: number) {
    const ids = active.map((o) => o.id);
    const [id] = ids.splice(from, 1);
    ids.splice(to, 0, id);
    void run(() => call(base, "PUT", { kind, ids }));
  }

  const row = (o: CrmOption, i: number, list: CrmOption[]) => {
    const used = usage.options[usageKey(kind, o.id)] ?? 0;
    const isEditing = editing === o.id;
    return (
      <li key={o.id} className="px-3.5 py-2.5">
        {isEditing ? (
          <div className="space-y-2">
            <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} aria-label={`Nome de ${o.label}`} maxLength={80} className={CRM_INPUT} />
            <input
              value={draft.description}
              onChange={(e) => setDraft({ ...draft, description: e.target.value })}
              aria-label={`Descrição de ${o.label}`}
              placeholder="Descrição (opcional)"
              maxLength={300}
              className={CRM_INPUT}
            />
            {colored && <ColorSelect value={draft.color} onChange={(color) => setDraft({ ...draft, color })} label={`Cor de ${o.label}`} />}
            {isStage && stageMeta(o).outcome === "open" && (
              <ProbabilityInput value={draft.probability} onChange={(probability) => setDraft({ ...draft, probability })} label={`Probabilidade de ${o.label}`} />
            )}
            {isReason && <GroupSelect value={draft.group} onChange={(group) => setDraft({ ...draft, group })} label={`Grupo de ${o.label}`} />}
            {kind === "segment" && used > 0 && draft.label.trim() !== o.label && (
              <p className="text-[11.5px] text-crm-amber">O novo nome também vai para as {used} empresas/contatos que usam este segmento.</p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                className={CRM_BTN_PRIMARY}
                onClick={async () => {
                  const body = {
                    label: draft.label,
                    description: draft.description,
                    ...(colored ? { color: draft.color } : {}),
                    ...(isStage && stageMeta(o).outcome !== "open" ? {} : metaOf(draft.probability, draft.group)),
                  };
                  if (await run(() => call(`${base}${kind}/${o.id}/`, "PATCH", body), "Alteração salva.")) setEditing(null);
                }}
              >
                Salvar
              </button>
              <button type="button" className={CRM_BTN_OUTLINE} onClick={() => setEditing(null)}>
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2">
            {!o.archived && !(isStage && o.locked) && <MoveButtons index={i} count={list.length} onMove={(to) => move(i, to)} label={o.label} />}
            {colored && o.color && <span className={`h-3 w-3 shrink-0 rounded-full ${TAG_DOT[o.color]}`} title={`Cor: ${TAG_COLORS.find((c) => c.id === o.color)?.label ?? o.color}`} aria-hidden="true" />}
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-semibold break-words">
                {o.label}
                {o.locked && <span className="ml-2 text-[10.5px] font-normal text-crm-faint">{isStage ? "fixa" : "padrão"}</span>}
              </p>
              <p className="text-[11.5px] text-crm-faint">
                {isStage ? `${stageMeta(o).probability}% de probabilidade · ` : ""}
                {isReason ? `${CLOSE_GROUPS.find((g) => g.id === reasonGroup(o))?.label} · ` : ""}
                {o.description ? `${o.description} · ` : ""}
                {usedLabel(used)}
              </p>
            </div>
            <button
              type="button"
              className={CRM_LINK_BTN}
              onClick={() => {
                setEditing(o.id);
                setDraft({ label: o.label, description: o.description ?? "", color: o.color ?? "cinza", probability: String(stageMeta(o).probability), group: reasonGroup(o) });
              }}
              aria-label={`Editar ${o.label}`}
            >
              Editar
            </button>
            {!o.locked && (
              <button
                type="button"
                className={`${CRM_LINK_BTN} ${o.archived ? "" : "!text-crm-dim"}`}
                onClick={() => void run(() => call(`${base}${kind}/${o.id}/`, "PATCH", { archived: !o.archived }), o.archived ? `"${o.label}" voltou para a lista.` : `"${o.label}" arquivada.`)}
                aria-label={`${o.archived ? "Reativar" : "Arquivar"} ${o.label}`}
              >
                {o.archived ? "Reativar" : "Arquivar"}
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-3">
      <p className="text-[12.5px] text-crm-dim">{meta.hint}</p>
      <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)]">
        {active.length === 0 ? (
          <p className="px-3.5 py-4 text-[12.5px] text-crm-faint">Nenhuma opção ainda. Adicione a primeira abaixo.</p>
        ) : (
          <ul className="divide-y divide-crm-line" aria-label={meta.label}>
            {active.map((o, i) => row(o, i, active))}
          </ul>
        )}
        <form
          className={`border-t border-crm-line px-3.5 py-3 grid gap-2 ${
            colored && isStage
              ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto_auto]"
              : colored || isReason
                ? "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto_auto]"
                : "sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto]"
          }`}
          onSubmit={async (e) => {
            e.preventDefault();
            const body = { kind, label: newLabel, description: newDescription, ...(colored ? { color: newColor } : {}), ...metaOf(newProbability, newGroup) };
            if (await run(() => call(base, "POST", body), `"${newLabel.trim()}" adicionada.`)) {
              setNewLabel("");
              setNewDescription("");
              setNewProbability("");
            }
          }}
        >
          <input value={newLabel} onChange={(e) => setNewLabel(e.target.value)} placeholder={`${newWord} ${meta.singular}`} aria-label={`${newWord} ${meta.singular}`} maxLength={80} className={CRM_INPUT} />
          <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder="Descrição (opcional)" aria-label="Descrição" maxLength={300} className={CRM_INPUT} />
          {colored && <ColorSelect value={newColor} onChange={setNewColor} label={`Cor ${newWord === "Nova" ? "da nova" : "do novo"} ${meta.singular}`} />}
          {isStage && <ProbabilityInput value={newProbability} onChange={setNewProbability} label="Probabilidade da nova etapa" />}
          {isReason && <GroupSelect value={newGroup} onChange={setNewGroup} label="Grupo do novo motivo" />}
          <button type="submit" disabled={!newLabel.trim()} className={CRM_BTN_PRIMARY}>
            Adicionar
          </button>
        </form>
      </div>
      {archived.length > 0 && (
        <div>
          <button type="button" className={CRM_LINK_BTN} onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            {showArchived ? "Esconder" : "Ver"} arquivadas ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 rounded-2xl border border-crm-line bg-crm-card divide-y divide-crm-line" aria-label={`${meta.label} arquivadas`}>
              {archived.map((o, i) => row(o, i, archived))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

/** 0–100, in whole numbers. */
function ProbabilityInput({ value, onChange, label }: { value: string; onChange: (v: string) => void; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <input
        value={value}
        onChange={(e) => onChange(e.target.value.replace(/[^\d]/g, "").slice(0, 3))}
        inputMode="numeric"
        aria-label={label}
        placeholder="Prob."
        className={`${CRM_INPUT} !w-[72px]`}
      />
      <span className="text-[12px] text-crm-dim">%</span>
    </span>
  );
}

/** The tabulação group of a closing reason. */
function GroupSelect({ value, onChange, label }: { value: LostCloseGroup; onChange: (g: LostCloseGroup) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as LostCloseGroup)} aria-label={label} className={`${CRM_INPUT} sm:!w-auto`}>
      {CLOSE_GROUPS.filter((g) => g.id !== "positivo").map((g) => (
        <option key={g.id} value={g.id}>
          {g.label}
        </option>
      ))}
    </select>
  );
}

function ColorSelect({ value, onChange, label }: { value: TagColor; onChange: (c: TagColor) => void; label: string }) {
  return (
    <select value={value} onChange={(e) => onChange(e.target.value as TagColor)} aria-label={label} className={CRM_INPUT}>
      {TAG_COLORS.map((c) => (
        <option key={c.id} value={c.id}>
          {c.label}
        </option>
      ))}
    </select>
  );
}

function TagsPanel({ catalog, usage, run }: { catalog: CrmCatalog; usage: CrmCatalogUsage; run: Run }) {
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ label: string; description: string; color: TagColor; category: TagCategory }>({ label: "", description: "", color: "cinza", category: "origem" });
  const [form, setForm] = useState<{ label: string; description: string; color: TagColor; category: TagCategory }>({ label: "", description: "", color: "azul", category: "origem" });
  const [showArchived, setShowArchived] = useState(false);
  const archived = catalog.tags.filter((t) => t.archived);

  const row = (t: CrmTag, i: number, list: CrmTag[]) => {
    const used = usage.tags[t.id] ?? 0;
    if (editing === t.id) {
      return (
        <li key={t.id} className="px-3.5 py-2.5 space-y-2">
          <div className="grid gap-2 sm:grid-cols-3">
            <input value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} aria-label={`Nome de ${t.label}`} maxLength={40} className={CRM_INPUT} />
            <ColorSelect value={draft.color} onChange={(color) => setDraft({ ...draft, color })} label={`Cor de ${t.label}`} />
            <select value={draft.category} onChange={(e) => setDraft({ ...draft, category: e.target.value as TagCategory })} aria-label={`Categoria de ${t.label}`} className={CRM_INPUT}>
              {TAG_CATEGORIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.label}
                </option>
              ))}
            </select>
          </div>
          <input value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} placeholder="Descrição (opcional)" aria-label={`Descrição de ${t.label}`} maxLength={300} className={CRM_INPUT} />
          <div className="flex items-center gap-2">
            <button
              type="button"
              className={CRM_BTN_PRIMARY}
              onClick={async () => {
                if (await run(() => call(`/api/crm/catalog/tags/${t.id}/`, "PATCH", draft), "Etiqueta salva.")) setEditing(null);
              }}
            >
              Salvar
            </button>
            <button type="button" className={CRM_BTN_OUTLINE} onClick={() => setEditing(null)}>
              Cancelar
            </button>
            <TagChip tag={{ ...t, ...draft, label: draft.label || t.label }} />
          </div>
        </li>
      );
    }
    return (
      <li key={t.id} className="px-3.5 py-2.5 flex items-center gap-2">
        {!t.archived && (
          <MoveButtons
            index={i}
            count={list.length}
            label={t.label}
            onMove={(to) => {
              const ids = list.map((x) => x.id);
              const [id] = ids.splice(i, 1);
              ids.splice(to, 0, id);
              void run(() => call("/api/crm/catalog/tags/", "PUT", { category: t.category, ids }));
            }}
          />
        )}
        <div className="min-w-0 flex-1">
          <TagChip tag={t} />
          <p className="mt-0.5 text-[11.5px] text-crm-faint">
            {t.description ? `${t.description} · ` : ""}
            {usedLabel(used)}
          </p>
        </div>
        <button
          type="button"
          className={CRM_LINK_BTN}
          aria-label={`Editar etiqueta ${t.label}`}
          onClick={() => {
            setEditing(t.id);
            setDraft({ label: t.label, description: t.description ?? "", color: t.color, category: t.category });
          }}
        >
          Editar
        </button>
        <button
          type="button"
          className={`${CRM_LINK_BTN} ${t.archived ? "" : "!text-crm-dim"}`}
          aria-label={`${t.archived ? "Reativar" : "Arquivar"} etiqueta ${t.label}`}
          onClick={() => void run(() => call(`/api/crm/catalog/tags/${t.id}/`, "PATCH", { archived: !t.archived }), t.archived ? `"${t.label}" voltou.` : `"${t.label}" arquivada.`)}
        >
          {t.archived ? "Reativar" : "Arquivar"}
        </button>
      </li>
    );
  };

  return (
    <div className="space-y-4">
      {TAG_CATEGORIES.map((c) => {
        const list = catalog.tags.filter((t) => t.category === c.id && !t.archived).sort((a, b) => a.sort - b.sort);
        return (
          <div key={c.id}>
            <h2 className="text-[13.5px] font-semibold">{c.label}</h2>
            <p className="text-[12px] text-crm-dim mb-1.5">{c.hint}</p>
            <div className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)]">
              {list.length === 0 ? (
                <p className="px-3.5 py-3 text-[12.5px] text-crm-faint">Nenhuma etiqueta nesta categoria.</p>
              ) : (
                <ul className="divide-y divide-crm-line" aria-label={`Etiquetas de ${c.label}`}>
                  {list.map((t, i) => row(t, i, list))}
                </ul>
              )}
            </div>
          </div>
        );
      })}

      <form
        className="rounded-2xl border border-crm-line bg-crm-card shadow-[var(--crm-shadow)] p-3.5 space-y-2"
        aria-label="Nova etiqueta"
        onSubmit={async (e) => {
          e.preventDefault();
          if (await run(() => call("/api/crm/catalog/tags/", "POST", form), `Etiqueta "${form.label.trim()}" criada.`)) setForm({ ...form, label: "", description: "" });
        }}
      >
        <p className={CRM_LABEL}>Nova etiqueta</p>
        <div className="grid gap-2 sm:grid-cols-3">
          <input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="Nome" aria-label="Nome da nova etiqueta" maxLength={40} className={CRM_INPUT} />
          <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value as TagCategory })} aria-label="Categoria da nova etiqueta" className={CRM_INPUT}>
            {TAG_CATEGORIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.label}
              </option>
            ))}
          </select>
          <ColorSelect value={form.color} onChange={(color) => setForm({ ...form, color })} label="Cor da nova etiqueta" />
        </div>
        <input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="Descrição (opcional)" aria-label="Descrição da nova etiqueta" maxLength={300} className={CRM_INPUT} />
        <button type="submit" disabled={!form.label.trim()} className={CRM_BTN_PRIMARY}>
          Criar etiqueta
        </button>
      </form>

      {archived.length > 0 && (
        <div>
          <button type="button" className={CRM_LINK_BTN} onClick={() => setShowArchived((v) => !v)} aria-expanded={showArchived}>
            {showArchived ? "Esconder" : "Ver"} arquivadas ({archived.length})
          </button>
          {showArchived && (
            <ul className="mt-2 rounded-2xl border border-crm-line bg-crm-card divide-y divide-crm-line" aria-label="Etiquetas arquivadas">
              {archived.map((t, i) => row(t, i, archived))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
