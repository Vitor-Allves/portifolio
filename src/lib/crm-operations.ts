// Server-only. Contratos e operação dos clientes ativos (evolução v1.0, itens
// 8 e 9): the contract's extra details (number, origin proposal, payment
// terms, term, renewal, cancellation rules, sales and operations owners,
// signed document) and its PDF; the onboarding checklist, the deliverables
// and the satisfaction records; and formalizing an approved proposal — the
// sale is registered, the client and its contract are created from the
// proposal and the onboarding checklist starts by itself.

import { randomUUID } from "crypto";
import type { PoolClient } from "pg";
import { getDb, withTransaction } from "./db";
import { writeAudit } from "./audit-log";
import { CrmForbiddenError, CrmInputError, CrmNotFoundError, addEvent, brDate, cleanText, iso, parseDateOnly } from "./crm-core";
import { canAct, canSee, requireCap, type CrmSession } from "./crm-access";
import { addClientEvent, createClientTx, lockClient, requireActiveUser, todayBr } from "./crm-clients";
import { seedOnboarding } from "./crm-onboarding-seed";
import { updateDealTx } from "./crm-deals";
import { formatBRL, formatCnpj } from "./crm-types";
import { optionLabel, requireOptionId } from "./crm-options";
import { buildCrmPdf, brDateTime, type CrmPdfSection } from "./crm-pdf";
import { lineNet, proposalNumber, type ProposalContent } from "./crm-proposal-types";
import {
  CONTRACT_RENEWALS,
  isContractRenewal,
  isDeliverableStatus,
  type CrmClientOperation,
  type CrmDeliverable,
  type CrmOnboardingItem,
  type CrmSatisfaction,
} from "./crm-operation-types";

/** The client row, checking this person may see it. */
async function seeClient(s: CrmSession, clientId: string): Promise<{ owner_id: string | null; company_name: string }> {
  requireCap(s, "viewClients");
  const db = await getDb();
  const { rows } = await db.query<{ owner_id: string | null; company_name: string }>(
    `SELECT cl.owner_id, co.name AS company_name FROM crm_clients cl JOIN crm_companies co ON co.id = cl.company_id WHERE cl.id = $1`,
    [clientId],
  );
  if (!rows[0] || !canSee(s, rows[0].owner_id)) throw new CrmNotFoundError("Cliente não encontrado.");
  return rows[0];
}

// ---------- reading ----------

export async function getOperation(s: CrmSession, clientId: string): Promise<CrmClientOperation> {
  await seeClient(s, clientId);
  const db = await getDb();
  const today = todayBr();
  const [onb, del, sat] = await Promise.all([
    db.query<{
      id: string;
      item: string;
      label: string;
      owner_id: string | null;
      owner_name: string | null;
      due_on: string | null;
      done_at: Date | null;
      done_by_name: string | null;
      note: string | null;
    }>(
      `SELECT o.id, o.item, o.label, o.owner_id, u.name AS owner_name, o.due_on::text AS due_on, o.done_at, o.done_by_name, o.note
       FROM crm_client_onboarding o LEFT JOIN internal_users u ON u.id = o.owner_id WHERE o.client_id = $1 ORDER BY o.sort, o.label`,
      [clientId],
    ),
    db.query<{
      id: string;
      contract_id: string | null;
      service: string | null;
      title: string;
      description: string | null;
      owner_id: string | null;
      owner_name: string | null;
      due_on: string | null;
      status: CrmDeliverable["status"];
      delivered_at: Date | null;
      created_by_name: string | null;
      updated_at: Date;
    }>(
      `SELECT d.id, d.contract_id, d.service, d.title, d.description, d.owner_id, u.name AS owner_name, d.due_on::text AS due_on, d.status, d.delivered_at, d.created_by_name, d.updated_at
       FROM crm_client_deliverables d LEFT JOIN internal_users u ON u.id = d.owner_id WHERE d.client_id = $1
       ORDER BY (d.status IN ('entregue', 'cancelado')), d.due_on NULLS LAST, d.created_at`,
      [clientId],
    ),
    db.query<{ id: string; score: number; comment: string | null; recorded_by_name: string | null; created_at: Date }>(
      `SELECT id, score, comment, recorded_by_name, created_at FROM crm_client_satisfaction WHERE client_id = $1 ORDER BY created_at DESC`,
      [clientId],
    ),
  ]);
  const scores = sat.rows.map((r) => Number(r.score));
  return {
    onboarding: onb.rows.map(
      (r): CrmOnboardingItem => ({
        id: r.id,
        item: r.item,
        label: r.label,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        dueOn: r.due_on,
        doneAt: iso(r.done_at),
        doneByName: r.done_by_name,
        note: r.note,
      }),
    ),
    deliverables: del.rows.map(
      (r): CrmDeliverable => ({
        id: r.id,
        contractId: r.contract_id,
        service: r.service,
        title: r.title,
        description: r.description,
        ownerId: r.owner_id,
        ownerName: r.owner_name,
        dueOn: r.due_on,
        status: r.status,
        late: (r.status === "pendente" || r.status === "em_andamento") && r.due_on !== null && r.due_on < today,
        deliveredAt: iso(r.delivered_at),
        createdByName: r.created_by_name,
        updatedAt: iso(r.updated_at)!,
      }),
    ),
    satisfaction: sat.rows.map(
      (r): CrmSatisfaction => ({ id: r.id, score: Number(r.score), comment: r.comment, recordedByName: r.recorded_by_name, createdAt: iso(r.created_at)! }),
    ),
    satisfactionAvg: scores.length ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null,
  };
}

// ---------- onboarding ----------

/** Starts the checklist for a client that has none (clients created before it existed). */
export async function startOnboarding(s: CrmSession, clientId: string): Promise<void> {
  await withTransaction(async (q) => {
    const cl = await lockClient(q, s, clientId);
    const n = await seedOnboarding(q, clientId, cl.owner_id);
    if (n === 0) throw new CrmInputError("O checklist de onboarding já existe.");
    await addClientEvent(q, clientId, "onboarding", { action: "started" }, s);
  });
}

export async function updateOnboardingItem(
  s: CrmSession,
  clientId: string,
  itemId: string,
  input: { done?: unknown; ownerId?: unknown; dueOn?: unknown; note?: unknown },
): Promise<void> {
  await withTransaction(async (q) => {
    await lockClient(q, s, clientId);
    const { rows } = await q.query<{ label: string; done_at: Date | null; owner_id: string | null; due_on: string | null; note: string | null }>(
      `SELECT label, done_at, owner_id, due_on::text AS due_on, note FROM crm_client_onboarding WHERE id = $1 AND client_id = $2 FOR UPDATE`,
      [itemId, clientId],
    );
    const cur = rows[0];
    if (!cur) throw new CrmNotFoundError("Item do onboarding não encontrado.");
    const sets: string[] = [];
    const values: unknown[] = [itemId];
    const set = (col: string, v: unknown) => {
      values.push(v);
      sets.push(`${col} = $${values.length}`);
    };
    let action: string | null = null;
    if (input.done !== undefined) {
      if (input.done === true && !cur.done_at) {
        set("done_at", new Date());
        set("done_by_name", s.userName);
        action = "done";
      } else if (input.done === false && cur.done_at) {
        set("done_at", null);
        set("done_by_name", null);
        action = "undone";
      }
    }
    if (input.ownerId !== undefined) {
      const owner = await requireActiveUser(q, typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null);
      set("owner_id", owner?.id ?? null);
    }
    if (input.dueOn !== undefined) set("due_on", parseDateOnly(input.dueOn, "Prazo"));
    if (input.note !== undefined) set("note", cleanText(input.note, 1000));
    if (!sets.length) return;
    await q.query(`UPDATE crm_client_onboarding SET ${sets.join(", ")} WHERE id = $1`, values);
    if (action) await addClientEvent(q, clientId, "onboarding", { action, label: cur.label }, s);
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
  });
}

// ---------- deliverables ----------

type DeliverableInput = {
  title?: unknown;
  description?: unknown;
  service?: unknown;
  contractId?: unknown;
  ownerId?: unknown;
  dueOn?: unknown;
  status?: unknown;
};

export async function saveDeliverable(s: CrmSession, clientId: string, id: string | null, input: DeliverableInput): Promise<string> {
  return withTransaction(async (q) => {
    await lockClient(q, s, clientId);
    const cur = id
      ? (
          await q.query<{
            title: string;
            status: string;
            description: string | null;
            service: string | null;
            contract_id: string | null;
            owner_id: string | null;
            due_on: string | null;
          }>(
            `SELECT title, status, description, service, contract_id, owner_id, due_on::text AS due_on FROM crm_client_deliverables WHERE id = $1 AND client_id = $2 FOR UPDATE`,
            [id, clientId],
          )
        ).rows[0]
      : undefined;
    if (id && !cur) throw new CrmNotFoundError("Entregável não encontrado.");
    const has = (k: keyof DeliverableInput) => input[k] !== undefined;
    const title = has("title") ? cleanText(input.title, 200) : (cur?.title ?? null);
    if (!title) throw new CrmInputError("Diga o que será entregue.");
    const status = has("status") ? input.status : (cur?.status ?? "pendente");
    if (!isDeliverableStatus(status)) throw new CrmInputError("Situação do entregável inválida.");
    let service = cur?.service ?? null;
    if (has("service")) service = input.service ? await requireOptionId(q, "service", input.service, cur?.service ?? null) : null;
    let contractId = cur?.contract_id ?? null;
    if (has("contractId")) {
      contractId = typeof input.contractId === "string" && input.contractId ? input.contractId : null;
      if (contractId && !(await q.query(`SELECT 1 FROM crm_contracts WHERE id = $1 AND client_id = $2`, [contractId, clientId])).rows.length)
        throw new CrmInputError("Contrato inválido.");
    }
    let ownerId = cur?.owner_id ?? null;
    if (has("ownerId")) ownerId = (await requireActiveUser(q, typeof input.ownerId === "string" && input.ownerId ? input.ownerId : null))?.id ?? null;
    const dueOn = has("dueOn") ? parseDateOnly(input.dueOn, "Prazo") : (cur?.due_on ?? null);
    const description = has("description") ? cleanText(input.description, 2000) : (cur?.description ?? null);
    const newId = id ?? randomUUID();
    if (cur) {
      await q.query(
        `UPDATE crm_client_deliverables SET title = $2, description = $3, service = $4, contract_id = $5, owner_id = $6, due_on = $7, status = $8,
                delivered_at = CASE WHEN $8 = 'entregue' THEN COALESCE(delivered_at, now()) ELSE NULL END, updated_at = now() WHERE id = $1`,
        [id, title, description, service, contractId, ownerId, dueOn, status],
      );
      if (cur.status !== status) await addClientEvent(q, clientId, "deliverable", { action: "status", title, from: cur.status, to: status }, s);
    } else {
      await q.query(
        `INSERT INTO crm_client_deliverables (id, client_id, contract_id, service, title, description, owner_id, due_on, status, delivered_at, created_by, created_by_name)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, CASE WHEN $9 = 'entregue' THEN now() END, $10, $11)`,
        [newId, clientId, contractId, service, title, description, ownerId, dueOn, status, s.userId, s.userName],
      );
      await addClientEvent(q, clientId, "deliverable", { action: "created", title, dueOn }, s);
    }
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
    return newId;
  });
}

// ---------- satisfaction ----------

export async function addSatisfaction(s: CrmSession, clientId: string, input: { score?: unknown; comment?: unknown }): Promise<void> {
  const score = typeof input.score === "string" ? Number(input.score) : input.score;
  if (typeof score !== "number" || !Number.isInteger(score) || score < 0 || score > 10) throw new CrmInputError("Nota de satisfação inválida: de 0 a 10.");
  await withTransaction(async (q) => {
    await lockClient(q, s, clientId);
    const comment = cleanText(input.comment, 1000);
    await q.query(`INSERT INTO crm_client_satisfaction (id, client_id, score, comment, recorded_by, recorded_by_name) VALUES ($1, $2, $3, $4, $5, $6)`, [
      randomUUID(),
      clientId,
      score,
      comment,
      s.userId,
      s.userName,
    ]);
    await addClientEvent(q, clientId, "satisfaction", { score, comment }, s);
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
  });
}

// ---------- contract details ----------

export type ContractDetailsInput = {
  paymentTerms?: unknown;
  dueDay?: unknown;
  termMonths?: unknown;
  renewal?: unknown;
  cancellationRules?: unknown;
  salesOwnerId?: unknown;
  opsOwnerId?: unknown;
  signedFileId?: unknown;
  signedOn?: unknown;
};

function intIn(v: unknown, min: number, max: number, what: string): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "string" ? Number(v) : v;
  if (typeof n !== "number" || !Number.isInteger(n) || n < min || n > max) throw new CrmInputError(`${what}: use um número de ${min} a ${max}.`);
  return n;
}

/** The last day of a term of `months` starting on `start` (YYYY-MM-DD). */
export function termEnd(start: string, months: number): string {
  const [y, m, d] = start.split("-").map(Number);
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

type DetailsRow = {
  payment_terms: string | null;
  due_day: number | null;
  term_months: number | null;
  renewal: string | null;
  cancellation_rules: string | null;
  sales_owner_id: string | null;
  ops_owner_id: string | null;
  signed_file_id: string | null;
  signed_on: string | null;
  starts_on: string;
  ends_on: string | null;
  number: number;
};

export async function updateContractDetails(s: CrmSession, clientId: string, contractId: string, input: ContractDetailsInput): Promise<void> {
  const out = await withTransaction(async (q) => {
    const cl = await lockClient(q, s, clientId);
    const { rows } = await q.query<DetailsRow>(
      `SELECT payment_terms, due_day, term_months, renewal, cancellation_rules, sales_owner_id, ops_owner_id, signed_file_id, signed_on::text AS signed_on,
              starts_on::text AS starts_on, ends_on::text AS ends_on, number
       FROM crm_contracts WHERE id = $1 AND client_id = $2 FOR UPDATE`,
      [contractId, clientId],
    );
    const cur = rows[0];
    if (!cur) throw new CrmNotFoundError("Contrato não encontrado.");
    const next = { ...cur };
    const changes: { field: string; from: string | null; to: string | null }[] = [];
    const userName = async (id: string | null) =>
      id ? ((await q.query<{ name: string }>(`SELECT name FROM internal_users WHERE id = $1`, [id])).rows[0]?.name ?? null) : null;
    if (input.paymentTerms !== undefined) next.payment_terms = cleanText(input.paymentTerms, 2000);
    if (input.dueDay !== undefined) next.due_day = intIn(input.dueDay, 1, 31, "Dia de vencimento");
    if (input.termMonths !== undefined) {
      next.term_months = intIn(input.termMonths, 1, 120, "Prazo de vigência (meses)");
      if (next.term_months) next.ends_on = termEnd(cur.starts_on, next.term_months);
    }
    if (input.renewal !== undefined) {
      if (input.renewal !== null && input.renewal !== "" && !isContractRenewal(input.renewal)) throw new CrmInputError("Renovação inválida.");
      next.renewal = (input.renewal as string) || null;
    }
    if (input.cancellationRules !== undefined) next.cancellation_rules = cleanText(input.cancellationRules, 4000);
    if (input.salesOwnerId !== undefined)
      next.sales_owner_id = (await requireActiveUser(q, typeof input.salesOwnerId === "string" && input.salesOwnerId ? input.salesOwnerId : null))?.id ?? null;
    if (input.opsOwnerId !== undefined)
      next.ops_owner_id = (await requireActiveUser(q, typeof input.opsOwnerId === "string" && input.opsOwnerId ? input.opsOwnerId : null))?.id ?? null;
    if (input.signedFileId !== undefined) {
      const fid = typeof input.signedFileId === "string" && input.signedFileId ? input.signedFileId : null;
      if (fid && !(await q.query(`SELECT 1 FROM crm_files WHERE id = $1 AND client_id = $2 AND archived_at IS NULL`, [fid, clientId])).rows.length) {
        throw new CrmInputError("O documento assinado precisa estar entre os documentos deste cliente.");
      }
      next.signed_file_id = fid;
    }
    if (input.signedOn !== undefined) next.signed_on = parseDateOnly(input.signedOn, "Data da assinatura");
    const label = (r: string | null) => CONTRACT_RENEWALS.find((x) => x.id === r)?.label ?? null;
    const fileName = async (id: string | null) =>
      id ? ((await q.query<{ name: string }>(`SELECT name FROM crm_files WHERE id = $1`, [id])).rows[0]?.name ?? null) : null;
    if (next.payment_terms !== cur.payment_terms) changes.push({ field: "Condições de pagamento", from: cur.payment_terms, to: next.payment_terms });
    if (next.due_day !== cur.due_day)
      changes.push({ field: "Dia de vencimento", from: cur.due_day ? String(cur.due_day) : null, to: next.due_day ? String(next.due_day) : null });
    if (next.term_months !== cur.term_months)
      changes.push({
        field: "Prazo de vigência",
        from: cur.term_months ? `${cur.term_months} meses` : null,
        to: next.term_months ? `${next.term_months} meses` : null,
      });
    if (next.ends_on !== cur.ends_on)
      changes.push({ field: "Vencimento", from: cur.ends_on ? brDate(cur.ends_on) : "sem prazo", to: next.ends_on ? brDate(next.ends_on) : "sem prazo" });
    if (next.renewal !== cur.renewal) changes.push({ field: "Renovação", from: label(cur.renewal), to: label(next.renewal) });
    if (next.cancellation_rules !== cur.cancellation_rules) changes.push({ field: "Regras de cancelamento", from: null, to: null });
    if (next.sales_owner_id !== cur.sales_owner_id)
      changes.push({ field: "Responsável comercial", from: await userName(cur.sales_owner_id), to: await userName(next.sales_owner_id) });
    if (next.ops_owner_id !== cur.ops_owner_id)
      changes.push({ field: "Responsável operacional", from: await userName(cur.ops_owner_id), to: await userName(next.ops_owner_id) });
    if (next.signed_file_id !== cur.signed_file_id)
      changes.push({ field: "Documento assinado", from: await fileName(cur.signed_file_id), to: await fileName(next.signed_file_id) });
    if (next.signed_on !== cur.signed_on)
      changes.push({ field: "Assinado em", from: cur.signed_on ? brDate(cur.signed_on) : null, to: next.signed_on ? brDate(next.signed_on) : null });
    if (!changes.length) return null;
    await q.query(
      `UPDATE crm_contracts SET payment_terms = $2, due_day = $3, term_months = $4, ends_on = $5, renewal = $6, cancellation_rules = $7, sales_owner_id = $8,
              ops_owner_id = $9, signed_file_id = $10, signed_on = $11, updated_at = now() WHERE id = $1`,
      [
        contractId,
        next.payment_terms,
        next.due_day,
        next.term_months,
        next.ends_on,
        next.renewal,
        next.cancellation_rules,
        next.sales_owner_id,
        next.ops_owner_id,
        next.signed_file_id,
        next.signed_on,
      ],
    );
    await addClientEvent(q, clientId, "contract_edited", { contractId, label: `Contrato nº ${proposalNumber(cur.number)}`, changes }, s);
    await q.query(`UPDATE crm_clients SET updated_at = now() WHERE id = $1`, [clientId]);
    return { name: cl.company_name, fields: changes.map((c) => c.field) };
  });
  if (out) {
    await writeAudit({
      actorUserId: s.userId,
      actorLabel: s.userName,
      actorKind: "admin",
      action: "crm.contract_change",
      targetType: "crm_client",
      targetId: clientId,
      targetLabel: out.name,
      metadata: { contractId, action: "detalhes", fields: out.fields },
    });
  }
}

// ---------- contract document (PDF) ----------

export async function contractPdf(s: CrmSession, clientId: string, contractId: string): Promise<{ bytes: Uint8Array; number: number }> {
  const cl = await seeClient(s, clientId);
  const db = await getDb();
  const { rows } = await db.query<{
    number: number;
    services: string[];
    starts_on: string;
    ends_on: string | null;
    value_cents: string | null;
    one_time_cents: string | null;
    billing: string;
    status: string;
    notes: string | null;
    payment_terms: string | null;
    due_day: number | null;
    term_months: number | null;
    renewal: string | null;
    cancellation_rules: string | null;
    sales_name: string | null;
    ops_name: string | null;
    deal_owner_name: string | null;
    signed_on: string | null;
    proposal_number: number | null;
    sent_version: number | null;
    proposal_id: string | null;
    legal_name: string | null;
    cnpj: string | null;
    address: string | null;
    city: string | null;
    state: string | null;
  }>(
    `SELECT k.number, k.services, k.starts_on::text AS starts_on, k.ends_on::text AS ends_on, k.value_cents, k.one_time_cents, k.billing, k.status, k.notes,
            k.payment_terms, k.due_day, k.term_months, k.renewal, k.cancellation_rules, su.name AS sales_name, ou.name AS ops_name, du.name AS deal_owner_name,
            k.signed_on::text AS signed_on, p.number AS proposal_number, p.sent_version, p.id AS proposal_id,
            co.legal_name, co.cnpj, co.address, co.city, co.state
     FROM crm_contracts k JOIN crm_clients cl ON cl.id = k.client_id JOIN crm_companies co ON co.id = cl.company_id
     LEFT JOIN internal_users su ON su.id = k.sales_owner_id LEFT JOIN internal_users ou ON ou.id = k.ops_owner_id
     LEFT JOIN crm_deals d ON d.id = k.deal_id LEFT JOIN internal_users du ON du.id = d.owner_id
     LEFT JOIN crm_proposals p ON p.id = k.proposal_id
     WHERE k.id = $1 AND k.client_id = $2`,
    [contractId, clientId],
  );
  const k = rows[0];
  if (!k) throw new CrmNotFoundError("Contrato não encontrado.");
  const show = s.caps.seeContractValues;
  const money = (c: string | null) => (c === null ? "—" : formatBRL(Number(c)) || "R$ 0");
  // The services and conditions as approved, when the contract came from a proposal.
  let approved: { content: ProposalContent; hash: string; approval: { name: string; email: string | null; created_at: Date } | null } | null = null;
  if (k.proposal_id && k.sent_version) {
    const v = await db.query<{ content: ProposalContent; content_hash: string }>(
      `SELECT content, content_hash FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2`,
      [k.proposal_id, k.sent_version],
    );
    const a = await db.query<{ name: string; email: string | null; created_at: Date }>(
      `SELECT name, email, created_at FROM crm_proposal_approvals WHERE proposal_id = $1 AND decision = 'aprovada' ORDER BY created_at DESC LIMIT 1`,
      [k.proposal_id],
    );
    if (v.rows[0]) approved = { content: v.rows[0].content, hash: v.rows[0].content_hash, approval: a.rows[0] ?? null };
  }
  const serviceNames: string[] = [];
  for (const id of k.services ?? []) serviceNames.push((await optionLabel(db, "service", id)) ?? id);
  const sections: CrmPdfSection[] = [
    {
      title: "Partes",
      paragraphs: [
        `Contratante: ${k.legal_name ?? cl.company_name}${k.cnpj ? `, CNPJ ${formatCnpj(k.cnpj)}` : ""}${k.address ? `, ${k.address}` : ""}${k.city ? `, ${k.city}${k.state ? `/${k.state}` : ""}` : ""}.`,
        "Contratada: Legado Enterprise.",
      ],
    },
    approved
      ? {
          title: "Objeto",
          head: ["Serviço", "Qtd.", "Valor", "Cobrança"],
          rows: approved.content.items.map((i) => [
            i.description ? `${i.name}\n${i.description}` : i.name,
            String(i.quantity),
            show ? formatBRL(lineNet(i)) || "R$ 0" : "—",
            i.billing === "mensal" ? "Mensal" : "Único",
          ]),
          right: [1, 2],
        }
      : { title: "Objeto", paragraphs: [serviceNames.join(", ") || "Serviços a definir."] },
    {
      title: "Valores e pagamento",
      paragraphs: [
        show
          ? `${k.billing === "mensal" ? `Valor mensal: ${money(k.value_cents)}` : `Valor: ${money(k.value_cents)}`}${k.one_time_cents ? ` · valor único: ${money(k.one_time_cents)}` : ""}.`
          : "Valores: visíveis só para quem vê os valores dos contratos.",
        ...(k.due_day ? [`Vencimento das cobranças: todo dia ${k.due_day}.`] : []),
        ...(k.payment_terms ? [`Condições de pagamento: ${k.payment_terms}`] : []),
      ],
    },
    {
      title: "Vigência e renovação",
      paragraphs: [
        `Início em ${brDate(k.starts_on)}${k.term_months ? `, prazo de ${k.term_months} meses` : ""}${k.ends_on ? `, vencimento em ${brDate(k.ends_on)}` : ", sem prazo determinado"}.`,
        CONTRACT_RENEWALS.find((r) => r.id === k.renewal)?.label ?? "Renovação: a combinar.",
      ],
    },
    { title: "Cancelamento", paragraphs: [k.cancellation_rules ?? "Regras de cancelamento a definir."] },
    {
      title: "Responsáveis",
      paragraphs: [`Comercial: ${k.sales_name ?? k.deal_owner_name ?? "—"}`, `Operacional: ${k.ops_name ?? "—"}`],
    },
  ];
  if (approved) {
    sections.push({
      title: "Proposta de origem",
      paragraphs: [
        `Proposta nº ${proposalNumber(k.proposal_number ?? 0)}, versão ${k.sent_version}${approved.approval ? `, aprovada por ${approved.approval.name}${approved.approval.email ? ` (${approved.approval.email})` : ""} em ${brDateTime(approved.approval.created_at)}` : ""}.`,
        `Código de verificação do conteúdo aprovado: ${approved.hash}`,
      ],
    });
  }
  if (k.notes) sections.push({ title: "Observações", paragraphs: [k.notes] });
  sections.push({
    title: "Assinaturas",
    paragraphs: [
      "",
      `______________________________________   ${k.legal_name ?? cl.company_name} (Contratante)`,
      "",
      "______________________________________   Legado Enterprise (Contratada)",
      "",
      k.signed_on ? `Assinado em ${brDate(k.signed_on)}.` : "Data: ____/____/________",
    ],
  });
  const bytes = await buildCrmPdf({
    title: `Contrato nº ${proposalNumber(k.number)}`,
    lines: [cl.company_name, "Documento gerado com os dados do CRM. Revise com o jurídico antes da assinatura."],
    sections,
    generatedBy: s.userName,
    footerNote: "Contrato — Legado Enterprise",
    headerLabel: "Contrato",
  });
  return { bytes, number: k.number };
}

// ---------- formalizing an approved proposal ----------

export type FormalizeInput = {
  wonReason?: unknown;
  startsOn?: unknown;
  termMonths?: unknown;
  dueDay?: unknown;
  renewal?: unknown;
  cancellationRules?: unknown;
  opsOwnerId?: unknown;
};

/**
 * Proposta aprovada → venda registrada (Venda fechada, "Proposta aprovada"),
 * cliente ativo (or a new contract of an existing one) with the proposal's
 * services, values and conditions, and the onboarding checklist.
 */
export async function formalizeProposal(s: CrmSession, proposalId: string, input: FormalizeInput): Promise<{ clientId: string; contractId: string }> {
  requireCap(s, "editPipeline");
  const result = await withTransaction(async (q) => {
    const { rows } = await q.query<{
      id: string;
      number: number;
      status: string;
      sent_version: number | null;
      deal_id: string;
      contact_id: string;
      deal_owner: string | null;
      contact_owner: string | null;
      deal_stage: string;
      deal_service: string | null;
      contract_id: string | null;
    }>(
      `SELECT p.id, p.number, p.status, p.sent_version, p.deal_id, p.contact_id, d.owner_id AS deal_owner, c.owner_id AS contact_owner, d.stage AS deal_stage,
              d.service AS deal_service, (SELECT k.id FROM crm_contracts k WHERE k.proposal_id = p.id) AS contract_id
       FROM crm_proposals p JOIN crm_deals d ON d.id = p.deal_id JOIN crm_contacts c ON c.id = p.contact_id WHERE p.id = $1 FOR UPDATE OF p`,
      [proposalId],
    );
    const p = rows[0];
    const owner = p ? (p.deal_owner ?? p.contact_owner) : null;
    if (!p || !canSee(s, owner)) throw new CrmNotFoundError("Proposta não encontrada.");
    if (!canAct(s, owner)) throw new CrmForbiddenError("Esta proposta é de outra pessoa: só o responsável (ou um Gestor) formaliza.");
    if (p.status !== "aprovada" || p.sent_version === null) throw new CrmInputError("Só uma proposta aprovada é formalizada.");
    if (p.contract_id) throw new CrmInputError("Esta proposta já virou contrato.");
    const v = (
      await q.query<{ content: ProposalContent }>(`SELECT content FROM crm_proposal_versions WHERE proposal_id = $1 AND version = $2`, [p.id, p.sent_version])
    ).rows[0];
    const c = v.content;
    const a = (
      await q.query<{ name: string; created_at: Date }>(
        `SELECT name, created_at FROM crm_proposal_approvals WHERE proposal_id = $1 AND decision = 'aprovada' ORDER BY created_at DESC LIMIT 1`,
        [p.id],
      )
    ).rows[0];
    const serviceIds = [...new Set(c.items.map((i) => i.serviceId).filter((x): x is string => !!x))];
    const startsOn = parseDateOnly(input.startsOn, "Data de início") ?? todayBr();
    const termMonths = intIn(input.termMonths, 1, 120, "Prazo de vigência (meses)");
    const dueDay = intIn(input.dueDay, 1, 31, "Dia de vencimento");
    if (input.renewal !== undefined && input.renewal !== null && input.renewal !== "" && !isContractRenewal(input.renewal))
      throw new CrmInputError("Renovação inválida.");

    // 1. The sale.
    if (p.deal_stage !== "ganho") {
      if (p.deal_stage === "perdido") throw new CrmInputError("A oportunidade está encerrada como perdida: reabra-a antes.");
      await updateDealTx(
        q as PoolClient,
        p.deal_id,
        {
          stage: "ganho",
          ...(p.deal_service ? {} : serviceIds[0] ? { service: serviceIds[0] } : {}),
          negotiatedValue: (c.totals.totalCents / 100).toFixed(2),
          wonReason: input.wonReason,
          wonResult: "proposta_aprovada",
          wonNote: `Proposta nº ${proposalNumber(p.number)} aprovada${a ? ` por ${a.name} em ${brDateTime(a.created_at)}` : ""}.`,
        },
        s,
      );
    }
    // 2. The client and its contract.
    const cr = await createClientTx(q, s, { dealId: p.deal_id });
    const k = (await q.query<{ id: string }>(`SELECT id FROM crm_contracts WHERE deal_id = $1`, [p.deal_id])).rows[0];
    if (!k) throw new CrmInputError("Não foi possível criar o contrato desta venda.");
    const monthly = c.totals.monthlyCents;
    const oneTime = c.totals.oneTimeCents;
    const ops = await requireActiveUser(q, typeof input.opsOwnerId === "string" && input.opsOwnerId ? input.opsOwnerId : null);
    await q.query(
      `UPDATE crm_contracts SET services = CASE WHEN cardinality($2::text[]) > 0 THEN $2 ELSE services END, value_cents = $3, billing = $4, one_time_cents = $5,
              proposal_id = $6, payment_terms = $7, due_day = $8, term_months = $9, starts_on = $10, ends_on = $11, renewal = $12, cancellation_rules = $13,
              sales_owner_id = $14, ops_owner_id = $15, updated_at = now()
       WHERE id = $1`,
      [
        k.id,
        serviceIds,
        monthly > 0 ? monthly : oneTime,
        monthly > 0 ? "mensal" : "unico",
        monthly > 0 && oneTime > 0 ? oneTime : null,
        p.id,
        c.paymentTerms,
        dueDay,
        termMonths,
        startsOn,
        termMonths ? termEnd(startsOn, termMonths) : null,
        (input.renewal as string) || null,
        cleanText(input.cancellationRules, 4000),
        owner,
        ops?.id ?? null,
      ],
    );
    // 3. Operations start: a new client got the onboarding checklist; its items go to the operations owner.
    if (cr.created && ops) await q.query(`UPDATE crm_client_onboarding SET owner_id = $2 WHERE client_id = $1`, [cr.id, ops.id]);
    const number = (await q.query<{ number: number }>(`SELECT number FROM crm_contracts WHERE id = $1`, [k.id])).rows[0].number;
    await addClientEvent(q, cr.id, "contract_details", { action: "formalized", contractNumber: number, proposalNumber: p.number }, s);
    await q.query(
      `INSERT INTO crm_proposal_events (id, proposal_id, kind, version, payload, actor_id, actor_name) VALUES ($1, $2, 'formalized', $3, $4, $5, $6)`,
      [randomUUID(), p.id, p.sent_version, JSON.stringify({ clientId: cr.id, contractId: k.id, contractNumber: number }), s.userId, s.userName],
    );
    await addEvent(q as PoolClient, p.contact_id, "proposal", { action: "formalized", proposalId: p.id, number: p.number, contractNumber: number }, s);
    return { clientId: cr.id, contractId: k.id, created: cr.created, companyName: cr.companyName, proposalNumber: p.number, contractNumber: number };
  });
  await writeAudit({
    actorUserId: s.userId,
    actorLabel: s.userName,
    actorKind: "admin",
    action: "crm.contract_change",
    targetType: "crm_client",
    targetId: result.clientId,
    targetLabel: result.companyName,
    metadata: {
      contractId: result.contractId,
      action: "formalizado",
      proposal: proposalNumber(result.proposalNumber),
      contract: proposalNumber(result.contractNumber),
      newClient: result.created,
    },
  });
  return { clientId: result.clientId, contractId: result.contractId };
}
