import { NextRequest, NextResponse } from "next/server";
import { MetaApiError } from "@/lib/meta-ads";
import { sessionScopeFromRequest, hasDataAccess } from "@/lib/auth-context";
import { isFullAdmin } from "@/lib/session-scope";
import { isActionAllowed, resolveReportSettings, type ReportSettingsRoleKind } from "@/lib/client-permissions";
import { sanitizeReportFilters } from "@/lib/report-templates-types";
import { buildReportPdf, reportFileName, type ReportPdfInput, type PdfReportType, type ReportType } from "@/lib/pdf-report-core";
import { loadReportAssetsServer } from "@/lib/pdf-report-server-assets";
import { resolveReportClients } from "@/lib/client-access";
import {
  resolveRecipient,
  isRecipientError,
  buildAllowedColumns,
  applyHiddenFilters,
  periodSummaryLabel,
  fetchFilteredReportData,
  computeReach,
  resolveSelectedIndicators,
  isSelectedIndicatorsError,
} from "@/lib/report-data";
import { writeAudit } from "@/lib/audit-log";
import { DbConfigError } from "@/lib/db";
import { getClientBudgetWithPrevious } from "@/lib/client-budgets";
import { projectedSpend } from "@/lib/budget-pacing";
import { getDashboardData } from "@/lib/meta-ads";
import { saveReportClientSelection } from "@/lib/report-client-selections";
import { getClientConsultantInfo } from "@/lib/client-access";

function roleKindFor(scope: { kind: "staff" | "client"; role?: string }): ReportSettingsRoleKind {
  if (scope.kind === "client") return "client";
  return (scope.role as ReportSettingsRoleKind) ?? "analista";
}

export const runtime = "nodejs";
// See the same comment on src/app/analise/page.tsx — generating a report
// fetches the same multi-account Meta data plus builds a PDF on top, so it's
// at least as exposed to the platform's default 10s function budget.
export const maxDuration = 60;

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
  reportType?: unknown;
  reportVersion?: unknown;
  indicators?: unknown;
  rememberSelection?: unknown;
};

/** This month-to-date pacing for one client (see BudgetCard.tsx) — null on any missing piece (DB not configured, no budget registered, or the fetch itself fails) so a glitch here never blocks the rest of the report. */
async function fetchBudgetPacing(clientAccessId: string, clientLabel: string, accountIds: string[]): Promise<ReportPdfInput["budgetPacing"]> {
  try {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const { current: budget } = await getClientBudgetWithPrevious(clientAccessId, year, month);
    if (budget === null) return null;
    const data = await getDashboardData({ kind: "preset", preset: "this_month" }, accountIds);
    const [, , dayStr] = data.resolvedRange.until.split("-");
    const dayOfMonth = Number(dayStr);
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const spend = data.campaigns.reduce((sum, c) => sum + c.spend, 0);
    return { label: clientLabel, spend, budget, projected: projectedSpend(spend, dayOfMonth, daysInMonth), dayOfMonth, daysInMonth };
  } catch (err) {
    if (err instanceof DbConfigError) return null;
    console.error("[api/analise/reports/pdf] budget pacing fetch failed", err);
    return null;
  }
}

const PDF_REPORT_TYPES: PdfReportType[] = ["executive", "detailed", "audience"];

function sanitizeReportType(input: unknown): PdfReportType {
  return typeof input === "string" && (PDF_REPORT_TYPES as string[]).includes(input) ? (input as PdfReportType) : "detailed";
}

function sanitizeReportVersion(input: unknown): ReportType {
  return input === "simplificado" ? "simplificado" : "tecnico";
}

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
  const reportType = sanitizeReportType(body.reportType);
  const reportVersion = sanitizeReportVersion(body.reportVersion);
  const filters = sanitizeReportFilters(body.filters);
  if (!filters) {
    return NextResponse.json({ error: "Filtros de relatório inválidos." }, { status: 400 });
  }
  const recipientClientId = typeof body.recipientClientId === "string" && body.recipientClientId.trim() ? body.recipientClientId.trim() : null;

  const recipient = await resolveRecipient(scope, recipientClientId);
  if (isRecipientError(recipient)) {
    return NextResponse.json({ error: recipient.error }, { status: recipient.status });
  }

  const reportSettings = resolveReportSettings(scope.permissions, roleKindFor(scope));
  if (!reportSettings.typesAllowed.includes(reportVersion)) {
    return NextResponse.json({ error: "Este tipo de relatório (Simplificado/Técnico) não está liberado para o seu usuário." }, { status: 403 });
  }

  const effectiveFilters = applyHiddenFilters(filters, recipient.permissions);
  const allowedColumns = buildAllowedColumns(recipient.permissions);

  try {
    const data = await fetchFilteredReportData(effectiveFilters, recipient);
    const { reach, comparisonReach } = await computeReach(effectiveFilters, recipient, data);
    const { freshData, filteredCampaigns, scopedAdSets, selectedAdSetIds, resolvedAccountIds, activeFilters } = data;

    // Who this report is actually ABOUT, from the accounts it ends up
    // covering — never from who's logged in or which recipient id was
    // requested beyond what that id itself resolves to. A client session or
    // an admin-selected single recipientClientId both already resolve
    // trivially to "single" here; only an admin's own unrestricted,
    // multi-account export can resolve to "multiple".
    const clientResolution = await resolveReportClients(resolvedAccountIds);
    if (clientResolution.kind === "multiple" && !reportSettings.canMultiClient) {
      return NextResponse.json(
        { error: "Seu usuário não pode gerar relatórios com mais de um cliente (múltiplas contas). Restrinja o filtro de contas a um único cliente." },
        { status: 403 }
      );
    }
    const resolvedClientLabel = clientResolution.kind === "single" ? clientResolution.client.label : null;
    const isMultiClient = clientResolution.kind === "multiple";
    const multiClientNames = clientResolution.kind === "multiple" ? clientResolution.clients.map((c) => c.label) : [];

    const selectedIndicators = await resolveSelectedIndicators(body.indicators, allowedColumns, reportSettings);
    if (isSelectedIndicatorsError(selectedIndicators)) {
      return NextResponse.json({ error: selectedIndicators.error }, { status: selectedIndicators.status });
    }

    const filteredCampaignIds = new Set(filteredCampaigns.map((c) => c.campaignId));
    const scopedAds = freshData.ads.filter(
      (a) => filteredCampaignIds.has(a.campaignId) && (selectedAdSetIds === null || selectedAdSetIds.has(a.adSetId))
    );

    const budgetPacing =
      clientResolution.kind === "single" && selectedIndicators.has("budgetPacing")
        ? await fetchBudgetPacing(clientResolution.client.id, clientResolution.client.label, recipient.accountIds ?? [...resolvedAccountIds])
        : null;
    const consultant =
      clientResolution.kind === "single"
        ? await getClientConsultantInfo(clientResolution.client.id)
            .then((c) => (c ? { name: c.consultantName, whatsapp: c.consultantWhatsapp } : null))
            .catch(() => null)
        : null;

    if (body.rememberSelection === true && clientResolution.kind === "single") {
      await saveReportClientSelection(clientResolution.client.id, reportVersion, [...selectedIndicators], scope.userName).catch((err) => {
        if (!(err instanceof DbConfigError)) console.error("[api/analise/reports/pdf] failed to save remembered selection", err);
      });
    }

    const input: ReportPdfInput = {
      title,
      reportType,
      reportVersion,
      clientLabel: resolvedClientLabel,
      isMultiClient,
      multiClientNames,
      isClientScoped: recipient.isClientScoped,
      allowedColumns,
      selectedIndicators,
      ads: scopedAds,
      budgetPacing,
      consultant,
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
      devices: freshData.devices.filter((d) => resolvedAccountIds.has(d.accountId)),
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
      targetLabel: isMultiClient ? "Múltiplas contas" : resolvedClientLabel ?? "Interno",
      metadata: { format: "pdf", recipientClientId, reportType, reportVersion },
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
