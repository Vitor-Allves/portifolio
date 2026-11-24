import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { listTeam } from "@/lib/crm";
import { dashboardParams, getDashboard, isDashboardMetric, listDashboardRecords } from "@/lib/crm-dashboard";
import { getCatalog } from "@/lib/crm-options";
import { stageLabel, type CrmDashboardRecord } from "@/lib/crm-types";
import { rowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";

const brDay = (d: string) => d.split("-").reverse().join("/");
const money = (cents: number | null) => (cents === null ? "" : (cents / 100).toFixed(2).replace(".", ","));
const pct = (v: number | null) => (v === null ? "" : `${Math.round(v * 100)}%`);
const dateTime = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "";

const RECORD_KIND: Record<CrmDashboardRecord["kind"], string> = { contact: "Lead", deal: "Oportunidade", task: "Tarefa", client: "Cliente", campaign: "Campanha" };

/**
 * ?what=summary (the Painel) or ?what=records&metric=<indicador> (the list
 * behind a number), with the Painel's filters → CSV. "Exportar relatórios"
 * permission; every export goes to the audit trail.
 */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  const q = dashboardParams(p, actor);
  if ("error" in q) return NextResponse.json({ error: q.error }, { status: 400 });
  const what = p.get("what") === "records" ? "records" : "summary";
  const metric = p.get("metric");
  if (what === "records" && !isDashboardMetric(metric)) return NextResponse.json({ error: "Indicador inválido." }, { status: 400 });
  try {
    requireCap(actor, "exportReports");
    const catalog = await getCatalog();
    const label = (kind: string, id: string) => catalog.options.find((o) => o.kind === kind && o.id === id)?.label ?? id;
    const period = `${brDay(q.from)} a ${brDay(q.to)}`;
    let rows: string[][];
    let name: string;
    if (what === "records" && isDashboardMetric(metric)) {
      const r = await listDashboardRecords(metric, q.from, q.to, q.filters, q.viewer);
      rows = [
        ["Tipo", "Nome", "Detalhe", "Responsável", "Etapa", "Valor (R$)", "Data"],
        ...r.rows.map((x) => [RECORD_KIND[x.kind], x.title, x.detail ?? "", x.ownerName ?? "", x.stage ? stageLabel(x.stage) : "", money(x.valueCents), dateTime(x.at)]),
      ];
      name = `crm-painel-${metric}-${q.from}-a-${q.to}.csv`;
    } else {
      const d = await getDashboard(q.from, q.to, q.filters, await listTeam(), q.viewer);
      const c = d.current;
      const b = d.previous;
      const filters = [
        q.filters.ownerId ? `Responsável: ${(await listTeam()).find((m) => m.id === q.filters.ownerId)?.name ?? q.filters.ownerId}` : "",
        q.filters.source ? `Origem: ${label("source", q.filters.source)}` : "",
        q.filters.segment ? `Segmento: ${q.filters.segment}` : "",
        q.filters.stage ? `Etapa: ${stageLabel(q.filters.stage)}` : "",
      ].filter(Boolean);
      rows = [
        ["Painel do CRM", period, filters.join(" · ") || "Sem filtros"],
        [],
        ["Indicador", period, `${brDay(d.previousFrom)} a ${brDay(d.previousTo)}`],
        ["Leads cadastrados", String(c.newLeads), String(b.newLeads)],
        ["Oportunidades abertas no período", String(c.newDeals), String(b.newDeals)],
        ["Reuniões", String(c.meetings), String(b.meetings)],
        ["Propostas", String(c.proposals), String(b.proposals)],
        ["Negócios ganhos", String(c.wonCount), String(b.wonCount)],
        ["Valor vendido (negociado nas oportunidades ganhas, R$)", money(c.wonValueCents), money(b.wonValueCents)],
        ["Negócios perdidos", String(c.lostCount), String(b.lostCount)],
        ["Taxa de conversão", pct(c.conversion), pct(b.conversion)],
        ["Ticket médio (R$)", money(c.avgTicketCents), money(b.avgTicketCents)],
        ["Ciclo médio (dias)", c.avgCycleDays === null ? "" : String(c.avgCycleDays), b.avgCycleDays === null ? "" : String(b.avgCycleDays)],
        ["Tarefas concluídas", String(c.tasksDone), String(b.tasksDone)],
        [],
        ["Agora", "Quantidade", "Valor (R$)"],
        ["Oportunidades abertas", String(d.openNow.count), money(d.openNow.valueCents)],
        [`Oportunidades paradas (${d.stalledNow.days} dias)`, String(d.stalledNow.count), money(d.stalledNow.valueCents)],
        ["Tarefas e follow-ups atrasados", String(d.tasksNow.overdue), ""],
        ["Tarefas para hoje", String(d.tasksNow.today), ""],
        ...(d.recurring ? [["Receita recorrente contratada (contratos vigentes, por mês)", String(d.recurring.clients), money(d.recurring.monthlyCents)]] : []),
        [],
        ["Funil", "Quantidade", "Valor (R$)"],
        ...d.funnel.map((f) => [stageLabel(f.stage), String(f.count), money(f.valueCents)]),
        [],
        ["Origem", "Leads", "Ganhos", "Valor vendido (R$)"],
        ...d.sources.map((x) => [label("source", x.source), String(x.newLeads), String(x.won), money(x.wonValueCents)]),
        [],
        ["Motivo de perda", "Quantidade", "Valor (R$)"],
        ...d.lossReasons.map((x) => [x.reason === "sem_motivo" ? "Sem motivo" : label("lost_reason", x.reason), String(x.count), money(x.valueCents)]),
        [],
        ["Pessoa", "Abertas", "Valor aberto (R$)", "Ganhos", "Valor vendido (R$)", "Perdidos", "Conversão", "Tarefas concluídas", "Tarefas atrasadas", "Última atividade"],
        ...d.team.map((t) => [
          t.name,
          String(t.openCount),
          money(t.openValueCents),
          String(t.wonCount),
          money(t.wonValueCents),
          String(t.lostCount),
          pct(t.conversion),
          String(t.tasksDone),
          String(t.tasksOverdue),
          dateTime(t.lastActivityAt),
        ]),
        ...(d.campaigns
          ? [
              [],
              ["Campanhas iniciadas no período", "Enviadas", "Entregues", "Lidas", "Responderam", "Interessados", "Viraram oportunidade", "Pediram para sair"],
              [
                String(d.campaigns.count),
                String(d.campaigns.sent),
                String(d.campaigns.delivered),
                String(d.campaigns.read),
                String(d.campaigns.replied),
                String(d.campaigns.interested),
                String(d.campaigns.newDeals),
                String(d.campaigns.optedOut),
              ],
            ]
          : []),
        [],
        ["Valor vendido = negociado nas oportunidades ganhas. Receita recorrente = contratos vigentes. Faturamento emitido e valor recebido não são controlados pelo CRM."],
      ];
      name = `crm-painel-${q.from}-a-${q.to}.csv`;
    }
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.report_export",
      targetType: "crm_dashboard",
      metadata: { what: what === "records" ? `lista: ${metric}` : "Painel", from: q.from, to: q.to, rows: Math.max(0, rows.length - 1), filters: { ...q.filters } },
    });
    return new NextResponse(`﻿${rowsToCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${name}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/dashboard/export GET");
  }
}
