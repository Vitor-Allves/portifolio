import { NextRequest, NextResponse } from "next/server";
import { MetaApiError } from "@/lib/meta-ads";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { isActionAllowed } from "@/lib/client-permissions";
import { sanitizeReportFilters } from "@/lib/report-templates-types";
import { buildReportPdf, reportFileName, type ReportPdfInput } from "@/lib/pdf-report-core";
import { loadReportAssetsServer } from "@/lib/pdf-report-server-assets";
import {
  resolveRecipient,
  isRecipientError,
  buildAllowedColumns,
  applyHiddenFilters,
  periodSummaryLabel,
  fetchFilteredReportData,
  computeReach,
} from "@/lib/report-data";
import { writeAudit } from "@/lib/audit-log";

export const runtime = "nodejs";

// ---------------------------------------------------------------------------
// Every metric/column-visibility decision below flows from ONE place: the
// requesting session's own SessionScope (self-generated) or, for a full
// admin explicitly naming a recipient, that recipient's own client_access
// row — the exact same ClientPermissions record the live dashboard already
// enforces (see report-data.ts's resolveRecipient/buildAllowedColumns,
// shared with the CSV export route so the two can never diverge). This
// route never accepts a metric/column list, a user id, or a permission set
// from the request body — only filters (period, accounts, campaigns, ad
// sets, objective, status) and, for a full admin, which client to generate
// for. The response is the compiled PDF's bytes; the underlying JSON
// dataset never round-trips through the browser.
// ---------------------------------------------------------------------------

type RequestBody = {
  title?: unknown;
  filters?: unknown;
  recipientClientId?: unknown;
};

export async function POST(req: NextRequest) {
  const scope = await sessionScopeFromRequest(req);
  if (!hasDataAccess(scope)) {
    return NextResponse.json({ error: "Sessão inválida ou expirada. Faça login novamente." }, { status: 401 });
  }
  if (!isFullAdmin(scope) && !isActionAllowed(scope.permissions, "export_reports")) {
    return NextResponse.json({ error: "Sem permissão para gerar relatórios." }, { status: 403 });
  }

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Requisição inválida." }, { status: 400 });
  }

  const title = typeof body.title === "string" && body.title.trim() ? body.title.trim() : "Relatório de campanhas";
  const filters = sanitizeReportFilters(body.filters);
  if (!filters) {
    return NextResponse.json({ error: "Filtros de relatório inválidos." }, { status: 400 });
  }
  const recipientClientId = typeof body.recipientClientId === "string" && body.recipientClientId.trim() ? body.recipientClientId.trim() : null;

  const recipient = await resolveRecipient(scope, recipientClientId);
  if (isRecipientError(recipient)) {
    return NextResponse.json({ error: recipient.error }, { status: recipient.status });
  }

  const effectiveFilters = applyHiddenFilters(filters, recipient.permissions);
  const allowedColumns = buildAllowedColumns(recipient.permissions);

  try {
    const data = await fetchFilteredReportData(effectiveFilters, recipient);
    const { reach, comparisonReach } = await computeReach(effectiveFilters, recipient, data);
    const { freshData, filteredCampaigns, scopedAdSets, selectedAdSetIds, resolvedAccountIds, activeFilters } = data;

    const input: ReportPdfInput = {
      title,
      clientLabel: recipient.label,
      isClientScoped: recipient.isClientScoped,
      allowedColumns,
      accounts: freshData.accounts.filter((a) => resolvedAccountIds.has(a.id)),
      periodLabel: periodSummaryLabel(effectiveFilters, freshData.resolvedRange.since, freshData.resolvedRange.until),
      resolvedRange: freshData.resolvedRange,
      compare: effectiveFilters.compare,
      comparisonRange: freshData.comparison?.period ?? null,
      filters: activeFilters,
      generatedAt: new Date(),
      dataGeneratedAt: freshData.generatedAt,
      campaigns: filteredCampaigns,
      comparisonCampaigns: freshData.comparison ? freshData.comparison.campaigns.filter((c) => resolvedAccountIds.has(c.accountId)) : null,
      adSets: scopedAdSets,
      selectedAdSetIds,
      daily: freshData.daily.filter((d) => resolvedAccountIds.has(d.accountId)),
      comparisonDaily: freshData.comparison ? freshData.comparison.daily.filter((d) => resolvedAccountIds.has(d.accountId)) : null,
      reach,
      comparisonReach,
      audience: freshData.audience.filter((a) => resolvedAccountIds.has(a.accountId)),
      regions: freshData.regions.filter((r) => resolvedAccountIds.has(r.accountId)),
      platforms: freshData.platforms.filter((p) => resolvedAccountIds.has(p.accountId)),
      placements: freshData.placements.filter((p) => resolvedAccountIds.has(p.accountId)),
      devices: freshData.devices.filter((d) => resolvedAccountIds.has(d.accountId)),
      countries: freshData.countries.filter((c) => resolvedAccountIds.has(c.accountId)),
      hours: freshData.hours.filter((h) => resolvedAccountIds.has(h.accountId)),
      partialAccountNames: freshData.partialAccounts.map((a) => a.name),
    };

    const assets = await loadReportAssetsServer();
    const doc = buildReportPdf(input, assets);
    const pdfBuffer = Buffer.from(doc.output("arraybuffer"));
    const fileName = reportFileName(input);

    await writeAudit({
      actorUserId: scope.userId,
      actorLabel: scope.userName,
      actorKind: scope.kind === "staff" ? "admin" : "client",
      action: "report.generate",
      targetType: "report",
      targetLabel: recipient.label ?? "Interno",
      metadata: { format: "pdf", recipientClientId },
    });

    return new NextResponse(pdfBuffer, {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${fileName}"`,
        "Content-Length": String(pdfBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[api/analise/reports/pdf]", err);
    const status = err instanceof MetaApiError ? 502 : 500;
    return NextResponse.json({ error: "Não foi possível gerar o relatório PDF agora." }, { status });
  }
}
