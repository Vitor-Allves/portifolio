import { NextRequest, NextResponse } from "next/server";
import { writeAudit } from "@/lib/audit-log";
import { crmActorFromRequest, crmErrorResponse } from "@/lib/crm-auth";
import { requireCap } from "@/lib/crm-access";
import { contactFiltersFromSearch, listContactsForExport } from "@/lib/crm";
import { nextTasksByContact } from "@/lib/crm-tasks";
import { CRM_CONSENT, formatPhone, stageLabel, temperatureLabel } from "@/lib/crm-types";
import { getCatalog } from "@/lib/crm-options";
import { rowsToCsv } from "@/lib/csv";

export const runtime = "nodejs";

const day = (iso: string | null) =>
  iso ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", year: "numeric" }).format(new Date(iso)) : "";

/** The contact list as CSV (same filters as the screen), for Excel/Sheets — and as a team-side backup. */
export async function GET(req: NextRequest) {
  const actor = await crmActorFromRequest(req);
  if (actor instanceof NextResponse) return actor;
  try {
    requireCap(actor, "exportContacts");
    const filters = contactFiltersFromSearch(req.nextUrl.searchParams, actor.userId);
    const contacts = await listContactsForExport(filters);
    const [nextTasks, catalog] = await Promise.all([nextTasksByContact(contacts.map((c) => c.id)), getCatalog()]);
    const sourceLabel = (id: string) => catalog.options.find((o) => o.kind === "source" && o.id === id)?.label ?? id;
    const serviceLabel = (id: string | null) => (id ? (catalog.options.find((o) => o.kind === "service" && o.id === id)?.label ?? id) : "");
    const tagLabels = new Map(catalog.tags.map((t) => [t.id, t.label]));
    const header = [
      "Nome", "WhatsApp", "E-mail", "Empresa", "Cargo", "Segmento", "Cidade", "Origem", "Indicado por",
      "Etapa", "Responsável", "Consentimento", "Descadastrado", "Próxima tarefa", "Data da próxima tarefa", "Cadastrado em", "Etiquetas",
      "Temperatura", "Serviço de interesse", "Retorno previsto", "Última interação", "Decisor",
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
      nextTasks.get(c.id)?.title ?? "",
      day(nextTasks.get(c.id)?.dueAt ?? null),
      day(c.createdAt),
      c.tagIds.map((id) => tagLabels.get(id) ?? id).join(", "),
      temperatureLabel(c.temperature),
      serviceLabel(c.serviceInterest),
      c.returnAt ? c.returnAt.split("-").reverse().join("/") : "",
      day(c.lastInteractionAt),
      c.isDecisionMaker ? "Sim" : "",
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
