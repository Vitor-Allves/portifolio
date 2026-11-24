// Server-only. Relatórios (evolução v1.0, item 14): every report of the
// Relatórios section besides the Tabulação comercial (crm-reports.ts), on
// screen, as planilha and as PDF, from the same numbers the rest of the CRM
// uses (the Painel's definitions, the Financeiro, the productivity).
//
// Who sees what — the same rules as everywhere else:
// - without "ver a produtividade da equipe" (Comercial): only their own
//   (their opportunities, proposals, clients, commissions);
// - clients need "ver clientes ativos"; values of contracts need "ver os
//   valores dos contratos" (without it: no values, and Receita recorrente and
//   Comissões are refused); campaigns need "editar campanhas";
// - archived contacts are left out, as on the Painel.

import { getDb } from "./db";
import { CrmForbiddenError, CrmInputError } from "./crm-core";
import { requireCap, type CrmSession } from "./crm-access";
import { isDay, ownerMetrics, shiftDay } from "./crm-dashboard";
import { getFinance } from "./crm-finance";
import { getProductivity } from "./crm-goals";
import { getCatalog, listStages } from "./crm-options";
import { listTeam } from "./crm";
import { listCampaigns } from "./crm-campaigns";
import { closeGroupLabel } from "./crm-catalog";
import { proposalStatusLabel } from "./crm-proposal-types";
import { CONTRACT_RENEWALS } from "./crm-operation-types";
import { clientStatusLabel, type CrmAdReferral } from "./crm-types";
import {
  REPORT_ROWS_LIMIT,
  crmReportDef,
  type CrmReportCell,
  type CrmReportColumn,
  type CrmReportId,
  type CrmReportResult,
  type CrmReportRow,
} from "./crm-report-catalog-types";

const TZ = "America/Sao_Paulo";
const startOf = (day: string) => new Date(`${day}T00:00:00-03:00`);
const n = (v: unknown) => Number(v ?? 0);
const todayBr = () => new Date().toLocaleDateString("en-CA", { timeZone: TZ });
const brDay = (d: string) => d.split("-").reverse().join("/");
const dayOf = (v: Date | string | null): string | null =>
  v === null ? null : typeof v === "string" ? v.slice(0, 10) : v.toLocaleDateString("en-CA", { timeZone: TZ });
const col = (label: string, kind: CrmReportColumn["kind"] = "text"): CrmReportColumn => ({ label, kind });

export type ReportQuery = { from: string | null; to: string | null; ownerId: string | null; source: string | null; days: number };

/** ?from&to (up to a year, for reports with a period) &owner &source &days. A Comercial only gets their own. */
export function reportParams(s: CrmSession, id: CrmReportId, p: { get: (k: string) => string | null }): ReportQuery {
  const def = crmReportDef(id);
  let from: string | null = null;
  let to: string | null = null;
  if (def.period) {
    from = p.get("from");
    to = p.get("to");
    if (!isDay(from) || !isDay(to) || from > to) throw new CrmInputError("Período inválido.");
    if ((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000 > 366) throw new CrmInputError("Escolha um período de até um ano.");
  }
  const asked = p.get("owner");
  const ownerId = !s.caps.seeTeamProductivity ? s.userId : asked && asked !== "all" ? asked.slice(0, 100) : null;
  const source = def.source && p.get("source") && p.get("source") !== "all" ? p.get("source")!.slice(0, 100) : null;
  const d = Number(p.get("days") ?? 60);
  const days = Number.isInteger(d) && d >= 1 && d <= 365 ? d : 60;
  return { from, to, ownerId, source, days };
}

type Labels = { option: (kind: string, id: string | null) => string; person: (id: string | null) => string };
async function labels(): Promise<Labels> {
  const [catalog, team] = await Promise.all([getCatalog(), listTeam()]);
  return {
    option: (kind, id) => (id ? (catalog.options.find((o) => o.kind === kind && o.id === id)?.label ?? id) : ""),
    person: (id) => (id ? (team.find((m) => m.id === id)?.name ?? "Pessoa removida") : "Sem responsável"),
  };
}

function base(
  id: CrmReportId,
  q: ReportQuery,
  L: Labels,
  extra: string[] = [],
): Pick<CrmReportResult, "id" | "title" | "from" | "to" | "filters" | "truncated"> {
  const def = crmReportDef(id);
  const filters = [
    q.ownerId ? `Vendedor: ${L.person(q.ownerId)}` : "Toda a equipe",
    q.source ? `Origem: ${L.option("source", q.source)}` : "",
    ...extra,
  ].filter(Boolean);
  return { id, title: def.label, from: q.from, to: q.to, filters, truncated: false };
}

/** Builds a report for this person, with the rules above. */
export async function runReport(s: CrmSession, id: CrmReportId, q: ReportQuery): Promise<CrmReportResult> {
  const db = await getDb();
  const L = await labels();
  const values: unknown[] = [];
  const p = (v: unknown) => (values.push(v), `$${values.length}`);
  const s0 = q.from ? startOf(q.from) : null;
  const e0 = q.to ? startOf(shiftDay(q.to, 1)) : null;
  const seeValues = s.caps.viewClients && s.caps.seeContractValues;
  const limited = <T>(rows: T[]) => ({ rows: rows.slice(0, REPORT_ROWS_LIMIT), truncated: rows.length > REPORT_ROWS_LIMIT });

  switch (id) {
    case "funil": {
      const stages = await listStages(db);
      const { rows } = await db.query<{ stage: string; count: string; value: string; weighted: string }>(
        `SELECT d.stage, count(*) AS count,
                COALESCE(sum(CASE WHEN d.stage = 'ganho' THEN COALESCE(d.negotiated_cents, d.value_cents) ELSE d.value_cents END), 0) AS value,
                COALESCE(sum(d.value_cents * COALESCE(d.probability, (o.meta->>'probability')::int, 0) / 100.0), 0) AS weighted
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id LEFT JOIN crm_options o ON o.kind = 'stage' AND o.id = d.stage
         WHERE c.archived_at IS NULL
           AND (d.stage NOT IN ('ganho', 'perdido') OR (d.closed_at >= ${p(s0)} AND d.closed_at < ${p(e0)}
                AND NOT (d.stage = 'perdido' AND COALESCE(d.close_group, 'negativo') = 'futuro')))
           ${q.ownerId ? `AND d.owner_id = ${p(q.ownerId)}` : ""}${q.source ? ` AND COALESCE(d.source, c.source) = ${p(q.source)}` : ""}
         GROUP BY d.stage`,
        values,
      );
      const by = new Map(rows.map((r) => [r.stage, r]));
      const list = stages.filter((st) => !st.archived || by.has(st.id));
      const open = list.filter((st) => st.outcome === "open");
      const sum = (ids: string[], k: "count" | "value" | "weighted") => ids.reduce((a, i) => a + n(by.get(i)?.[k]), 0);
      return {
        ...base(id, q, L),
        summary: [
          {
            label: "Abertas agora",
            kind: "int",
            value: sum(
              open.map((x) => x.id),
              "count",
            ),
          },
          {
            label: "Valor em aberto",
            kind: "money",
            value: sum(
              open.map((x) => x.id),
              "value",
            ),
          },
          {
            label: "Previsto (ponderado)",
            kind: "money",
            value: Math.round(
              sum(
                open.map((x) => x.id),
                "weighted",
              ),
            ),
          },
          { label: "Ganhas no período", kind: "int", value: n(by.get("ganho")?.count) },
          { label: "Perdidas no período", kind: "int", value: n(by.get("perdido")?.count) },
        ],
        columns: [col("Etapa"), col("Probabilidade", "pct"), col("Oportunidades", "int"), col("Valor", "money"), col("Valor ponderado", "money")],
        rows: list.map((st) => ({
          cells: [
            st.outcome === "open" ? st.label : `${st.label} (no período)`,
            st.probability / 100,
            n(by.get(st.id)?.count),
            n(by.get(st.id)?.value),
            st.outcome === "open" ? Math.round(n(by.get(st.id)?.weighted)) : null,
          ],
        })),
        totals: null,
        note: "Abertas: a situação de agora (o período não se aplica). Ganhas e perdidas: encerradas no período; oportunidade futura não conta como perda. Valor ponderado = valor × probabilidade (a da oportunidade, senão a da etapa).",
      };
    }

    case "vendas": {
      const { rows } = await db.query<{
        id: string;
        contact_id: string;
        title: string;
        contact: string;
        company: string | null;
        owner_id: string | null;
        source: string | null;
        service: string | null;
        value: string | null;
        closed_at: Date;
      }>(
        `SELECT d.id, d.contact_id, d.title, c.name AS contact, co.name AS company, d.owner_id, COALESCE(d.source, c.source) AS source,
                COALESCE(d.service, c.service_interest) AS service, COALESCE(d.negotiated_cents, d.value_cents) AS value, d.closed_at
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id LEFT JOIN crm_companies co ON co.id = c.company_id
         WHERE c.archived_at IS NULL AND d.stage = 'ganho' AND d.closed_at >= ${p(s0)} AND d.closed_at < ${p(e0)}
           ${q.ownerId ? `AND d.owner_id = ${p(q.ownerId)}` : ""}${q.source ? ` AND COALESCE(d.source, c.source) = ${p(q.source)}` : ""}
         ORDER BY d.closed_at DESC, d.id`,
        values,
      );
      const total = rows.reduce((a, r) => a + n(r.value), 0);
      const valued = rows.filter((r) => r.value !== null).length;
      const out = limited(rows);
      return {
        ...base(id, q, L),
        truncated: out.truncated,
        summary: [
          { label: "Vendas", kind: "int", value: rows.length },
          { label: "Valor vendido", kind: "money", value: total },
          { label: "Ticket médio", kind: "money", value: valued ? Math.round(total / valued) : null },
        ],
        columns: [col("Data", "date"), col("Oportunidade"), col("Lead · empresa"), col("Vendedor"), col("Origem"), col("Serviço"), col("Valor", "money")],
        rows: out.rows.map((r) => ({
          contactId: r.contact_id,
          cells: [
            dayOf(r.closed_at),
            r.title,
            [r.contact, r.company].filter(Boolean).join(" · "),
            L.person(r.owner_id),
            L.option("source", r.source),
            L.option("service", r.service),
            r.value === null ? null : n(r.value),
          ],
        })),
        totals: ["Total", null, null, null, null, null, total],
        note: "Valor = o negociado na oportunidade ganha (senão o estimado). Origem e serviço: os da oportunidade (senão os do lead).",
      };
    }

    case "vendedores": {
      const [by, team] = await Promise.all([ownerMetrics(q.from!, q.to!, q.ownerId), listTeam()]);
      const people: { id: string | null; name: string }[] = team.filter((m) => !q.ownerId || m.id === q.ownerId).map((m) => ({ id: m.id, name: m.name }));
      if (!q.ownerId && by.has(null)) people.push({ id: null, name: "Sem responsável" });
      const line = (id: string | null) => by.get(id);
      const rows: CrmReportRow[] = people.map((m) => {
        const x = line(m.id);
        const won = x?.wonCount ?? 0;
        const lost = x?.lostCount ?? 0;
        return {
          cells: [
            m.name,
            won,
            x?.wonValueCents ?? 0,
            won ? Math.round((x?.wonValueCents ?? 0) / won) : null,
            lost,
            won + lost ? won / (won + lost) : null,
            x?.proposals ?? 0,
            x?.proposalsApproved ?? 0,
          ],
        };
      });
      const t = [...by.entries()].filter(([k]) => !q.ownerId || k === q.ownerId).map(([, v]) => v);
      const won = t.reduce((a, x) => a + x.wonCount, 0);
      const value = t.reduce((a, x) => a + x.wonValueCents, 0);
      const lost = t.reduce((a, x) => a + x.lostCount, 0);
      return {
        ...base(id, q, L),
        summary: [
          { label: "Vendas", kind: "int", value: won },
          { label: "Valor vendido", kind: "money", value },
          { label: "Conversão", kind: "pct", value: won + lost ? won / (won + lost) : null },
        ],
        columns: [
          col("Vendedor"),
          col("Ganhos", "int"),
          col("Valor vendido", "money"),
          col("Ticket médio", "money"),
          col("Perdidos", "int"),
          col("Conversão", "pct"),
          col("Propostas", "int"),
          col("Aprovadas", "int"),
        ],
        rows,
        totals: [
          "Total",
          won,
          value,
          won ? Math.round(value / won) : null,
          lost,
          won + lost ? won / (won + lost) : null,
          t.reduce((a, x) => a + x.proposals, 0),
          t.reduce((a, x) => a + x.proposalsApproved, 0),
        ],
        note: "Os mesmos números do Painel, por responsável da oportunidade. Conversão = ganhos ÷ (ganhos + perdidos). Propostas = oportunidades que chegaram a Proposta enviada; aprovadas = propostas aprovadas no período.",
      };
    }

    case "propostas":
    case "propostas_expiradas": {
      const expired = id === "propostas_expiradas";
      // Only the bounds the query uses become parameters (an unused one has no type).
      const ps = expired ? "" : p(s0);
      const pe = expired ? "" : p(e0);
      const { rows } = await db.query<{
        number: number;
        title: string;
        status: string;
        contact_id: string;
        contact: string;
        owner_id: string | null;
        first_sent: Date | null;
        decided_at: Date | null;
        valid_until: string;
        total: string;
      }>(
        `SELECT * FROM (
           SELECT p.number, p.title, p.status, p.contact_id, c.name AS contact, COALESCE(d.owner_id, c.owner_id) AS owner_id,
                  (SELECT min(v.sent_at) FROM crm_proposal_versions v WHERE v.proposal_id = p.id) AS first_sent,
                  p.decided_at, p.valid_until::text AS valid_until, p.total_cents AS total
           FROM crm_proposals p JOIN crm_deals d ON d.id = p.deal_id JOIN crm_contacts c ON c.id = p.contact_id
           WHERE c.archived_at IS NULL${q.ownerId ? ` AND COALESCE(d.owner_id, c.owner_id) = ${p(q.ownerId)}` : ""}
         ) x
         WHERE ${
           expired
             ? `x.status = 'expirada' AND x.valid_until >= ${p(q.from)} AND x.valid_until <= ${p(q.to)}`
             : `(x.first_sent >= ${ps} AND x.first_sent < ${pe}) OR (x.status IN ('aprovada', 'recusada') AND x.decided_at >= ${ps} AND x.decided_at < ${pe})`
         }
         ORDER BY ${expired ? "x.valid_until DESC" : "COALESCE(x.decided_at, x.first_sent) DESC"}, x.number DESC`,
        values,
      );
      const out = limited(rows);
      const inPeriod = (d: Date | null) => d !== null && d >= s0! && d < e0!;
      if (expired) {
        const total = rows.reduce((a, r) => a + n(r.total), 0);
        return {
          ...base(id, q, L),
          truncated: out.truncated,
          summary: [
            { label: "Expiradas", kind: "int", value: rows.length },
            { label: "Valor", kind: "money", value: total },
          ],
          columns: [col("Nº"), col("Proposta"), col("Lead"), col("Vendedor"), col("Enviada em", "date"), col("Validade", "date"), col("Total", "money")],
          linkColumn: 1,
          rows: out.rows.map((r) => ({
            contactId: r.contact_id,
            cells: [String(r.number).padStart(4, "0"), r.title, r.contact, L.person(r.owner_id), dayOf(r.first_sent), r.valid_until, n(r.total)],
          })),
          totals: ["Total", null, null, null, null, null, total],
          note: "Propostas enviadas que passaram da validade sem aprovação nem recusa (a expiração é automática), pela data de validade.",
        };
      }
      const sent = rows.filter((r) => inPeriod(r.first_sent)).length;
      const approved = rows.filter((r) => r.status === "aprovada" && inPeriod(r.decided_at));
      const refused = rows.filter((r) => r.status === "recusada" && inPeriod(r.decided_at)).length;
      return {
        ...base(id, q, L),
        truncated: out.truncated,
        summary: [
          { label: "Enviadas", kind: "int", value: sent },
          { label: "Aprovadas", kind: "int", value: approved.length },
          { label: "Recusadas", kind: "int", value: refused },
          { label: "Taxa de aprovação", kind: "pct", value: approved.length + refused ? approved.length / (approved.length + refused) : null },
          { label: "Valor aprovado", kind: "money", value: approved.reduce((a, r) => a + n(r.total), 0) },
        ],
        columns: [
          col("Nº"),
          col("Proposta"),
          col("Lead"),
          col("Vendedor"),
          col("Situação"),
          col("Enviada em", "date"),
          col("Decidida em", "date"),
          col("Total", "money"),
        ],
        linkColumn: 1,
        rows: out.rows.map((r) => ({
          contactId: r.contact_id,
          cells: [
            String(r.number).padStart(4, "0"),
            r.title,
            r.contact,
            L.person(r.owner_id),
            proposalStatusLabel(r.status),
            dayOf(r.first_sent),
            dayOf(r.decided_at),
            n(r.total),
          ],
        })),
        totals: null,
        note: "Enviadas = primeiro envio no período; aprovadas e recusadas = decididas no período (pelo cliente no link ou registradas pela equipe). Taxa de aprovação = aprovadas ÷ (aprovadas + recusadas).",
      };
    }

    case "perdas": {
      const { rows } = await db.query<{ reason: string | null; grp: string; count: string; value: string }>(
        `SELECT d.lost_reason AS reason, COALESCE(d.close_group, 'negativo') AS grp, count(*) AS count, COALESCE(sum(d.value_cents), 0) AS value
         FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id
         WHERE c.archived_at IS NULL AND d.stage = 'perdido' AND COALESCE(d.close_group, 'negativo') <> 'futuro'
           AND d.closed_at >= ${p(s0)} AND d.closed_at < ${p(e0)}
           ${q.ownerId ? `AND d.owner_id = ${p(q.ownerId)}` : ""}${q.source ? ` AND COALESCE(d.source, c.source) = ${p(q.source)}` : ""}
         GROUP BY 1, 2 ORDER BY count(*) DESC, 1`,
        values,
      );
      const total = rows.reduce((a, r) => a + n(r.count), 0);
      const value = rows.reduce((a, r) => a + n(r.value), 0);
      return {
        ...base(id, q, L),
        summary: [
          { label: "Perdas", kind: "int", value: total },
          { label: "Valor perdido", kind: "money", value },
        ],
        columns: [col("Motivo"), col("Grupo"), col("Perdas", "int"), col("Valor", "money"), col("Das perdas", "pct")],
        rows: rows.map((r) => ({
          cells: [
            r.reason ? L.option("lost_reason", r.reason) : "Sem motivo informado",
            closeGroupLabel(r.grp),
            n(r.count),
            n(r.value),
            total ? n(r.count) / total : null,
          ],
        })),
        totals: ["Total", null, total, value, total ? 1 : null],
        note: "Oportunidades encerradas no período como perda comercial ou sem conversão, pelo motivo registrado na tabulação. Oportunidade futura não é perda. O detalhe por oportunidade está na Tabulação comercial.",
      };
    }

    case "produtividade": {
      const d = await getProductivity(s, q.from!, q.to!);
      const lines = d.rows.filter((r) => !q.ownerId || r.userId === q.ownerId);
      const cells = (r: (typeof lines)[number] | NonNullable<typeof d.team>, name: string): CrmReportCell[] => [
        name,
        r.leads,
        r.worked,
        r.assigned,
        r.meetings,
        r.followUps,
        r.proposals,
        r.proposalsApproved,
        r.wonCount,
        r.lostCount,
        r.wonValueCents,
        r.conversion,
        r.tasksDone,
        r.tasksOverdue,
      ];
      return {
        ...base(id, q, L),
        summary:
          d.team && !q.ownerId
            ? [
                { label: "Leads trabalhados", kind: "int", value: d.team.worked },
                { label: "Vendas", kind: "int", value: d.team.wonCount },
                { label: "Tarefas concluídas", kind: "int", value: d.team.tasksDone },
              ]
            : [],
        columns: [
          col("Pessoa"),
          col("Leads", "int"),
          col("Trabalhados", "int"),
          col("Atribuídos", "int"),
          col("Reuniões", "int"),
          col("Follow-ups", "int"),
          col("Propostas", "int"),
          col("Aprovadas", "int"),
          col("Ganhos", "int"),
          col("Perdidos", "int"),
          col("Valor vendido", "money"),
          col("Conversão", "pct"),
          col("Tarefas feitas", "int"),
          col("Atrasadas", "int"),
        ],
        rows: lines.map((r) => ({ cells: cells(r, r.name) })),
        totals: d.team && !q.ownerId ? cells(d.team, "Equipe") : null,
        note: "Os números da tela Metas e produtividade: leads, oportunidades e tarefas contam para o responsável. Atribuídos e atrasadas: agora.",
      };
    }

    case "clientes":
    case "receita":
    case "contratos_vencimento": {
      requireCap(s, "viewClients");
      if (id === "receita" && !seeValues) throw new CrmForbiddenError("Seu perfil não vê os valores dos contratos.");
      const owner = q.ownerId ? ` AND cl.owner_id = ${p(q.ownerId)}` : "";
      if (id === "contratos_vencimento") {
        const today = todayBr();
        const { rows } = await db.query<{
          number: number | null;
          client_id: string;
          company: string;
          owner_id: string | null;
          ends_on: string;
          renewal: string | null;
          billing: string;
          value: string | null;
        }>(
          `SELECT k.number, cl.id AS client_id, co.name AS company, cl.owner_id, k.ends_on::text AS ends_on, k.renewal, k.billing, k.value_cents AS value
           FROM crm_contracts k JOIN crm_clients cl ON cl.id = k.client_id JOIN crm_companies co ON co.id = cl.company_id
           WHERE k.status = 'vigente' AND k.ends_on IS NOT NULL AND k.ends_on <= ${p(shiftDay(today, q.days))}::date${owner}
           ORDER BY k.ends_on, co.name`,
          values,
        );
        const daysTo = (d: string) => Math.round((Date.parse(`${d}T12:00:00Z`) - Date.parse(`${today}T12:00:00Z`)) / 86_400_000);
        const monthly = rows.filter((r) => r.billing === "mensal").reduce((a, r) => a + n(r.value), 0);
        return {
          ...base(id, q, L, [`Vencem em até ${q.days} dias (e os já vencidos ainda vigentes)`]),
          summary: [
            { label: "Contratos", kind: "int", value: rows.length },
            { label: "Já passaram da data", kind: "int", value: rows.filter((r) => r.ends_on < today).length },
            ...(seeValues ? [{ label: "Receita mensal em jogo", kind: "money" as const, value: monthly }] : []),
          ],
          columns: [
            col("Contrato"),
            col("Cliente"),
            col("Responsável"),
            col("Fim", "date"),
            col("Dias", "days"),
            col("Renovação"),
            col("Cobrança"),
            col("Valor", "money"),
          ],
          linkColumn: 1,
          rows: rows.map((r) => ({
            clientId: r.client_id,
            cells: [
              r.number ? `nº ${String(r.number).padStart(4, "0")}` : "—",
              r.company,
              L.person(r.owner_id),
              r.ends_on,
              daysTo(r.ends_on),
              CONTRACT_RENEWALS.find((x) => x.id === r.renewal)?.label ?? "Não informada",
              r.billing === "unico" ? "Valor único" : "Mensal",
              seeValues && r.value !== null ? n(r.value) : null,
            ],
          })),
          totals: null,
          note: `Contratos vigentes com fim até ${brDay(shiftDay(today, q.days))}. Dias negativos: a data já passou e o contrato continua vigente (renovar ou encerrar).${seeValues ? "" : " Valores ocultos para o seu perfil."}`,
        };
      }
      const { rows } = await db.query<{
        id: string;
        company: string;
        status: string;
        owner_id: string | null;
        started_on: string | null;
        contracts: string;
        monthly: string;
      }>(
        `SELECT cl.id, co.name AS company, cl.status, cl.owner_id, cl.started_on::text AS started_on,
                count(k.id) FILTER (WHERE k.status = 'vigente') AS contracts,
                COALESCE(sum(k.value_cents) FILTER (WHERE k.status = 'vigente' AND k.billing = 'mensal'), 0) AS monthly
         FROM crm_clients cl JOIN crm_companies co ON co.id = cl.company_id LEFT JOIN crm_contracts k ON k.client_id = cl.id
         WHERE cl.status <> 'encerrado'${owner}
         GROUP BY cl.id, co.name, cl.status, cl.owner_id, cl.started_on
         ${id === "receita" ? "HAVING COALESCE(sum(k.value_cents) FILTER (WHERE k.status = 'vigente' AND k.billing = 'mensal'), 0) > 0" : ""}
         ORDER BY ${id === "receita" ? "monthly DESC," : ""} lower(co.name)`,
        values,
      );
      const mrr = rows.reduce((a, r) => a + n(r.monthly), 0);
      if (id === "receita") {
        return {
          ...base(id, q, L),
          summary: [
            { label: "Clientes", kind: "int", value: rows.length },
            { label: "Receita mensal", kind: "money", value: mrr },
            { label: "Média por cliente", kind: "money", value: rows.length ? Math.round(mrr / rows.length) : null },
          ],
          columns: [col("Cliente"), col("Responsável"), col("Contratos vigentes", "int"), col("Receita mensal", "money"), col("Da receita", "pct")],
          rows: rows.map((r) => ({ clientId: r.id, cells: [r.company, L.person(r.owner_id), n(r.contracts), n(r.monthly), mrr ? n(r.monthly) / mrr : null] })),
          totals: ["Total", null, rows.reduce((a, r) => a + n(r.contracts), 0), mrr, mrr ? 1 : null],
          note: "Soma mensal dos contratos mensais vigentes hoje. É gerencial: o CRM não emite cobrança nem confere pagamento.",
        };
      }
      return {
        ...base(id, q, L),
        summary: [
          { label: "Clientes", kind: "int", value: rows.length },
          { label: "Em onboarding", kind: "int", value: rows.filter((r) => r.status === "onboarding").length },
          ...(seeValues ? [{ label: "Receita mensal", kind: "money" as const, value: mrr }] : []),
        ],
        columns: [
          col("Cliente"),
          col("Situação"),
          col("Responsável"),
          col("Cliente desde", "date"),
          col("Contratos vigentes", "int"),
          col("Receita mensal", "money"),
        ],
        rows: rows.map((r) => ({
          clientId: r.id,
          cells: [r.company, clientStatusLabel(r.status), L.person(r.owner_id), r.started_on, n(r.contracts), seeValues ? n(r.monthly) : null],
        })),
        totals: null,
        note: `Clientes em onboarding, ativos ou pausados hoje.${seeValues ? " Receita mensal = contratos mensais vigentes." : " Valores ocultos para o seu perfil."}`,
      };
    }

    case "comissoes": {
      if (!seeValues) throw new CrmForbiddenError("Seu perfil não vê os valores dos contratos.");
      const f = await getFinance(s, { from: q.from!, to: q.to!, ownerId: q.ownerId });
      const c = f.commissions;
      return {
        ...base(id, q, L),
        summary: [
          { label: "Contratos", kind: "int", value: c.rows.length },
          { label: "Comissões", kind: "money", value: c.totalCents },
        ],
        columns: [
          col("Contrato"),
          col("Cliente"),
          col("Vendedor"),
          col("Vendido em", "date"),
          col("Mensal", "money"),
          col("Único", "money"),
          col("Regra (mensal)"),
          col("Regra (único)"),
          col("Comissão", "money"),
        ],
        linkColumn: 1,
        rows: c.rows.map((r) => ({
          clientId: r.clientId,
          cells: [
            `nº ${String(r.contractNumber).padStart(4, "0")}`,
            r.clientName,
            r.sellerName ?? "Sem vendedor",
            r.soldOn,
            r.monthlyCents,
            r.oneTimeCents,
            r.monthlyRule ?? "—",
            r.oneTimeRule ?? "—",
            r.commissionCents,
          ],
        })),
        totals: [
          "Total",
          null,
          null,
          null,
          c.rows.reduce((a, r) => a + r.monthlyCents, 0),
          c.rows.reduce((a, r) => a + r.oneTimeCents, 0),
          null,
          null,
          c.totalCents,
        ],
        note: "As regras do Financeiro (a mais específica vale). Contrato cancelado não gera comissão. É gerencial: o CRM calcula, não paga.",
      };
    }

    case "origens": {
      const ps = p(s0);
      const pe = p(e0);
      const own = (col: string) => (q.ownerId ? ` AND ${col} = ${p(q.ownerId)}` : "");
      const { rows } = await db.query<{ source: string | null; leads: string; deals: string; sent: string; approved: string; won: string; value: string }>(
        `WITH l AS (
           SELECT c.source, count(*) AS n FROM crm_contacts c WHERE c.archived_at IS NULL AND c.created_at >= ${ps} AND c.created_at < ${pe}${own("c.owner_id")} GROUP BY 1
         ), d AS (
           SELECT COALESCE(d.source, c.source) AS source,
                  count(*) FILTER (WHERE d.created_at >= ${ps} AND d.created_at < ${pe}) AS deals,
                  count(*) FILTER (WHERE d.stage = 'ganho' AND d.closed_at >= ${ps} AND d.closed_at < ${pe}) AS won,
                  COALESCE(sum(COALESCE(d.negotiated_cents, d.value_cents)) FILTER (WHERE d.stage = 'ganho' AND d.closed_at >= ${ps} AND d.closed_at < ${pe}), 0) AS value
           FROM crm_deals d JOIN crm_contacts c ON c.id = d.contact_id WHERE c.archived_at IS NULL${own("d.owner_id")} GROUP BY 1
         ), pr AS (
           SELECT COALESCE(d.source, c.source) AS source,
                  count(*) FILTER (WHERE (SELECT min(v.sent_at) FROM crm_proposal_versions v WHERE v.proposal_id = p.id) >= ${ps}
                                     AND (SELECT min(v.sent_at) FROM crm_proposal_versions v WHERE v.proposal_id = p.id) < ${pe}) AS sent,
                  count(*) FILTER (WHERE p.status = 'aprovada' AND p.decided_at >= ${ps} AND p.decided_at < ${pe}) AS approved
           FROM crm_proposals p JOIN crm_deals d ON d.id = p.deal_id JOIN crm_contacts c ON c.id = p.contact_id
           WHERE c.archived_at IS NULL${own("d.owner_id")} GROUP BY 1
         )
         SELECT s.source, COALESCE(l.n, 0) AS leads, COALESCE(d.deals, 0) AS deals, COALESCE(pr.sent, 0) AS sent, COALESCE(pr.approved, 0) AS approved,
                COALESCE(d.won, 0) AS won, COALESCE(d.value, 0) AS value
         FROM (SELECT source FROM l UNION SELECT source FROM d UNION SELECT source FROM pr) s
         LEFT JOIN l ON l.source IS NOT DISTINCT FROM s.source LEFT JOIN d ON d.source IS NOT DISTINCT FROM s.source LEFT JOIN pr ON pr.source IS NOT DISTINCT FROM s.source`,
        values,
      );
      const live = rows
        .filter((r) => n(r.leads) + n(r.deals) + n(r.sent) + n(r.approved) + n(r.won) > 0)
        .sort((a, b) => n(b.value) - n(a.value) || n(b.leads) - n(a.leads));
      const sum = (k: "leads" | "deals" | "sent" | "approved" | "won" | "value") => live.reduce((a, r) => a + n(r[k]), 0);
      return {
        ...base(id, q, L),
        summary: [
          { label: "Leads", kind: "int", value: sum("leads") },
          { label: "Vendas", kind: "int", value: sum("won") },
          { label: "Valor vendido", kind: "money", value: sum("value") },
        ],
        columns: [
          col("Origem"),
          col("Leads", "int"),
          col("Oportunidades", "int"),
          col("Propostas enviadas", "int"),
          col("Aprovadas", "int"),
          col("Vendas", "int"),
          col("Valor vendido", "money"),
          col("Vendas por lead", "pct"),
        ],
        rows: live.map((r) => ({
          cells: [
            r.source ? L.option("source", r.source) : "Não informada",
            n(r.leads),
            n(r.deals),
            n(r.sent),
            n(r.approved),
            n(r.won),
            n(r.value),
            n(r.leads) ? n(r.won) / n(r.leads) : null,
          ],
        })),
        totals: ["Total", sum("leads"), sum("deals"), sum("sent"), sum("approved"), sum("won"), sum("value"), sum("leads") ? sum("won") / sum("leads") : null],
        note: "Tudo no período: leads cadastrados (origem do lead); oportunidades abertas, propostas e vendas pela origem da oportunidade (senão a do lead). Vendas por lead compara as vendas do período com os leads do período.",
      };
    }

    case "anuncios": {
      const { rows } = await db.query<{ ref: CrmAdReferral; leads: string; deals: string; won: string; value: string }>(
        `SELECT (array_agg(c.ad_referral ORDER BY c.created_at DESC))[1] AS ref, count(DISTINCT c.id) AS leads,
                count(d.id) AS deals, count(d.id) FILTER (WHERE d.stage = 'ganho') AS won,
                COALESCE(sum(COALESCE(d.negotiated_cents, d.value_cents)) FILTER (WHERE d.stage = 'ganho'), 0) AS value
         FROM crm_contacts c LEFT JOIN crm_deals d ON d.contact_id = c.id
         WHERE c.archived_at IS NULL AND c.ad_referral IS NOT NULL AND c.created_at >= ${p(s0)} AND c.created_at < ${p(e0)}${q.ownerId ? ` AND c.owner_id = ${p(q.ownerId)}` : ""}
         GROUP BY COALESCE(c.ad_referral->>'sourceId', c.ad_referral->>'headline', 'sem-id')
         ORDER BY count(DISTINCT c.id) DESC`,
        values,
      );
      const sum = (k: "leads" | "deals" | "won" | "value") => rows.reduce((a, r) => a + n(r[k]), 0);
      return {
        ...base(id, q, L),
        summary: [
          { label: "Leads por anúncio", kind: "int", value: sum("leads") },
          { label: "Vendas", kind: "int", value: sum("won") },
          { label: "Valor vendido", kind: "money", value: sum("value") },
        ],
        columns: [
          col("Anúncio"),
          col("Identificação"),
          col("Leads", "int"),
          col("Oportunidades", "int"),
          col("Vendas", "int"),
          col("Valor vendido", "money"),
          col("Vendas por lead", "pct"),
        ],
        rows: rows.map((r) => ({
          cells: [
            r.ref?.headline || "Anúncio sem título",
            r.ref?.sourceId ?? "—",
            n(r.leads),
            n(r.deals),
            n(r.won),
            n(r.value),
            n(r.leads) ? n(r.won) / n(r.leads) : null,
          ],
        })),
        totals: ["Total", null, sum("leads"), sum("deals"), sum("won"), sum("value"), sum("leads") ? sum("won") / sum("leads") : null],
        note: "Leads criados no período por mensagem vinda de anúncio de clique para o WhatsApp (o WhatsApp informa o anúncio), agrupados pelo anúncio, e o que viraram até hoje. O investimento em mídia de cada anúncio fica no Legado Intelligence.",
      };
    }

    case "campanhas": {
      requireCap(s, "editCampaigns");
      const all = (await listCampaigns()).filter((c) => c.startedAt && c.startedAt >= s0!.toISOString() && c.startedAt < e0!.toISOString());
      const sum = (k: "sent" | "delivered" | "read" | "replied" | "interested" | "newDeals" | "optedOut") => all.reduce((a, c) => a + c.counts[k], 0);
      const row = (k: (typeof all)[number]["counts"], name: CrmReportCell): CrmReportCell[] => [
        name,
        k.sent,
        k.delivered,
        k.read,
        k.replied,
        k.sent ? k.replied / k.sent : null,
        k.interested,
        k.newDeals,
        k.optedOut,
      ];
      return {
        ...base(id, q, L),
        filters: ["Toda a equipe (campanhas não se dividem por pessoa)"],
        summary: [
          { label: "Campanhas", kind: "int", value: all.length },
          { label: "Enviadas", kind: "int", value: sum("sent") },
          { label: "Responderam", kind: "int", value: sum("replied") },
          { label: "Viraram oportunidade", kind: "int", value: sum("newDeals") },
        ],
        columns: [
          col("Campanha"),
          col("Enviadas", "int"),
          col("Entregues", "int"),
          col("Lidas", "int"),
          col("Responderam", "int"),
          col("Taxa de resposta", "pct"),
          col("Interessados", "int"),
          col("Viraram oportunidade", "int"),
          col("Pediram para sair", "int"),
        ],
        rows: all.map((c) => ({ cells: row(c.counts, c.name) })),
        totals: all.length
          ? row(
              {
                ...all[0].counts,
                sent: sum("sent"),
                delivered: sum("delivered"),
                read: sum("read"),
                replied: sum("replied"),
                interested: sum("interested"),
                newDeals: sum("newDeals"),
                optedOut: sum("optedOut"),
              },
              "Total",
            )
          : null,
        note: "Campanhas iniciadas no período, com os números de hoje. Viraram oportunidade = oportunidade aberta pelo contato nos dias seguintes ao envio, como na tela Campanhas.",
      };
    }
  }
}
