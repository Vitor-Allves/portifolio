import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { getProductivity, productivityPeriod } from "@/lib/crm-goals";
import type { CrmProductivityNumbers } from "@/lib/crm-types";
import { rowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";

const brDay = (d: string) => d.split("-").reverse().join("/");
const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");
const dateTime = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date(iso)) : "";

const cells = (x: CrmProductivityNumbers) => [
  String(x.leads),
  String(x.meetings),
  String(x.proposals),
  String(x.wonCount),
  money(x.wonValueCents),
  String(x.lostCount),
  x.conversion === null ? "" : `${Math.round(x.conversion * 100)}%`,
  String(x.tasksDone),
  String(x.tasksOverdue),
  String(x.conversations),
  String(x.answered),
  x.avgResponseMinutes === null ? "" : String(x.avgResponseMinutes),
];

/** ?from&to → each person's productivity in the period, as CSV. "Exportar relatórios"; goes to the audit trail. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const p = req.nextUrl.searchParams;
  try {
    requireCap(actor, "exportReports");
    const [from, to] = productivityPeriod(p.get("from"), p.get("to"));
    const d = await getProductivity(actor, from, to);
    const rows = [
      ["Produtividade", `${brDay(from)} a ${brDay(to)}`],
      [],
      [
        "Pessoa",
        "Leads cadastrados",
        "Reuniões",
        "Propostas",
        "Negócios ganhos",
        "Valor vendido (R$)",
        "Negócios perdidos",
        "Conversão",
        "Tarefas concluídas",
        "Tarefas atrasadas (agora)",
        "Conversas atendidas",
        "Respostas a quem esperava",
        "Tempo médio de resposta (min)",
        "Última atividade",
      ],
      ...d.rows.map((r) => [r.name, ...cells(r), dateTime(r.lastActivityAt)]),
      ...(d.team ? [["Equipe", ...cells(d.team), ""]] : []),
      [],
      ["Leads, oportunidades e tarefas contam para o responsável; conversas e tempo de resposta, para quem respondeu (campanhas não contam). Contatos arquivados ficam de fora, como no Painel."],
    ];
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.report_export",
      targetType: "crm_productivity",
      metadata: { what: "Produtividade", from, to, rows: d.rows.length },
    });
    return new NextResponse(`﻿${rowsToCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-produtividade-${from}-a-${to}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/productivity/export GET");
  }
}
