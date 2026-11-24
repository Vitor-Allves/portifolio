// Server-only. The CRM's PDF documents (relatórios now, propostas and
// contratos later) with Legado Enterprise's identity: the logo and the
// Montserrat / Cinzel fonts already shipped for the Intelligence reports,
// navy and silver, a header and footer on every page. A document is a title,
// a few lines saying what it covers (period, filters), and sections that are
// either tables or paragraphs. Never throws for a missing logo or font — it
// falls back to a plain layout.

import { promises as fs } from "node:fs";
import path from "node:path";
import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { loadReportAssetsServer } from "./pdf-report-server-assets";
import { dataUrlToBase64 } from "./pdf-report-core";

const NAVY: [number, number, number] = [31, 58, 99];
const SILVER_TINT: [number, number, number] = [241, 243, 245];
const BORDER: [number, number, number] = [219, 223, 228];
const TEXT: [number, number, number] = [33, 41, 54];
const MUTED: [number, number, number] = [104, 113, 128];
const LOGO_WH = 360 / 390;

export type CrmPdfTable = {
  title: string;
  /** A line under the title (how it was calculated, what is left out). */
  note?: string;
  head: string[];
  rows: string[][];
  /** Columns aligned right (numbers, money). */
  right?: number[];
  /** Text shown instead of an empty table. */
  empty?: string;
};
export type CrmPdfText = { title: string; paragraphs: string[] };
export type CrmPdfSection = CrmPdfTable | CrmPdfText;

export type CrmPdfInput = {
  title: string;
  /** Lines under the title: period, filters, who it is for. */
  lines?: string[];
  sections: CrmPdfSection[];
  /** Who generated it (shown in the footer). */
  generatedBy: string;
  generatedAt?: Date;
  orientation?: "portrait" | "landscape";
  /** Footer note; default "Documento interno". */
  footerNote?: string;
};

async function readDataUrl(rel: string): Promise<string | null> {
  try {
    return `data:image/png;base64,${(await fs.readFile(path.join(process.cwd(), "public", rel))).toString("base64")}`;
  } catch {
    return null;
  }
}

const isTable = (s: CrmPdfSection): s is CrmPdfTable => "head" in s;

export function brDateTime(d: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(d);
}

export async function buildCrmPdf(input: CrmPdfInput): Promise<Uint8Array> {
  const [assets, logo] = await Promise.all([loadReportAssetsServer(), readDataUrl("brand/pdf/logo-legado-enterprise.png")]);
  const landscape = input.orientation === "landscape";
  const doc = new jsPDF({ orientation: landscape ? "landscape" : "portrait", unit: "mm", format: "a4" });
  const W = landscape ? 297 : 210;
  const H = landscape ? 210 : 297;
  const MX = 14;

  let body = "helvetica";
  let heading = "helvetica";
  try {
    if (assets.montserratRegular && assets.montserratBold) {
      doc.addFileToVFS("Montserrat-Regular.ttf", dataUrlToBase64(assets.montserratRegular));
      doc.addFont("Montserrat-Regular.ttf", "Montserrat", "normal");
      doc.addFileToVFS("Montserrat-Bold.ttf", dataUrlToBase64(assets.montserratBold));
      doc.addFont("Montserrat-Bold.ttf", "Montserrat", "bold");
      body = "Montserrat";
    }
    if (assets.cinzelBold) {
      doc.addFileToVFS("Cinzel-Bold.ttf", dataUrlToBase64(assets.cinzelBold));
      doc.addFont("Cinzel-Bold.ttf", "Cinzel", "bold");
      heading = "Cinzel";
    }
  } catch {
    body = "helvetica";
    heading = "helvetica";
  }

  const at = input.generatedAt ?? new Date();
  const footer = `Gerado por ${input.generatedBy} em ${brDateTime(at)} · ${input.footerNote ?? "Documento interno"}`;
  const TOP = 26;

  const header = () => {
    if (logo) {
      try {
        doc.addImage(logo, "PNG", MX, 6, 14 * LOGO_WH, 14);
      } catch {
        /* plain header */
      }
    }
    doc.setFont(heading, "bold");
    doc.setFontSize(10);
    doc.setTextColor(...NAVY);
    doc.text("LEGADO ENTERPRISE", W - MX, 11, { align: "right" });
    doc.setFont(body, "normal");
    doc.setFontSize(8);
    doc.setTextColor(...MUTED);
    doc.text("CRM", W - MX, 15.5, { align: "right" });
    doc.setDrawColor(...BORDER);
    doc.setLineWidth(0.3);
    doc.line(MX, 22, W - MX, 22);
  };

  // Title block (first page).
  header();
  let y = TOP + 6;
  doc.setFont(heading, "bold");
  doc.setFontSize(17);
  doc.setTextColor(...NAVY);
  for (const line of doc.splitTextToSize(input.title, W - 2 * MX) as string[]) {
    doc.text(line, MX, y);
    y += 7.5;
  }
  doc.setFont(body, "normal");
  doc.setFontSize(9);
  doc.setTextColor(...MUTED);
  for (const l of input.lines ?? []) {
    for (const line of doc.splitTextToSize(l, W - 2 * MX) as string[]) {
      doc.text(line, MX, y);
      y += 4.6;
    }
  }
  y += 3;

  const ensure = (need: number) => {
    if (y + need > H - 18) {
      doc.addPage();
      header();
      y = TOP + 4;
    }
  };

  for (const s of input.sections) {
    ensure(18);
    doc.setFont(body, "bold");
    doc.setFontSize(11);
    doc.setTextColor(...NAVY);
    doc.text(s.title, MX, y);
    y += 2;
    if (isTable(s)) {
      if (s.note) {
        doc.setFont(body, "normal");
        doc.setFontSize(8);
        doc.setTextColor(...MUTED);
        y += 3.5;
        for (const line of doc.splitTextToSize(s.note, W - 2 * MX) as string[]) {
          doc.text(line, MX, y);
          y += 3.6;
        }
        y -= 1.5;
      }
      if (s.rows.length === 0) {
        doc.setFont(body, "normal");
        doc.setFontSize(9);
        doc.setTextColor(...MUTED);
        y += 5;
        doc.text(s.empty ?? "Nada no período.", MX, y);
        y += 8;
        continue;
      }
      const right = new Set(s.right ?? []);
      autoTable(doc, {
        startY: y + 2,
        head: [s.head],
        body: s.rows,
        margin: { left: MX, right: MX, top: TOP + 2, bottom: 18 },
        theme: "grid",
        styles: { font: body, fontSize: 8, textColor: TEXT, cellPadding: 1.6, lineColor: BORDER, lineWidth: 0.2, overflow: "linebreak" },
        headStyles: { font: body, fontStyle: "bold", fillColor: NAVY, textColor: [255, 255, 255] },
        alternateRowStyles: { fillColor: SILVER_TINT },
        columnStyles: Object.fromEntries([...right].map((i) => [i, { halign: "right" as const }])),
        didParseCell: (c) => {
          if (c.section === "head" && right.has(c.column.index)) c.cell.styles.halign = "right";
        },
        didDrawPage: (d) => {
          if (d.pageNumber > 1 || doc.getNumberOfPages() > 1) header();
        },
      });
      y = (doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 8;
    } else {
      doc.setFont(body, "normal");
      doc.setFontSize(9.5);
      doc.setTextColor(...TEXT);
      y += 5;
      for (const p of s.paragraphs) {
        for (const line of doc.splitTextToSize(p, W - 2 * MX) as string[]) {
          ensure(5);
          doc.text(line, MX, y);
          y += 4.6;
        }
        y += 2;
      }
      y += 3;
    }
  }

  const pages = doc.getNumberOfPages();
  for (let i = 1; i <= pages; i++) {
    doc.setPage(i);
    doc.setFont(body, "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(...MUTED);
    doc.setDrawColor(...BORDER);
    doc.line(MX, H - 13, W - MX, H - 13);
    doc.text(footer, MX, H - 8.5);
    doc.text(`Página ${i} de ${pages}`, W - MX, H - 8.5, { align: "right" });
  }
  return new Uint8Array(doc.output("arraybuffer"));
}
