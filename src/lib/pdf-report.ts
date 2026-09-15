"use client";

// Client-only: browser asset loading (fetch/FileReader) and the download
// trigger for the "Legado Intelligence" PDF report. The actual document
// builder (buildReportPdf) is pure/isomorphic and lives in pdf-report-core.ts
// — this file only adds the browser-specific glue around it. Kept for local/
// dev use and any client-side preview; the real permission-enforcing export
// path is the server route (/api/analise/reports/pdf, see
// pdf-report-server-assets.ts for its Node-side equivalent of loadReportAssets).

import type { jsPDF } from "jspdf";
import { buildReportPdf, reportFileName, ReportPdfError, type ReportPdfInput, type ReportAssets } from "./pdf-report-core";

export type { ReportPdfInput, ReportAssets, AllowedColumns } from "./pdf-report-core";
export { ReportPdfError, buildReportPdf, reportFileName } from "./pdf-report-core";

async function fetchAsDataUrl(path: string): Promise<string | null> {
  try {
    const res = await fetch(path);
    if (!res.ok) return null;
    const blob = await res.blob();
    return await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = () => reject(reader.error ?? new Error(`Falha ao ler ${path}`));
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

/** Never throws — a missing logo or font just falls back to a plain layout instead of failing the whole report. */
export async function loadReportAssets(): Promise<ReportAssets> {
  const [logoDataUrl, montserratRegular, montserratSemiBold, montserratBold, cinzelBold] = await Promise.all([
    fetchAsDataUrl("/brand/logo-legado.png"),
    fetchAsDataUrl("/fonts/Montserrat-Regular.ttf"),
    fetchAsDataUrl("/fonts/Montserrat-SemiBold.ttf"),
    fetchAsDataUrl("/fonts/Montserrat-Bold.ttf"),
    fetchAsDataUrl("/fonts/Cinzel-Bold.ttf"),
  ]);
  return { logoDataUrl, montserratRegular, montserratSemiBold, montserratBold, cinzelBold };
}

/** Loads assets, builds the document and triggers a browser download. Never throws for a missing logo/font — the report still generates with graceful fallbacks. Throws ReportPdfError only if jsPDF itself fails to produce a document. */
export async function downloadCampaignReportPdf(input: ReportPdfInput): Promise<void> {
  const assets = await loadReportAssets();
  let doc: jsPDF;
  try {
    doc = buildReportPdf(input, assets);
  } catch (err) {
    throw new ReportPdfError(err instanceof Error ? err.message : "Falha ao montar o PDF.");
  }
  doc.save(reportFileName(input));
}
