"use client";

// The Personalização catalog (options and tags) on the client: loaded once
// by the CRM page, refreshed after an edit in Personalização. Every list,
// label and tag chip on the screens reads from here, so a new option shows
// up everywhere at once.

import { createContext, useCallback, useContext, useMemo, useState } from "react";
import { TAG_CATEGORIES, type CrmCatalog, type CrmOption, type CrmTag, type OptionKind, type TagColor } from "@/lib/crm-catalog";

type CatalogApi = {
  catalog: CrmCatalog;
  /** Active options of a list, in order. `keep` adds a record's current value even if it was archived. */
  options: (kind: OptionKind, keep?: string | null) => CrmOption[];
  /** Label of an option (archived ones included); the code itself when unknown. */
  label: (kind: OptionKind, id: string | null | undefined) => string;
  /** Color of an option of a colored list (task types, priorities); gray when unknown. */
  color: (kind: OptionKind, id: string | null | undefined) => TagColor;
  tag: (id: string) => CrmTag | undefined;
  /** Active tags grouped by category, in order. */
  tagGroups: { id: string; label: string; tags: CrmTag[] }[];
  refresh: () => Promise<void>;
};

const Ctx = createContext<CatalogApi | null>(null);

export function CrmCatalogProvider({ initial, children }: { initial: CrmCatalog; children: React.ReactNode }) {
  const [catalog, setCatalog] = useState(initial);
  const refresh = useCallback(async () => {
    const res = await fetch("/api/crm/catalog/");
    const data = (await res.json().catch(() => null)) as { catalog?: CrmCatalog } | null;
    if (res.ok && data?.catalog) setCatalog(data.catalog);
  }, []);
  const api = useMemo<CatalogApi>(() => {
    const byKey = new Map(catalog.options.map((o) => [`${o.kind}:${o.id}`, o]));
    const tagById = new Map(catalog.tags.map((t) => [t.id, t]));
    return {
      catalog,
      options: (kind, keep) =>
        catalog.options.filter((o) => o.kind === kind && (!o.archived || (keep != null && o.id === keep))).sort((a, b) => a.sort - b.sort),
      label: (kind, id) => (id ? byKey.get(`${kind}:${id}`)?.label ?? id : ""),
      color: (kind, id) => (id ? byKey.get(`${kind}:${id}`)?.color ?? "cinza" : "cinza"),
      tag: (id) => tagById.get(id),
      tagGroups: TAG_CATEGORIES.map((c) => ({
        id: c.id,
        label: c.label,
        tags: catalog.tags.filter((t) => t.category === c.id && !t.archived).sort((a, b) => a.sort - b.sort),
      })),
      refresh,
    };
  }, [catalog, refresh]);
  return <Ctx.Provider value={api}>{children}</Ctx.Provider>;
}

export function useCatalog(): CatalogApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useCatalog outside CrmCatalogProvider");
  return api;
}

/** Chip classes per tag color — literal strings so Tailwind keeps them. Text stays readable in both themes. */
export const TAG_TONE: Record<TagColor, string> = {
  azul: "bg-crm-accent/10 text-crm-accent border-crm-accent/25",
  verde: "bg-crm-green/10 text-crm-green border-crm-green/25",
  amarelo: "bg-crm-amber/10 text-crm-amber border-crm-amber/30",
  vermelho: "bg-crm-red/10 text-crm-red border-crm-red/25",
  roxo: "bg-crm-violet/10 text-crm-violet border-crm-violet/25",
  turquesa: "bg-crm-chart-2/10 text-crm-chart-2 border-crm-chart-2/30",
  cinza: "bg-crm-sunken text-crm-dim border-crm-line",
};

/** Solid swatch per color (a dot next to an option, the color picker). */
export const TAG_DOT: Record<TagColor, string> = {
  azul: "bg-crm-accent",
  verde: "bg-crm-green",
  amarelo: "bg-crm-amber",
  vermelho: "bg-crm-red",
  roxo: "bg-crm-violet",
  turquesa: "bg-crm-chart-2",
  cinza: "bg-crm-line-strong",
};

export function TagChip({ tag, onRemove, title, small }: { tag: CrmTag; onRemove?: () => void; title?: string; small?: boolean }) {
  return (
    <span
      title={title ?? tag.description ?? undefined}
      className={`inline-flex items-center gap-1 rounded-full border font-medium whitespace-nowrap max-w-full ${small ? "px-1.5 py-px text-[10.5px]" : "px-2 py-0.5 text-[11.5px]"} ${TAG_TONE[tag.color]}`}
    >
      <span className="truncate">{tag.label}</span>
      {tag.archived && <span className="opacity-70">(arquivada)</span>}
      {onRemove && (
        <button type="button" onClick={onRemove} aria-label={`Remover etiqueta ${tag.label}`} className="-mr-0.5 leading-none opacity-70 hover:opacity-100">
          ×
        </button>
      )}
    </span>
  );
}

/** Up to `max` chips, then "+N". */
export function TagChips({ ids, max = 3, small = true }: { ids: string[]; max?: number; small?: boolean }) {
  const { tag } = useCatalog();
  const tags = ids.map(tag).filter((t): t is CrmTag => Boolean(t));
  if (tags.length === 0) return null;
  return (
    <span className="inline-flex flex-wrap items-center gap-1 min-w-0">
      {tags.slice(0, max).map((t) => (
        <TagChip key={t.id} tag={t} small={small} />
      ))}
      {tags.length > max && <span className="text-[10.5px] text-crm-faint">+{tags.length - max}</span>}
    </span>
  );
}

/** Select for a segment (stored as text): the list's active segments plus the record's current value. */
export function SegmentSelect({
  value,
  onChange,
  className,
  label = "Segmento",
  emptyLabel = "Sem segmento",
}: {
  value: string;
  onChange: (v: string) => void;
  className?: string;
  label?: string;
  emptyLabel?: string;
}) {
  const { options } = useCatalog();
  const list = options("segment").map((o) => o.label);
  return (
    <select value={value} onChange={(e) => onChange(e.target.value)} aria-label={label} className={className}>
      <option value="">{emptyLabel}</option>
      {value && !list.includes(value) && <option value={value}>{value}</option>}
      {list.map((s) => (
        <option key={s} value={s}>
          {s}
        </option>
      ))}
    </select>
  );
}
