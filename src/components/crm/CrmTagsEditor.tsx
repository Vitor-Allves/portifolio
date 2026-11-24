"use client";

import { useState } from "react";
import { TAG_VIA } from "@/lib/crm-catalog";
import { CRM_ALERT, CRM_FILTER, CRM_LABEL } from "./crm-styles";
import { TagChip, useCatalog } from "./crm-catalog-context";
import { dateTime } from "./crm-format";

type TagLink = { tagId: string; via: string; byName: string | null; at: string };

/**
 * A record's tags (contact or company): chips (with who/how applied) plus
 * add/remove for whoever may edit it. `endpoint` is the record's tags route,
 * e.g. /api/crm/contacts/<id>/tags/.
 */
export default function CrmTagsEditor({
  links,
  endpoint,
  canEdit,
  onChanged,
}: {
  links: TagLink[];
  endpoint: string;
  canEdit: boolean;
  onChanged: () => void;
}) {
  const { tag, tagGroups } = useCatalog();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const has = new Set(links.map((l) => l.tagId));

  async function send(method: "POST" | "DELETE", tagId: string) {
    setBusy(true);
    setError(null);
    const res = await fetch(`${endpoint}${method === "DELETE" ? `?tagId=${encodeURIComponent(tagId)}` : ""}`, {
      method,
      headers: method === "POST" ? { "Content-Type": "application/json" } : undefined,
      body: method === "POST" ? JSON.stringify({ tagId }) : undefined,
    });
    setBusy(false);
    if (!res.ok) {
      setError(((await res.json().catch(() => null)) as { error?: string } | null)?.error ?? "Não foi possível salvar a etiqueta.");
      return;
    }
    onChanged();
  }

  const available = tagGroups.map((g) => ({ ...g, tags: g.tags.filter((t) => !has.has(t.id)) })).filter((g) => g.tags.length > 0);

  return (
    <section className="space-y-2" aria-label="Etiquetas">
      <h3 className={CRM_LABEL}>Etiquetas</h3>
      {links.length === 0 ? (
        <p className="text-[12.5px] text-crm-faint">Nenhuma etiqueta.</p>
      ) : (
        <div className="flex flex-wrap gap-1.5">
          {links.map((l) => {
            const t = tag(l.tagId);
            if (!t) return null;
            const via = TAG_VIA.find((v) => v.id === l.via)?.label ?? l.via;
            return (
              <TagChip
                key={l.tagId}
                tag={t}
                title={`Aplicada ${l.byName ? `por ${l.byName} ` : ""}em ${dateTime(l.at)} (${via})`}
                onRemove={canEdit && !busy ? () => void send("DELETE", l.tagId) : undefined}
              />
            );
          })}
        </div>
      )}
      {canEdit && available.length > 0 && (
        <select
          value=""
          disabled={busy}
          onChange={(e) => e.target.value && void send("POST", e.target.value)}
          aria-label="Adicionar etiqueta"
          className={`${CRM_FILTER} !text-[12px]`}
        >
          <option value="">+ Adicionar etiqueta</option>
          {available.map((g) => (
            <optgroup key={g.id} label={g.label}>
              {g.tags.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      )}
      {error && (
        <p className={CRM_ALERT} role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
