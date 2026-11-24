import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { getGoals, monthRange } from "@/lib/crm-goals";
import { CRM_GOAL_METRICS, monthTitle } from "@/lib/crm-types";
import { rowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";

const money = (cents: number) => (cents / 100).toFixed(2).replace(".", ",");

/** ?month=YYYY-MM → the month's goals against what was achieved, as CSV. "Exportar relatórios"; goes to the audit trail. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  const month = req.nextUrl.searchParams.get("month") ?? "";
  try {
    requireCap(actor, "exportReports");
    const g = await getGoals(actor, month);
    const value = (metric: string, v: number | undefined) => (v === undefined ? "" : metric === "wonValue" ? money(v) : String(v));
    const rows = [
      [`Metas de ${monthTitle(g.month)}`, `${Math.round(g.elapsed * 100)}% do mês decorrido`],
      [],
      ["Pessoa", ...CRM_GOAL_METRICS.flatMap((m) => [`${m.label}${m.money ? " (R$)" : ""} — meta`, "realizado", "%"])],
      ...g.rows.map((r) => [
        r.name,
        ...CRM_GOAL_METRICS.flatMap((m) => {
          const target = r.targets[m.id];
          return [value(m.id, target), value(m.id, r.actual[m.id]), target ? `${Math.round((r.actual[m.id] / target) * 100)}%` : ""];
        }),
      ]),
      [],
      ["Realizado contado como no Painel: leads cadastrados, reuniões e propostas que entraram na etapa, negócios ganhos e valor negociado nas oportunidades ganhas no mês."],
    ];
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.report_export",
      targetType: "crm_goals",
      targetId: g.month,
      metadata: { what: "Metas", from: monthRange(g.month)[0], to: monthRange(g.month)[1], rows: g.rows.length },
    });
    return new NextResponse(`﻿${rowsToCsv(rows)}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-metas-${g.month}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/goals/export GET");
  }
}
