import ExcelJS from "exceljs";
import { fmtValue, primaryTable, type Cell } from "./table";
import type { Report } from "./types";

const FMT = { money: (cur: string) => (cur === "BRL" ? '"R$" #,##0.00' : `#,##0.00 "${cur}"`), int: () => "#,##0", pct: () => "0.00%", ratio: () => '0.00"x"', date: () => "dd/mm/yyyy", datetime: () => "dd/mm/yyyy hh:mm", text: () => "@" } as const;
const BLUE = "FF243B80";
const toDate = (s: string) => new Date(s + "T00:00:00Z");

export async function generateXlsx(r: Report): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = "AdsPilot"; wb.created = r.meta.generatedAt; wb.title = r.title;
  const m = r.meta;

  // ── Resumo
  const s = wb.addWorksheet("Resumo");
  s.columns = [{ width: 34 }, { width: 22 }, { width: 22 }, { width: 14 }];
  if (m.logo) {
    for (let i = 1; i <= 3; i++) s.getRow(i).height = 22;
    const sc = Math.min(190 / m.logo.width, 62 / m.logo.height);
    const id = wb.addImage({ buffer: m.logo.data as unknown as ExcelJS.Buffer, extension: m.logo.ext });
    s.addImage(id, { tl: { col: 0, row: 0 }, ext: { width: m.logo.width * sc, height: m.logo.height * sc } });
    s.addRows([[], [], []]); // espaço para a logo
  }
  s.addRow([`AdsPilot — ${r.title}`]).font = { bold: true, size: 14, color: { argb: BLUE } };
  if (m.isDemo) { const row = s.addRow(["DADOS SIMULADOS (modo demonstração): não vêm da Meta."]); row.font = { bold: true, color: { argb: "FF7A5200" } }; }
  for (const [k, v] of [["Organização", m.organization], ["Cliente", m.client ?? "Todos"], ["Conta", m.account ?? "Todas"], ["Período", `${m.since.split("-").reverse().join("/")} a ${m.until.split("-").reverse().join("/")}`], ["Gerado em", m.generatedAt], ["Última sincronização", m.lastSyncedAt ?? "Nunca"]] as [string, string | Date][]) {
    const row = s.addRow([k, v]); row.getCell(1).font = { bold: true };
    if (v instanceof Date) row.getCell(2).numFmt = FMT.datetime();
  }
  s.addRow([]);
  const head = s.addRow(["Indicador", "Período atual", "Período anterior", "Variação"]);
  head.font = { bold: true, color: { argb: "FFFFFFFF" } }; head.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } }; });
  for (const k of r.kpis) {
    const row = s.addRow([k.label, k.value === null ? null : k.format === "pct" ? k.value / 100 : k.value, k.prev === null ? null : k.format === "pct" ? k.prev / 100 : k.prev, k.change === null ? null : k.change / 100]);
    row.getCell(2).numFmt = row.getCell(3).numFmt = k.format === "money" ? FMT.money(m.currency) : FMT[k.format]();
    row.getCell(4).numFmt = "+0.0%;-0.0%;0.0%";
  }
  void fmtValue;

  // ── Dados (tabela principal, com tipos reais, filtro e cabeçalho fixo)
  const t = primaryTable(r);
  const d = wb.addWorksheet(t.name.slice(0, 31));
  d.addRow(t.cols.map((c) => c.header));
  for (const row of t.rows) {
    d.addRow(row.map((c: Cell, i) => {
      const ty = t.cols[i].type;
      if (c === null || c === undefined) return null; // ausente = célula vazia
      if (ty === "date" && typeof c === "string") return toDate(c);
      if (ty === "pct" && typeof c === "number") return c / 100;
      return c;
    }));
  }
  t.cols.forEach((c, i) => {
    const col = d.getColumn(i + 1);
    col.numFmt = c.type === "money" ? FMT.money(m.currency) : FMT[c.type]();
    col.width = c.type === "text" ? Math.min(Math.max(c.header.length + 4, 18), 44) : Math.max(c.header.length + 2, 14);
  });
  const hr = d.getRow(1);
  hr.font = { bold: true, color: { argb: "FFFFFFFF" } }; hr.alignment = { vertical: "middle", wrapText: true }; hr.height = 32;
  hr.eachCell((c) => { c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BLUE } }; });
  d.views = [{ state: "frozen", ySplit: 1 }];
  d.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: t.cols.length } };

  // ── Diário
  const dd = wb.addWorksheet("Diário");
  dd.addRow(["Data", "Gasto", "Impressões", "Cliques", "Resultados"]);
  for (const x of r.daily) dd.addRow([toDate(x.date), x.spend, x.impressions, x.clicks, x.results]);
  dd.getColumn(1).numFmt = FMT.date(); dd.getColumn(2).numFmt = FMT.money(m.currency); for (const i of [3, 4, 5]) dd.getColumn(i).numFmt = FMT.int();
  dd.columns.forEach((c) => { c.width = 16; });
  dd.getRow(1).font = { bold: true }; dd.views = [{ state: "frozen", ySplit: 1 }];

  // ── Análise e metodologia
  const n = wb.addWorksheet("Análise e metodologia");
  n.getColumn(1).width = 22; n.getColumn(2).width = 120;
  const block = (label: string, items: string[]) => { for (const it of items) { const row = n.addRow([label, it]); row.getCell(1).font = { bold: true }; row.getCell(2).alignment = { wrapText: true, vertical: "top" }; } };
  block("Fato", r.facts); block("Hipótese", r.hypotheses); block("Recomendação", r.recommendations); block("Limitação", r.limitations); block("Metodologia", r.methodology);

  return Buffer.from(await wb.xlsx.writeBuffer());
}
