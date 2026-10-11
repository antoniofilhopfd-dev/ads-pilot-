import { primaryTable, type Cell, type Table } from "./table";
import type { Report } from "./types";

// CSV: UTF-8 com BOM, separador vírgula, ponto decimal, fim de linha CRLF (RFC 4180), datas ISO.
// Valor ausente = célula vazia (nunca 0). Texto iniciado por = + - @ é neutralizado (CSV injection).
const FORMULA = /^[=+\-@\t\r]/;

export function csvCell(c: Cell, type: string): string {
  if (c === null || c === undefined) return "";
  if (c instanceof Date) return type === "date" ? c.toISOString().slice(0, 10) : c.toISOString();
  if (typeof c === "number") return type === "int" ? String(Math.round(c)) : String(Math.round(c * 100) / 100);
  const t = FORMULA.test(c) && type === "text" ? `'${c}` : c;
  return /[",\r\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
}

export function toCsv(t: Table): string {
  const head = t.cols.map((c) => csvCell(c.header, "text")).join(",");
  const lines = t.rows.map((row) => row.map((c, i) => csvCell(c, t.cols[i].type)).join(","));
  return [head, ...lines].join("\r\n") + "\r\n";
}

export function generateCsv(r: Report): Buffer {
  return Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(toCsv(primaryTable(r)), "utf8")]);
}

// Parser RFC 4180 estrito (usado na verificação).
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], cell = "", q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (q) {
      if (ch === '"') { if (text[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cell); cell = ""; }
    else if (ch === "\r" && text[i + 1] === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; i++; }
    else if (ch === "\n") { row.push(cell); rows.push(row); row = []; cell = ""; }
    else cell += ch;
  }
  if (q) throw new Error("aspas não fechadas");
  if (cell !== "" || row.length) { row.push(cell); rows.push(row); }
  return rows;
}
