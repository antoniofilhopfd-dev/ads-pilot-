import ExcelJS from "exceljs";
import { brl } from "@/lib/metrics";
import { clean } from "./pdf";
import { parseCsv } from "./csv";
import { primaryTable, type Table } from "./table";
import type { Report } from "./types";

export type Verification = { ok: boolean; checks: string[]; failures: string[] };

// Reabre o arquivo GERADO (não os dados em memória) e confere conteúdo, tipos e totais.
// Uma exportação só é considerada concluída se `ok` for verdadeiro.
class V {
  checks: string[] = []; failures: string[] = [];
  check(cond: boolean, okMsg: string, failMsg: string) { (cond ? this.checks : this.failures).push(cond ? okMsg : failMsg); }
  done(): Verification { return { ok: this.failures.length === 0, checks: this.checks, failures: this.failures }; }
}

const numericCols = (t: Table) => t.cols.map((c, i) => ({ c, i })).filter((x) => ["money", "int", "pct", "ratio"].includes(x.c.type));
const close = (a: number, b: number, tol: number) => Math.abs(a - b) <= tol;

export function verifyCsv(buf: Buffer, r: Report): Verification {
  const v = new V();
  const t = primaryTable(r);
  v.check(buf[0] === 0xef && buf[1] === 0xbb && buf[2] === 0xbf, "BOM UTF-8 presente", "BOM UTF-8 ausente");
  let rows: string[][] = [];
  try { rows = parseCsv(buf.subarray(3).toString("utf8")); v.check(true, "CSV válido (RFC 4180)", ""); } catch (e) { v.check(false, "", `CSV inválido: ${(e as Error).message}`); return v.done(); }
  v.check(rows[0]?.join("|") === t.cols.map((c) => c.header).join("|"), "Cabeçalho confere", "Cabeçalho difere do esperado");
  v.check(rows.length === t.rows.length + 1, `${t.rows.length} linhas de dados`, `Linhas: esperado ${t.rows.length + 1}, obtido ${rows.length}`);
  v.check(rows.every((x) => x.length === t.cols.length), "Todas as linhas têm o mesmo número de colunas", "Linhas com número de colunas inconsistente");
  for (const { c, i } of numericCols(t)) {
    const expected = t.rows.reduce((s, row) => s + (typeof row[i] === "number" ? (row[i] as number) : 0), 0);
    const nullsOk = t.rows.every((row, k) => (row[i] === null) === ((rows[k + 1]?.[i] ?? "") === ""));
    const got = rows.slice(1).reduce((s, row) => s + (row[i] === "" || row[i] === undefined ? 0 : Number(row[i])), 0);
    v.check(nullsOk, `“${c.header}”: ausentes continuam vazios (não viram zero)`, `“${c.header}”: valores ausentes divergem`);
    v.check(close(got, expected, 0.01 * Math.max(t.rows.length, 1)), `“${c.header}”: total confere`, `“${c.header}”: total ${got} ≠ ${expected}`);
  }
  const bad = rows.slice(1).some((row) => row.some((cell, i) => t.cols[i]?.type === "text" && /^[=+\-@]/.test(cell)));
  v.check(!bad, "Sem células de texto iniciadas por fórmula (CSV injection)", "Há célula de texto iniciada por =, +, - ou @");
  return v.done();
}

export async function verifyXlsx(buf: Buffer, r: Report): Promise<Verification> {
  const v = new V();
  const t = primaryTable(r);
  const wb = new ExcelJS.Workbook();
  try { await wb.xlsx.load(buf as unknown as ArrayBuffer); v.check(true, "XLSX abre sem erro", ""); } catch (e) { v.check(false, "", `XLSX inválido: ${(e as Error).message}`); return v.done(); }
  const names = wb.worksheets.map((w) => w.name);
  for (const n of ["Resumo", t.name.slice(0, 31), "Diário", "Análise e metodologia"]) v.check(names.includes(n), `Aba “${n}” presente`, `Aba “${n}” ausente`);
  const d = wb.getWorksheet(t.name.slice(0, 31));
  if (d) {
    v.check(d.rowCount === t.rows.length + 1, `${t.rows.length} linhas de dados`, `Linhas: esperado ${t.rows.length + 1}, obtido ${d.rowCount}`);
    v.check(t.cols.every((c, i) => String(d.getRow(1).getCell(i + 1).value) === c.header), "Cabeçalhos conferem", "Cabeçalhos divergem");
    v.check(!!d.autoFilter, "Filtro automático no cabeçalho", "Sem filtro automático");
    v.check(d.views?.[0]?.state === "frozen", "Cabeçalho congelado", "Cabeçalho não congelado");
    for (const { c, i } of numericCols(t)) {
      let sum = 0, typed = true, nullsOk = true;
      t.rows.forEach((row, k) => {
        const cell = d.getRow(k + 2).getCell(i + 1);
        if (row[i] === null) { if (cell.value !== null && cell.value !== undefined) nullsOk = false; return; }
        if (typeof cell.value !== "number") { typed = false; return; }
        sum += c.type === "pct" ? cell.value * 100 : cell.value;
      });
      const expected = t.rows.reduce((s, row) => s + (typeof row[i] === "number" ? (row[i] as number) : 0), 0);
      v.check(typed, `“${c.header}”: células numéricas (não texto)`, `“${c.header}”: há células que não são número`);
      v.check(nullsOk, `“${c.header}”: ausentes continuam vazios`, `“${c.header}”: ausente virou valor`);
      v.check(close(sum, expected, 0.01 * Math.max(t.rows.length, 1)), `“${c.header}”: total confere`, `“${c.header}”: total ${sum} ≠ ${expected}`);
    }
  }
  const resumo = wb.getWorksheet("Resumo");
  const resumoText = resumo ? resumo.getSheetValues().flat().map(String).join(" ") : "";
  v.check(resumoText.includes(r.meta.organization), "Resumo identifica a organização", "Resumo sem organização");
  v.check(!r.meta.isDemo || resumoText.includes("SIMULADOS"), "Aviso de dados simulados presente (quando aplicável)", "Falta aviso de dados simulados");
  // logo: presente exatamente quando a organização tem uma
  const imgs = resumo?.getImages().length ?? 0;
  v.check(r.meta.logo ? imgs === 1 : imgs === 0, r.meta.logo ? "Logo da empresa presente no Resumo" : "Sem logo (nenhuma cadastrada)", r.meta.logo ? "Logo cadastrada, mas ausente no XLSX" : "Imagem inesperada no XLSX");
  const dia = wb.getWorksheet("Diário");
  if (dia) v.check(dia.rowCount === r.daily.length + 1, "Aba Diário confere", `Diário: esperado ${r.daily.length + 1} linhas, obtido ${dia.rowCount}`);
  return v.done();
}

const norm = (s: string) => s.replace(/[  ]/g, " ").replace(/\s+/g, " ").trim();

export async function verifyPdf(buf: Buffer, r: Report): Promise<Verification> {
  const v = new V();
  if (buf.subarray(0, 5).toString() !== "%PDF-") { v.check(false, "", "Cabeçalho %PDF ausente"); return v.done(); }
  const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
  let pages: string[] = [];
  try {
    const doc = await pdfjs.getDocument({ data: new Uint8Array(buf), useSystemFonts: true, verbosity: 0 }).promise;
    for (let i = 1; i <= doc.numPages; i++) {
      const tc = await (await doc.getPage(i)).getTextContent();
      pages.push(norm(tc.items.map((it) => ("str" in it ? it.str : "")).join(" ")));
    }
    v.check(doc.numPages >= 1, `${doc.numPages} página(s)`, "PDF sem páginas");
    // logo: a primeira página deve conter ao menos uma imagem quando a organização tem logo (e nenhuma quando não tem)
    const ops = await (await doc.getPage(1)).getOperatorList();
    const imgOps = new Set<number>([pdfjs.OPS.paintImageXObject, pdfjs.OPS.paintInlineImageXObject].filter((x) => x !== undefined) as number[]);
    const hasImage = ops.fnArray.some((f: number) => imgOps.has(f));
    v.check(r.meta.logo ? hasImage : !hasImage, r.meta.logo ? "Logo da empresa desenhada na primeira página" : "Sem logo (nenhuma cadastrada)", r.meta.logo ? "Logo cadastrada, mas ausente no PDF" : "Imagem inesperada no PDF");
  } catch (e) { v.check(false, "", `PDF ilegível: ${(e as Error).message}`); return v.done(); }
  const all = pages.join(" ");
  const has = (s: string) => all.includes(norm(clean(s)));
  const m = r.meta, S = new Set(r.config.sections);
  v.check(has(m.organization), "Organização presente", "Organização ausente");
  v.check(has(r.title), "Título presente", "Título ausente");
  v.check(has(`${m.since.split("-").reverse().join("/")} a ${m.until.split("-").reverse().join("/")}`), "Período presente", "Período ausente");
  v.check(has("Última sincronização"), "Data da última sincronização presente", "Última sincronização ausente");
  v.check(pages.every((p, i) => p.includes(`Página ${i + 1} de ${pages.length}`)), "Rodapé “Página X de N” correto em todas as páginas", "Numeração de páginas incorreta");
  v.check(pages.every((p) => p.includes("AdsPilot")), "Cabeçalho em todas as páginas", "Cabeçalho ausente em alguma página");
  v.check(!m.isDemo || pages.every((p) => p.includes("DADOS SIMULADOS")), "Aviso de dados simulados em todas as páginas (quando aplicável)", "Falta aviso de dados simulados");
  const spend = r.kpis.find((k) => k.key === "spend")?.value;
  if ((S.has("kpis") || S.has("comparison")) && spend != null) v.check(has(brl(spend, m.currency)), "Gasto total confere com os dados", "Gasto total não encontrado no PDF");
  if (S.has("campaigns")) {
    const missing = r.campaigns.slice(0, 40).filter((c) => !has(c.name));
    v.check(missing.length === 0, "Nomes das campanhas presentes", `Campanhas ausentes no PDF: ${missing.map((c) => c.name).join(", ")}`);
  }
  if (S.has("methodology")) v.check(has("Metodologia e origem das métricas"), "Metodologia presente", "Metodologia ausente");
  return v.done();
}

export async function verifyExport(format: "pdf" | "xlsx" | "csv", buf: Buffer, r: Report): Promise<Verification> {
  return format === "csv" ? verifyCsv(buf, r) : format === "xlsx" ? verifyXlsx(buf, r) : verifyPdf(buf, r);
}
