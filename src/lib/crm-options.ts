// Server-only. Personalização do CRM (especificação v1.0, Fase 1): the
// editable lists (crm_options) and tags (crm_tags, crm_contact_tags).
//
// Rules enforced here, whatever the screen sends:
// - a record may only get an ACTIVE option/tag; one it already has stays
//   valid after the option is archived (history is never rewritten);
// - nothing is deleted — options and tags are archived and can come back;
// - an option the code relies on as a fallback ("locked") can't be archived;
// - renaming a segment renames it on every company/contact that uses it
//   (segments are stored as text).

import { randomUUID } from "crypto";
import type { Pool, PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { CrmInputError, CrmNotFoundError, addEvent, cleanText, type CrmActor } from "./crm-core";
import { isCrmContractBilling, parseMoneyToCents, registerStageLabels } from "./crm-types";
import {
  COLORED_KINDS,
  OPTION_KINDS,
  TAG_CATEGORIES,
  foldLabel,
  isTagCategory,
  isTagColor,
  slugFromLabel,
  usageKey,
  type CrmCatalog,
  type CrmCatalogUsage,
  type CrmOption,
  type CrmTag,
  type OptionKind,
  type TagVia,
  isLostCloseGroup,
} from "./crm-catalog";

type Q = Pick<PoolClient, "query"> | Pool;

type OptionRow = {
  kind: OptionKind;
  id: string;
  label: string;
  description: string | null;
  sort: number;
  locked: boolean;
  archived_at: Date | null;
  color: string | null;
  meta: Record<string, unknown> | null;
};
const OPTION_COLS = "kind, id, label, description, sort, locked, archived_at, color, meta";
type TagRow = { id: string; category: CrmTag["category"]; label: string; description: string | null; color: CrmTag["color"]; sort: number; archived_at: Date | null };

const mapOption = (r: OptionRow): CrmOption => ({
  kind: r.kind,
  id: r.id,
  label: r.label,
  description: r.description,
  sort: r.sort,
  locked: r.locked,
  archived: r.archived_at !== null,
  color: COLORED_KINDS.includes(r.kind) ? (isTagColor(r.color) ? r.color : "cinza") : null,
  meta: r.meta ?? {},
});
const mapTag = (r: TagRow): CrmTag => ({
  id: r.id,
  category: r.category,
  label: r.label,
  description: r.description,
  color: r.color,
  sort: r.sort,
  archived: r.archived_at !== null,
});

export async function getCatalog(q?: Q): Promise<CrmCatalog> {
  const db = q ?? (await getDb());
  const [options, tags] = await Promise.all([
    db.query<OptionRow>(`SELECT ${OPTION_COLS} FROM crm_options ORDER BY kind, sort, lower(label)`),
    db.query<TagRow>(`SELECT id, category, label, description, color, sort, archived_at FROM crm_tags ORDER BY category, sort, lower(label)`),
  ]);
  const catalog = { options: options.rows.map(mapOption), tags: tags.rows.map(mapTag) };
  // Server-side labels (exports, AI, notifications) follow the stage names as renamed.
  registerStageLabels(catalog.options.filter((o) => o.kind === "stage"));
  return catalog;
}

/** How many records use each option / tag (Personalização screen). */
export async function getCatalogUsage(): Promise<CrmCatalogUsage> {
  const db = await getDb();
  const { rows } = await db.query<{ k: string; n: string }>(
    `SELECT 'source:' || source AS k, count(*) AS n FROM crm_contacts GROUP BY source
     UNION ALL SELECT 'stage:' || stage, count(*) FROM crm_deals GROUP BY stage
     UNION ALL SELECT 'lost_reason:' || lost_reason, count(*) FROM crm_deals WHERE lost_reason IS NOT NULL GROUP BY lost_reason
     UNION ALL SELECT 'task_kind:' || kind, count(*) FROM crm_tasks GROUP BY kind
     UNION ALL SELECT 'priority:' || priority, count(*) FROM crm_tasks GROUP BY priority
     UNION ALL SELECT 'segment:' || o.id, (SELECT count(*) FROM crm_companies co WHERE co.segment = o.label)
                + (SELECT count(*) FROM crm_contacts c WHERE c.segment = o.label)
       FROM crm_options o WHERE o.kind = 'segment'
     UNION ALL SELECT 'service:' || s, count(*) FROM (
         SELECT service_interest AS s FROM crm_contacts WHERE service_interest IS NOT NULL
         UNION ALL SELECT service FROM crm_deals WHERE service IS NOT NULL) x GROUP BY s
     UNION ALL SELECT 'won_reason:' || won_reason, count(*) FROM crm_deals WHERE won_reason IS NOT NULL GROUP BY won_reason
     UNION ALL SELECT 'department:' || crm_department, count(*) FROM internal_users WHERE crm_department IS NOT NULL GROUP BY crm_department
     UNION ALL SELECT 'tag:' || tag_id, count(*) FROM crm_contact_tags GROUP BY tag_id
     UNION ALL SELECT 'tag:' || tag_id, count(*) FROM crm_company_tags GROUP BY tag_id`
  );
  const usage: CrmCatalogUsage = { options: {}, tags: {} };
  for (const r of rows) {
    const n = Number(r.n);
    if (r.k.startsWith("tag:")) usage.tags[r.k.slice(4)] = (usage.tags[r.k.slice(4)] ?? 0) + n;
    else usage.options[r.k] = n;
  }
  return usage;
}

// ---------- validation used by the data modules ----------

const KIND_NAME: Record<OptionKind, string> = Object.fromEntries(OPTION_KINDS.map((k) => [k.id, k.singular])) as Record<OptionKind, string>;

/**
 * The option id a record may be given: an active option, or the value the
 * record already has (an archived option stays on the records that use it).
 */
export async function requireOptionId(q: Q, kind: OptionKind, value: unknown, current?: string | null): Promise<string> {
  if (typeof value !== "string" || !value) throw new CrmInputError(`Escolha ${/^(origem|etapa|prioridade)$/.test(KIND_NAME[kind]) ? "a" : "o"} ${KIND_NAME[kind]}.`);
  if (current && value === current) return value;
  const { rows } = await q.query<{ archived: boolean }>(`SELECT archived_at IS NOT NULL AS archived FROM crm_options WHERE kind = $1 AND id = $2`, [kind, value]);
  if (!rows[0]) throw new CrmInputError(`Opção inválida para ${KIND_NAME[kind]}.`);
  if (rows[0].archived) throw new CrmInputError(`Essa opção de ${KIND_NAME[kind]} foi arquivada. Escolha outra.`);
  return value;
}

/**
 * A segment typed on a form must be on the list (segments are stored as
 * text). Empty clears it; the value a record already has stays valid even
 * if that segment was archived or never made it to the list.
 */
export async function requireSegment(q: Q, value: string | null, current?: string | null): Promise<void> {
  if (!value || value === current) return;
  const { rows } = await q.query<{ archived: boolean }>(
    `SELECT archived_at IS NOT NULL AS archived FROM crm_options WHERE kind = 'segment' AND label = $1`,
    [value]
  );
  if (!rows[0]) throw new CrmInputError(`O segmento "${value}" não está na lista. Peça ao Administrador para incluí-lo em Personalização.`);
  if (rows[0].archived) throw new CrmInputError(`O segmento "${value}" foi arquivado. Escolha outro.`);
}

/** Label of an option (the id itself when unknown). */
export async function optionLabel(q: Q, kind: OptionKind, id: string | null): Promise<string | null> {
  if (!id) return null;
  const { rows } = await q.query<{ label: string }>(`SELECT label FROM crm_options WHERE kind = $1 AND id = $2`, [kind, id]);
  return rows[0]?.label ?? id;
}

/** id of the active option whose label matches typed text (import), or null. */
export function matchOption(catalog: CrmCatalog, kind: OptionKind, text: string | undefined | null): string | null {
  const t = text ? foldLabel(text) : "";
  if (!t) return null;
  const active = catalog.options.filter((o) => o.kind === kind && !o.archived);
  return active.find((o) => foldLabel(o.label) === t || o.id === t)?.id ?? active.find((o) => foldLabel(o.label).startsWith(t))?.id ?? null;
}

/** A segment typed for a record: the list's own spelling when it matches, else null when empty. */
export function canonicalSegment(catalog: CrmCatalog, text: string | null): string | null {
  if (!text) return null;
  const t = foldLabel(text);
  return catalog.options.find((o) => o.kind === "segment" && foldLabel(o.label) === t)?.label ?? text;
}

// ---------- options (Administrador) ----------

export type OptionInput = { label?: unknown; description?: unknown; color?: unknown; meta?: unknown };

/** The attributes an option of `kind` may carry (crm_options.meta), validated; `current` keeps what isn't sent. */
function optionMeta(kind: OptionKind, id: string, value: unknown, current: Record<string, unknown>): Record<string, unknown> {
  const sent = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
  if (kind === "stage") {
    const outcome = id === "ganho" ? "won" : id === "perdido" ? "lost" : "open";
    let probability = typeof current.probability === "number" ? current.probability : outcome === "won" ? 100 : outcome === "lost" ? 0 : 10;
    if (sent.probability !== undefined) {
      const p = typeof sent.probability === "string" ? Number(sent.probability) : sent.probability;
      if (typeof p !== "number" || !Number.isInteger(p) || p < 0 || p > 100) throw new CrmInputError("Probabilidade inválida: use um número de 0 a 100.");
      if (outcome !== "open" && p !== (outcome === "won" ? 100 : 0)) throw new CrmInputError("Venda fechada é sempre 100% e Venda perdida, 0%.");
      probability = p;
    }
    return { probability, outcome };
  }
  if (kind === "service") {
    // Catálogo de serviços (evolução v1.0, item 3.2): what a proposal starts from.
    const next: Record<string, unknown> = { ...current };
    if (sent.scope !== undefined) next.scope = cleanText(sent.scope, 2000);
    if (sent.referenceValue !== undefined) {
      try {
        next.referenceCents = parseMoneyToCents(sent.referenceValue);
      } catch {
        throw new CrmInputError("Valor de referência inválido — use, por exemplo, 2.500 ou 2.500,00.");
      }
    }
    if (sent.billing !== undefined) {
      if (sent.billing !== null && sent.billing !== "" && !isCrmContractBilling(sent.billing)) throw new CrmInputError("Modelo de cobrança inválido.");
      next.billing = sent.billing || null;
    }
    if (sent.deadline !== undefined) next.deadline = cleanText(sent.deadline, 120);
    if (sent.conditions !== undefined) next.conditions = cleanText(sent.conditions, 2000);
    return Object.fromEntries(Object.entries(next).filter(([, v]) => v !== null && v !== undefined));
  }
  if (kind === "lost_reason") {
    const group = sent.group === undefined ? current.group ?? "negativo" : sent.group;
    if (!isLostCloseGroup(group)) throw new CrmInputError("Grupo de tabulação inválido.");
    return { ...current, group };
  }
  return current;
}

/** Stages: Novo lead first, Venda fechada and Venda perdida last, whatever order was asked. */
async function normalizeStageOrder(q: Q) {
  const { rows } = await q.query<{ id: string }>(`SELECT id FROM crm_options WHERE kind = 'stage' ORDER BY sort, lower(label)`);
  const open = rows.map((r) => r.id).filter((id) => id !== "novo" && id !== "ganho" && id !== "perdido");
  const order = [...(rows.some((r) => r.id === "novo") ? ["novo"] : []), ...open, ...["ganho", "perdido"].filter((id) => rows.some((r) => r.id === id))];
  for (const [i, id] of order.entries()) await q.query(`UPDATE crm_options SET sort = $2 WHERE kind = 'stage' AND id = $1 AND sort <> $2`, [id, i]);
}

/** The color an option of `kind` gets: only colored lists have one; an invalid value is refused. */
function optionColor(kind: OptionKind, value: unknown, current: string | null): string | null {
  if (!COLORED_KINDS.includes(kind)) return null;
  if (value === undefined) return current ?? "cinza";
  if (!isTagColor(value)) throw new CrmInputError("Cor inválida.");
  return value;
}

function cleanLabel(value: unknown): string {
  const label = cleanText(value, 80)?.replace(/\s+/g, " ");
  if (!label) throw new CrmInputError("Dê um nome para a opção.");
  return label;
}

async function assertUniqueLabel(q: Q, kind: OptionKind, label: string, exceptId?: string) {
  const { rows } = await q.query<{ id: string; label: string }>(`SELECT id, label FROM crm_options WHERE kind = $1`, [kind]);
  const clash = rows.find((r) => r.id !== exceptId && foldLabel(r.label) === foldLabel(label));
  if (clash) throw new CrmInputError(`Já existe "${clash.label}" nessa lista (pode estar arquivada).`);
}

export async function createOption(kind: OptionKind, input: OptionInput): Promise<CrmOption> {
  const label = cleanLabel(input.label);
  const description = cleanText(input.description, 300);
  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('crm_options:' || $1))`, [kind]);
    await assertUniqueLabel(client, kind, label);
    const base = slugFromLabel(label);
    const taken = new Set((await client.query<{ id: string }>(`SELECT id FROM crm_options WHERE kind = $1`, [kind])).rows.map((r) => r.id));
    let id = base;
    for (let i = 2; taken.has(id); i++) id = `${base}_${i}`;
    const { rows } = await client.query<OptionRow>(
      `INSERT INTO crm_options (kind, id, label, description, color, meta, sort)
       VALUES ($1, $2, $3, $4, $5, $6, (SELECT COALESCE(max(sort), -1) + 1 FROM crm_options WHERE kind = $1))
       RETURNING ${OPTION_COLS}`,
      [kind, id, label, description, optionColor(kind, input.color, null), JSON.stringify(optionMeta(kind, id, input.meta, {}))]
    );
    if (kind === "stage") {
      await normalizeStageOrder(client);
      const again = await client.query<OptionRow>(`SELECT ${OPTION_COLS} FROM crm_options WHERE kind = $1 AND id = $2`, [kind, id]);
      return mapOption(again.rows[0]);
    }
    return mapOption(rows[0]);
  });
}

/** Rename / describe / recolor. A segment's new name is applied to the companies and contacts that use it. */
export async function updateOption(kind: OptionKind, id: string, input: OptionInput): Promise<{ before: string; colorBefore: string | null; metaBefore: Record<string, unknown>; after: CrmOption; renamedRecords: number }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<OptionRow>(`SELECT ${OPTION_COLS} FROM crm_options WHERE kind = $1 AND id = $2 FOR UPDATE`, [kind, id]);
    if (!rows[0]) throw new CrmNotFoundError("Opção não encontrada.");
    const label = input.label === undefined ? rows[0].label : cleanLabel(input.label);
    const description = input.description === undefined ? rows[0].description : cleanText(input.description, 300);
    const color = optionColor(kind, input.color, rows[0].color);
    if (label !== rows[0].label) await assertUniqueLabel(client, kind, label, id);
    let renamedRecords = 0;
    if (kind === "segment" && label !== rows[0].label) {
      const a = await client.query(`UPDATE crm_companies SET segment = $2, updated_at = now() WHERE segment = $1`, [rows[0].label, label]);
      const b = await client.query(`UPDATE crm_contacts SET segment = $2, updated_at = now() WHERE segment = $1`, [rows[0].label, label]);
      renamedRecords = (a.rowCount ?? 0) + (b.rowCount ?? 0);
    }
    const meta = optionMeta(kind, id, input.meta, rows[0].meta ?? {});
    const updated = await client.query<OptionRow>(
      `UPDATE crm_options SET label = $3, description = $4, color = $5, meta = $6, updated_at = now() WHERE kind = $1 AND id = $2
       RETURNING ${OPTION_COLS}`,
      [kind, id, label, description, color, JSON.stringify(meta)]
    );
    return { before: rows[0].label, colorBefore: mapOption(rows[0]).color, metaBefore: rows[0].meta ?? {}, after: mapOption(updated.rows[0]), renamedRecords };
  });
}

export async function setOptionArchived(kind: OptionKind, id: string, archived: boolean): Promise<CrmOption> {
  const db = await getDb();
  const { rows } = await db.query<OptionRow>(`SELECT ${OPTION_COLS} FROM crm_options WHERE kind = $1 AND id = $2`, [kind, id]);
  if (!rows[0]) throw new CrmNotFoundError("Opção não encontrada.");
  if (archived && rows[0].locked) {
    throw new CrmInputError(
      kind === "stage" ? `"${rows[0].label}" é uma etapa fixa do funil e não pode ser arquivada.` : `"${rows[0].label}" é usada quando nenhuma outra se aplica e não pode ser arquivada.`
    );
  }
  if (archived && kind === "stage") {
    const inUse = await db.query<{ n: string }>(`SELECT count(*) AS n FROM crm_deals WHERE stage = $1`, [id]);
    const n = Number(inUse.rows[0].n);
    if (n > 0) throw new CrmInputError(`Há ${n} ${n === 1 ? "oportunidade" : "oportunidades"} em "${rows[0].label}". Mova-as para outra etapa antes de arquivar.`);
  }
  const updated = await db.query<OptionRow>(
    `UPDATE crm_options SET archived_at = ${archived ? "COALESCE(archived_at, now())" : "NULL"}, updated_at = now() WHERE kind = $1 AND id = $2
     RETURNING ${OPTION_COLS}`,
    [kind, id]
  );
  return mapOption(updated.rows[0]);
}

/** New order: `ids` lists the kind's options top to bottom (missing ones keep their relative order after). */
export async function reorderOptions(kind: OptionKind, ids: unknown): Promise<void> {
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== "string")) throw new CrmInputError("Ordem inválida.");
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM crm_options WHERE kind = $1 ORDER BY sort, lower(label) FOR UPDATE`, [kind]);
    const order = [...(ids as string[]).filter((id) => rows.some((r) => r.id === id)), ...rows.map((r) => r.id).filter((id) => !(ids as string[]).includes(id))];
    for (const [i, id] of order.entries()) await client.query(`UPDATE crm_options SET sort = $3 WHERE kind = $1 AND id = $2`, [kind, id, i]);
    if (kind === "stage") await normalizeStageOrder(client);
  });
}

/** The funnel's active stages, in order, with what each means. */
/** Teaches the server's labels (exports, notifications, AI) the stage names as renamed in Personalização. */
export async function loadStageLabels(q?: Q): Promise<void> {
  registerStageLabels(await listStages(q));
}

export async function listStages(q?: Q): Promise<{ id: string; label: string; archived: boolean; probability: number; outcome: "open" | "won" | "lost" }[]> {
  const db = q ?? (await getDb());
  const { rows } = await db.query<OptionRow>(`SELECT ${OPTION_COLS} FROM crm_options WHERE kind = 'stage' ORDER BY sort, lower(label)`);
  return rows.map((r) => {
    const m = optionMeta("stage", r.id, undefined, r.meta ?? {}) as { probability: number; outcome: "open" | "won" | "lost" };
    return { id: r.id, label: r.label, archived: r.archived_at !== null, probability: m.probability, outcome: m.outcome };
  });
}

// ---------- tags (Administrador) ----------

export type TagInput = { category?: unknown; label?: unknown; description?: unknown; color?: unknown };

async function assertUniqueTag(q: Q, category: string, label: string, exceptId?: string) {
  const { rows } = await q.query<{ id: string; label: string }>(`SELECT id, label FROM crm_tags WHERE category = $1`, [category]);
  const clash = rows.find((r) => r.id !== exceptId && foldLabel(r.label) === foldLabel(label));
  if (clash) throw new CrmInputError(`Já existe a etiqueta "${clash.label}" nessa categoria (pode estar arquivada).`);
}

export async function createTag(input: TagInput): Promise<CrmTag> {
  if (!isTagCategory(input.category)) throw new CrmInputError("Escolha a categoria da etiqueta.");
  const category = input.category;
  const label = cleanText(input.label, 40)?.replace(/\s+/g, " ");
  if (!label) throw new CrmInputError("Dê um nome para a etiqueta.");
  const color = isTagColor(input.color) ? input.color : "cinza";
  const description = cleanText(input.description, 300);
  return withTransaction(async (client) => {
    await client.query(`SELECT pg_advisory_xact_lock(hashtext('crm_tags'))`);
    await assertUniqueTag(client, category, label);
    const { rows } = await client.query<TagRow>(
      `INSERT INTO crm_tags (id, category, label, description, color, sort)
       VALUES ($1, $2, $3, $4, $5, (SELECT COALESCE(max(sort), -1) + 1 FROM crm_tags WHERE category = $2))
       RETURNING id, category, label, description, color, sort, archived_at`,
      [`tag-${randomUUID()}`, category, label, description, color]
    );
    return mapTag(rows[0]);
  });
}

export async function updateTag(id: string, input: TagInput): Promise<{ before: CrmTag; after: CrmTag }> {
  return withTransaction(async (client) => {
    const { rows } = await client.query<TagRow>(`SELECT id, category, label, description, color, sort, archived_at FROM crm_tags WHERE id = $1 FOR UPDATE`, [id]);
    if (!rows[0]) throw new CrmNotFoundError("Etiqueta não encontrada.");
    const cur = rows[0];
    const category = input.category === undefined ? cur.category : isTagCategory(input.category) ? input.category : null;
    if (!category) throw new CrmInputError("Categoria inválida.");
    const label = input.label === undefined ? cur.label : cleanText(input.label, 40)?.replace(/\s+/g, " ");
    if (!label) throw new CrmInputError("Dê um nome para a etiqueta.");
    const color = input.color === undefined ? cur.color : isTagColor(input.color) ? input.color : null;
    if (!color) throw new CrmInputError("Cor inválida.");
    const description = input.description === undefined ? cur.description : cleanText(input.description, 300);
    if (label !== cur.label || category !== cur.category) await assertUniqueTag(client, category, label, id);
    const updated = await client.query<TagRow>(
      `UPDATE crm_tags SET category = $2, label = $3, description = $4, color = $5, updated_at = now() WHERE id = $1
       RETURNING id, category, label, description, color, sort, archived_at`,
      [id, category, label, description, color]
    );
    return { before: mapTag(cur), after: mapTag(updated.rows[0]) };
  });
}

/** Archiving keeps the tag on the contacts that have it (history), but nobody can apply it anymore. */
export async function setTagArchived(id: string, archived: boolean): Promise<CrmTag> {
  const db = await getDb();
  const { rows } = await db.query<TagRow>(
    `UPDATE crm_tags SET archived_at = ${archived ? "COALESCE(archived_at, now())" : "NULL"}, updated_at = now() WHERE id = $1
     RETURNING id, category, label, description, color, sort, archived_at`,
    [id]
  );
  if (!rows[0]) throw new CrmNotFoundError("Etiqueta não encontrada.");
  return mapTag(rows[0]);
}

export async function reorderTags(category: unknown, ids: unknown): Promise<void> {
  if (!isTagCategory(category)) throw new CrmInputError("Categoria inválida.");
  if (!Array.isArray(ids) || ids.some((v) => typeof v !== "string")) throw new CrmInputError("Ordem inválida.");
  await withTransaction(async (client) => {
    const { rows } = await client.query<{ id: string }>(`SELECT id FROM crm_tags WHERE category = $1 ORDER BY sort, lower(label) FOR UPDATE`, [category]);
    const order = [...(ids as string[]).filter((id) => rows.some((r) => r.id === id)), ...rows.map((r) => r.id).filter((id) => !(ids as string[]).includes(id))];
    for (const [i, id] of order.entries()) await client.query(`UPDATE crm_tags SET sort = $2 WHERE id = $1`, [id, i]);
  });
}

// ---------- tags on contacts ----------

/** Applies an active tag to a contact (no-op if it already has it). Logged in the contact's history. */
export async function addContactTagTx(client: PoolClient, contactId: string, tagId: string, actor: CrmActor, via: TagVia): Promise<boolean> {
  const tag = await client.query<{ label: string; archived: boolean }>(`SELECT label, archived_at IS NOT NULL AS archived FROM crm_tags WHERE id = $1`, [tagId]);
  if (!tag.rows[0]) throw new CrmInputError("Etiqueta não encontrada.");
  if (tag.rows[0].archived) throw new CrmInputError(`A etiqueta "${tag.rows[0].label}" foi arquivada.`);
  const res = await client.query(
    `INSERT INTO crm_contact_tags (contact_id, tag_id, applied_via, applied_by, applied_by_name) VALUES ($1, $2, $3, $4, $5)
     ON CONFLICT DO NOTHING`,
    [contactId, tagId, via, actor?.userId ?? null, actor?.userName ?? null]
  );
  if (!res.rowCount) return false;
  await addEvent(client, contactId, "tag", { action: "added", tagId, label: tag.rows[0].label, via }, actor);
  return true;
}

export async function addContactTag(contactId: string, tagId: string, actor: CrmActor, via: TagVia = "manual"): Promise<boolean> {
  return withTransaction((client) => addContactTagTx(client, contactId, tagId, actor, via));
}

export async function removeContactTag(contactId: string, tagId: string, actor: CrmActor): Promise<boolean> {
  return withTransaction(async (client) => {
    const res = await client.query<{ label: string }>(
      `DELETE FROM crm_contact_tags ct USING crm_tags t WHERE ct.contact_id = $1 AND ct.tag_id = $2 AND t.id = ct.tag_id RETURNING t.label`,
      [contactId, tagId]
    );
    if (!res.rows[0]) return false;
    await addEvent(client, contactId, "tag", { action: "removed", tagId, label: res.rows[0].label }, actor);
    return true;
  });
}

/** Tags of one contact with who/how applied (contact panel). */
export async function listContactTags(contactId: string): Promise<{ tagId: string; via: TagVia; byName: string | null; at: string }[]> {
  const db = await getDb();
  const { rows } = await db.query<{ tag_id: string; applied_via: TagVia; applied_by_name: string | null; applied_at: Date }>(
    `SELECT ct.tag_id, ct.applied_via, ct.applied_by_name, ct.applied_at FROM crm_contact_tags ct JOIN crm_tags t ON t.id = ct.tag_id
     WHERE ct.contact_id = $1 ORDER BY t.category, t.sort, lower(t.label)`,
    [contactId]
  );
  return rows.map((r) => ({ tagId: r.tag_id, via: r.applied_via, byName: r.applied_by_name, at: r.applied_at.toISOString() }));
}

export const TAG_CATEGORY_LABEL: Record<string, string> = Object.fromEntries(TAG_CATEGORIES.map((c) => [c.id, c.label]));
export { usageKey };
