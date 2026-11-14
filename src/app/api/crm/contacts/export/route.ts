import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { contactFiltersFromSearch, listContactsForExport } from "@/lib/crm";
import { CRM_CONSENT, formatPhone, sourceLabel, stageLabel } from "@/lib/crm-types";
import { rowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";

const day = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "";

/** The contact list as CSV (same filters as the screen), for Excel/Sheets — and as a team-side backup. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    const filters = contactFiltersFromSearch(req.nextUrl.searchParams, actor.userId);
    const contacts = await listContactsForExport(filters);
    const header = [
      "Nome", "WhatsApp", "E-mail", "Empresa", "Cargo", "Segmento", "Cidade", "Origem", "Indicado por",
      "Etapa", "Responsável", "Consentimento", "Descadastrado", "Próxima ação", "Data da próxima ação", "Cadastrado em",
    ];
    const rows = contacts.map((c) => [
      c.name,
      c.phone ? formatPhone(c.phone) : "",
      c.email ?? "",
      c.company ?? "",
      c.jobTitle ?? "",
      c.segment ?? "",
      c.city ?? "",
      sourceLabel(c.source),
      c.referredBy ?? "",
      stageLabel(c.stage),
      c.ownerName ?? "",
      CRM_CONSENT.find((x) => x.id === c.consentStatus)?.label ?? "",
      c.optedOutAt ? `Sim (${day(c.optedOutAt)})` : "",
      c.nextAction ?? "",
      day(c.nextActionAt),
      day(c.createdAt),
    ]);
    await writeAudit({
      actorUserId: actor.userId,
      actorLabel: actor.userName,
      actorKind: "admin",
      action: "crm.export",
      targetType: "crm_contacts",
      metadata: { count: rows.length, filters: { ...filters, currentUserId: undefined } },
    });
    const stamp = new Date().toISOString().slice(0, 10);
    return new NextResponse(`﻿${rowsToCsv([header, ...rows])}`, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="crm-contatos-${stamp}.csv"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    return crmErrorResponse(err, "api/crm/contacts/export GET");
  }
}
