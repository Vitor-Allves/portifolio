// Reads a spreadsheet in the browser for the CRM import: .csv (what Excel or
// Google Sheets save, comma or semicolon, UTF-8 or Windows-1252) and .xlsx
// (first sheet). An .xlsx is a zip of XML files; fflate unzips it and the
// browser's own DOMParser reads the cells — no spreadsheet library.

import { unzipSync, strFromU8 } from "fflate";
import type { CrmImportField } from "@/lib/crm-types";

export type Sheet = { headers: string[]; rows: string[][] };

export const SHEET_MAX_BYTES = 5 * 1024 * 1024;

/** Excel in pt-BR saves "CSV" as Windows-1252; anything that isn't valid UTF-8 is read that way. */
function decodeText(bytes: Uint8Array): string {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^﻿/, "");
  } catch {
    return new TextDecoder("windows-1252").decode(bytes);
  }
}

export function parseCsv(text: string): string[][] {
  const firstLine = text.slice(0, text.indexOf("\n") === -1 ? undefined : text.indexOf("\n"));
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) >= (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"' && cell === "") quoted = true;
    else if (ch === delimiter) {
      row.push(cell);
      cell = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && text[i + 1] === "\n") i++;
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
    } else cell += ch;
  }
  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

function columnIndex(ref: string): number {
  const letters = ref.replace(/\d+$/, "");
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n - 1;
}

/** Excel stores long numbers (phones) as numbers; "5.515999998888E12" must come back as digits. */
function numberText(v: string): string {
  if (/e/i.test(v) && Number.isFinite(Number(v)) && Number.isInteger(Number(v))) return BigInt(Math.round(Number(v))).toString();
  return v;
}

function textOf(el: Element | null): string {
  if (!el) return "";
  // Shared strings may be rich text: <si><r><t>a</t></r><r><t>b</t></r></si>; phonetic runs (<rPh>) are skipped.
  return Array.from(el.getElementsByTagName("t"))
    .filter((t) => t.parentElement?.tagName !== "rPh")
    .map((t) => t.textContent ?? "")
    .join("");
}

export function parseXlsx(bytes: Uint8Array): string[][] {
  const files = unzipSync(bytes, { filter: (f) => (f.name.startsWith("xl/") && f.name.endsWith(".xml")) || f.name.endsWith(".rels") });
  const xml = (name: string) => (files[name] ? new DOMParser().parseFromString(strFromU8(files[name]), "application/xml") : null);

  // First sheet: workbook.xml → its r:id → the worksheet path in workbook.xml.rels.
  let sheetPath = "xl/worksheets/sheet1.xml";
  const workbook = xml("xl/workbook.xml");
  const rels = xml("xl/_rels/workbook.xml.rels");
  const firstSheet = workbook?.getElementsByTagName("sheet")[0];
  const rid = firstSheet?.getAttribute("r:id") ?? firstSheet?.getAttributeNS("http://schemas.openxmlformats.org/officeDocument/2006/relationships", "id");
  if (rid && rels) {
    const rel = Array.from(rels.getElementsByTagName("Relationship")).find((r) => r.getAttribute("Id") === rid);
    const target = rel?.getAttribute("Target");
    if (target) sheetPath = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\//, "")}`;
  }
  const sheet = xml(sheetPath);
  if (!sheet) throw new Error("Não encontrei a primeira aba da planilha.");

  const shared = Array.from(xml("xl/sharedStrings.xml")?.getElementsByTagName("si") ?? []).map((si) => textOf(si));
  const out: string[][] = [];
  for (const rowEl of Array.from(sheet.getElementsByTagName("row"))) {
    const r = Number(rowEl.getAttribute("r")) || out.length + 1;
    const cells: string[] = [];
    for (const c of Array.from(rowEl.getElementsByTagName("c"))) {
      const ref = c.getAttribute("r");
      const idx = ref ? columnIndex(ref) : cells.length;
      const type = c.getAttribute("t");
      const v = c.getElementsByTagName("v")[0]?.textContent ?? "";
      let value: string;
      if (type === "s") value = shared[Number(v)] ?? "";
      else if (type === "inlineStr") value = textOf(c.getElementsByTagName("is")[0] ?? null);
      else if (type === "b") value = v === "1" ? "TRUE" : "FALSE";
      else if (type === "str" || type === "e") value = v;
      else value = numberText(v);
      cells[idx] = value;
    }
    out[r - 1] = Array.from(cells, (x) => x ?? "");
  }
  return Array.from(out, (x) => x ?? []);
}

/** The file's first non-empty row is the header; fully empty rows are dropped. */
export async function readSheet(file: File): Promise<Sheet> {
  if (file.size > SHEET_MAX_BYTES) throw new Error("Arquivo grande demais (máximo 5 MB). Divida a planilha em partes.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  const name = file.name.toLowerCase();
  let grid: string[][];
  if (name.endsWith(".xlsx")) grid = parseXlsx(bytes);
  else if (name.endsWith(".csv") || name.endsWith(".txt")) grid = parseCsv(decodeText(bytes));
  else if (name.endsWith(".xls")) throw new Error("Arquivo .xls antigo: abra no Excel e salve como .xlsx ou .csv.");
  else throw new Error("Use um arquivo .xlsx ou .csv.");
  const nonEmpty = grid.map((r) => r.map((c) => (c ?? "").trim())).filter((r) => r.some((c) => c !== ""));
  if (nonEmpty.length < 2) throw new Error("A planilha precisa de uma linha de títulos e pelo menos um contato.");
  const width = Math.max(...nonEmpty.map((r) => r.length));
  const pad = (r: string[]) => Array.from({ length: width }, (_, i) => r[i] ?? "");
  const [headers, ...rows] = nonEmpty.map(pad);
  return { headers: headers.map((h, i) => h || `Coluna ${i + 1}`), rows };
}

/** Spreadsheet row number as the user sees it (title row = 1) for each data row of `readSheet`. */
export function lineNumbers(file: Sheet): number[] {
  return file.rows.map((_, i) => i + 2);
}

const GUESS: [CrmImportField, RegExp][] = [
  // most specific first: "Nome da empresa" is the company, not the name
  ["consentSource", /como aceit|origem do consent/],
  ["cnpj", /cnpj/],
  ["company", /empresa|companhia|razao social|nome fantasia|company|organiza/],
  ["referredBy", /indicad|indicacao de|quem indicou/],
  ["consent", /consent|aceite|autoriz|opt.?in|lgpd/],
  ["email", /e.?mail|correio/],
  ["phone", /whats|telefone|celular|fone|^tel|phone|contato tel/],
  ["jobTitle", /cargo|funcao|posicao|job/],
  ["segment", /segmento|ramo|setor|nicho|area de atua/],
  ["city", /cidade|municipio|city|localidade/],
  ["source", /origem|fonte|canal|source/],
  ["notes", /observ|^obs|nota|coment|descri/],
  ["tags", /etiqueta|^tags?$|marcad/],
  ["name", /nome|^contato$|cliente|lead|^name/],
];

/** Best guess of which CRM field each column holds (null = ignore); each field is used once. */
export function guessMapping(headers: string[]): (CrmImportField | null)[] {
  const used = new Set<CrmImportField>();
  return headers.map((h) => {
    const t = h
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .trim();
    const hit = GUESS.find(([field, re]) => !used.has(field) && re.test(t));
    if (!hit) return null;
    used.add(hit[0]);
    return hit[0];
  });
}
