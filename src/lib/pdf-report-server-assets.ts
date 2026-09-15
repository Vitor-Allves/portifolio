// Server-only: loads the same brand assets pdf-report.ts's browser
// loadReportAssets() fetches, but via fs from the deployed public/ directory
// — used by the server-side PDF generation route so report bytes are
// produced entirely in the Node process (see /api/analise/reports/pdf).
// Never throws — a missing logo/font falls back to a plain layout rather
// than failing the whole report, matching the browser loader's behavior.

import { promises as fs } from "node:fs";
import path from "node:path";
import type { ReportAssets } from "./pdf-report-core";

async function readAsDataUrl(relPath: string, mime: string): Promise<string | null> {
  try {
    const buf = await fs.readFile(path.join(process.cwd(), "public", relPath));
    return `data:${mime};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function loadReportAssetsServer(): Promise<ReportAssets> {
  const [logoDataUrl, montserratRegular, montserratSemiBold, montserratBold, cinzelBold] = await Promise.all([
    readAsDataUrl("brand/logo-legado.png", "image/png"),
    readAsDataUrl("fonts/Montserrat-Regular.ttf", "font/ttf"),
    readAsDataUrl("fonts/Montserrat-SemiBold.ttf", "font/ttf"),
    readAsDataUrl("fonts/Montserrat-Bold.ttf", "font/ttf"),
    readAsDataUrl("fonts/Cinzel-Bold.ttf", "font/ttf"),
  ]);
  return { logoDataUrl, montserratRegular, montserratSemiBold, montserratBold, cinzelBold };
}
