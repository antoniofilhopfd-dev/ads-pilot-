import PDFDocument from "pdfkit";
import { brl, int, pct, ratio } from "@/lib/metrics";
import { statusInfo, objectiveLabel } from "@/lib/labels";
import { fmtValue } from "./table";
import type { Report } from "./types";

const C = { blue: "#243B80", violet: "#7557D9", text: "#202938", muted: "#5A6478", line: "#E4E8F0", ok: "#0F7A56", danger: "#C53030", warn: "#7A5200", band: "#F5F7FC" };
const M = { l: 40, r: 40, t: 70, b: 56 };
const W = 595.28 - M.l - M.r;

// Helvetica (padrão PDF) cobre o português; troca glifos fora do WinAnsi.
export const clean = (s: string) => s.replace(/→/g, "->").replace(/−/g, "-").replace(/≥/g, ">=").replace(/≠/g, "!=").replace(/[▲▼✔]/g, "").replace(/ /g, " ");
const dmy = (s: string) => s.split("-").reverse().join("/");
const dt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca");

export function generatePdf(r: Report): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margins: { top: M.t, bottom: M.b, left: M.l, right: M.r }, bufferPages: true, info: { Title: `AdsPilot - ${r.title}`, Author: "AdsPilot", Subject: `${r.meta.organization} ${r.meta.since} a ${r.meta.until}`, CreationDate: r.meta.generatedAt } });
    const chunks: Buffer[] = [];
    doc.on("data", (c) => chunks.push(c));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
    const m = r.meta, S = new Set(r.config.sections);
    const bottom = () => doc.page.height - M.b;
    const need = (h: number) => { if (doc.y + h > bottom()) doc.addPage(); };
    const txt = (s: string, o: PDFKit.Mixins.TextOptions & { x?: number; y?: number } = {}) => doc.text(clean(s), o.x ?? doc.x, o.y ?? doc.y, o);
    const h2 = (s: string) => { need(60); doc.moveDown(0.8); doc.font("Helvetica-Bold").fontSize(12).fillColor(C.blue); txt(s, { width: W }); doc.moveDown(0.3); doc.font("Helvetica").fontSize(9).fillColor(C.text); };
    const bullets = (items: string[], label?: string) => { for (const it of items) { need(30); doc.font("Helvetica").fontSize(9).fillColor(C.text); txt(`${label ? label + ": " : "• "}${it}`, { width: W, indent: 0 }); doc.moveDown(0.25); } };

    // ── Capa/topo
    doc.font("Helvetica-Bold").fontSize(20).fillColor(C.blue); txt(r.title, { width: W });
    doc.font("Helvetica").fontSize(10).fillColor(C.muted);
    txt(`${m.organization}${m.client ? ` · Cliente: ${m.client}` : ""}${m.account ? ` · Conta: ${m.account}` : ""}`, { width: W });
    txt(`Período analisado: ${dmy(m.since)} a ${dmy(m.until)} · Gerado em ${dt(m.generatedAt)} · Última sincronização: ${dt(m.lastSyncedAt)}${m.stale ? " (DESATUALIZADO)" : ""}`, { width: W });
    if (m.isDemo) { doc.moveDown(0.5); const y = doc.y; doc.rect(M.l, y, W, 22).fill("#FFF3D6"); doc.fillColor(C.warn).font("Helvetica-Bold").fontSize(9); txt("DADOS SIMULADOS (modo demonstração) - não vêm da Meta e não representam resultados reais.", { x: M.l + 8, y: y + 7, width: W - 16 }); doc.y = y + 28; }
    doc.fillColor(C.text).font("Helvetica").fontSize(9);

    // ── Resumo
    if (S.has("summary")) {
      h2("Resumo");
      if (r.facts.length) bullets(r.facts, "FATO");
      if (r.hypotheses.length) bullets(r.hypotheses.map((h) => h.replace(/^HIPÓTESE \(não comprovada\): /, "")), "HIPÓTESE (não comprovada)");
      if (r.recommendations.length) bullets(r.recommendations, "RECOMENDAÇÃO");
    }

    // ── KPIs
    if (S.has("kpis") || S.has("comparison")) {
      h2("Indicadores principais");
      const withCmp = S.has("comparison");
      const cols = withCmp ? [200, 100, 100, W - 400] : [W - 120, 120];
      tableHeader(doc, cols, withCmp ? ["Indicador", "Período atual", "Período anterior", "Variação"] : ["Indicador", "Valor"]);
      for (const k of r.kpis) {
        const row = [k.label, fmtValue(k.value, k.format, m.currency)];
        if (withCmp) row.push(fmtValue(k.prev, k.format, m.currency), k.change === null ? "-" : `${k.change >= 0 ? "+" : "-"}${Math.abs(k.change).toFixed(1).replace(".", ",")}%`);
        tableRow(doc, cols, row, [false, true, true, true], bottom(), () => tableHeader(doc, cols, withCmp ? ["Indicador", "Período atual", "Período anterior", "Variação"] : ["Indicador", "Valor"]));
      }
      if (withCmp && !m.prevComparable) { doc.moveDown(0.3); doc.fillColor(C.muted); txt("Comparação omitida: período anterior não totalmente sincronizado.", { width: W }); doc.fillColor(C.text); }
    }

    // ── Gráficos
    if (S.has("charts") && r.daily.length) {
      h2("Evolução diária");
      need(150);
      chart(doc, "Gasto por dia", r.daily.map((d) => d.spend), (v) => brl(v, m.currency).replace(/,\d\d$/, ""), C.blue);
      need(150);
      chart(doc, "Resultados por dia", r.daily.map((d) => d.results), (v) => int(v), C.violet);
      doc.fillColor(C.muted).fontSize(8); txt(`Lacunas na linha = a Meta não informou o dado naquele dia. De ${dmy(r.daily[0].date)} a ${dmy(r.daily.at(-1)!.date)}.`, { width: W }); doc.fillColor(C.text).fontSize(9);
    }

    // ── Quebra
    if (S.has("breakdown") && r.breakdown.length) {
      h2(r.config.type === "client" ? "Desempenho por cliente" : "Desempenho por conta");
      const cols = [190, 90, 80, 90, W - 450], hdr = ["Nome", "Gasto", "Resultados", "Custo/result.", "CTR"];
      tableHeader(doc, cols, hdr);
      for (const b of r.breakdown) tableRow(doc, cols, [b.label, brl(b.spend, m.currency), int(b.results), brl(b.costPerResult, m.currency), pct(b.ctr)], [false, true, true, true, true], bottom(), () => tableHeader(doc, cols, hdr));
    }

    // ── Campanhas
    if (S.has("campaigns") && r.campaigns.length) {
      h2(`Campanhas (${r.campaigns.length})`);
      const cols = [150, 70, 70, 60, 70, 50, W - 470], hdr = ["Campanha", "Status", "Gasto", "Result.", "Custo/res.", "CTR", "ROAS"];
      const ra = [false, false, true, true, true, true, true];
      tableHeader(doc, cols, hdr, ra);
      for (const c of r.campaigns) tableRow(doc, cols, [c.name, statusInfo(c.effectiveStatus).label, brl(c.totals.spend, c.currency), int(c.totals.results), brl(c.totals.costPerResult, c.currency), pct(c.totals.ctr), ratio(c.totals.roas)], ra, bottom(), () => tableHeader(doc, cols, hdr, ra));
      doc.moveDown(0.3); doc.fillColor(C.muted).fontSize(8); txt(`"—" = a Meta não informou o dado. Objetivos: ${[...new Set(r.campaigns.map((c) => objectiveLabel(c.objective)))].join(", ")}.`, { width: W }); doc.fillColor(C.text).fontSize(9);
    }

    // ── Variações
    if (S.has("variations")) {
      h2("Variações relevantes vs. período anterior");
      if (!r.variations.length) { txt(m.prevComparable ? "Nenhuma variação de 20% ou mais (com base mínima de R$ 50 no período anterior)." : "Indisponível: período anterior não totalmente sincronizado.", { width: W }); }
      else { const cols = [190, 100, 90, 90, W - 470], hdr = ["Campanha", "Métrica", "Atual", "Anterior", "Variação"], ra = [false, false, true, true, true]; tableHeader(doc, cols, hdr, ra);
        for (const v of r.variations) tableRow(doc, cols, [v.name, v.metric, fmtValue(v.curr, v.format, m.currency), fmtValue(v.prev, v.format, m.currency), `${v.change >= 0 ? "+" : "-"}${Math.abs(v.change).toFixed(0)}%`], ra, bottom(), () => tableHeader(doc, cols, hdr, ra)); }
    }

    // ── Orçamento
    if (S.has("budget") && r.budget.length) {
      h2("Orçamento e gasto");
      const cols = [170, 90, 90, 80, W - 430], hdr = ["Campanha", "Orçamento diário (Meta)", "Gasto (Meta)", "Média diária", "Previsão 30 d (estim.)"];
      tableHeader(doc, cols, hdr);
      for (const b of r.budget) tableRow(doc, cols, [b.campaign, brl(b.configuredDaily, m.currency), brl(b.spend, m.currency), brl(b.avgDaily, m.currency), brl(b.projected30, m.currency)], [false, true, true, true, true], bottom(), () => tableHeader(doc, cols, hdr));
      doc.moveDown(0.3); doc.fillColor(C.muted).fontSize(8); txt("Previsão = média diária × 30 (estimativa do AdsPilot). Limites internos do AdsPilot não bloqueiam gasto na Meta.", { width: W }); doc.fillColor(C.text).fontSize(9);
    }

    // ── Alertas
    if (S.has("alerts")) { h2("Alertas"); if (!r.alerts.length) txt("Nada a sinalizar com base nos dados sincronizados.", { width: W }); for (const a of r.alerts) { need(30); doc.fillColor(a.tone === "danger" ? C.danger : C.warn).font("Helvetica-Bold"); txt(`${a.tone === "danger" ? "CRÍTICO" : "ATENÇÃO"}: ${a.title}`, { width: W }); doc.fillColor(C.text).font("Helvetica"); txt(a.detail, { width: W }); doc.moveDown(0.3); } }

    // ── Alterações
    if (S.has("changes")) { h2("Alterações (operações no período)"); if (!r.changes.length) txt("Nenhuma operação registrada no período.", { width: W });
      else { const cols = [95, 230, 90, W - 415], hdr = ["Quando", "Alteração", "Quem", "Resultado"], ra = [false, false, false, false]; tableHeader(doc, cols, hdr, ra);
        for (const c of r.changes) tableRow(doc, cols, [dt(c.at), `${c.what}${c.mode === "demo" ? " (simulação)" : ""}`, c.who ?? "-", c.result], ra, bottom(), () => tableHeader(doc, cols, hdr, ra)); } }

    // ── Saúde
    if (S.has("health")) { h2("Saúde das integrações"); txt(`Estado geral: ${r.health.state}`, { width: W }); bullets(r.health.instructions);
      const cols = [230, 150, W - 380], hdr = ["Conta", "Última sync bem-sucedida", "Desatualizada"], ra = [false, false, false]; tableHeader(doc, cols, hdr, ra);
      for (const a of r.health.accounts) tableRow(doc, cols, [a.name, dt(a.lastSuccess), a.stale ? "Sim" : "Não"], ra, bottom(), () => tableHeader(doc, cols, hdr, ra)); }

    // ── Limitações e metodologia
    if (S.has("recommendations") && (r.limitations.length || (!S.has("summary") && (r.recommendations.length || r.hypotheses.length)))) {
      h2("Limitações e observações");
      if (!S.has("summary")) { bullets(r.hypotheses.map((h) => h.replace(/^HIPÓTESE \(não comprovada\): /, "")), "HIPÓTESE (não comprovada)"); bullets(r.recommendations, "RECOMENDAÇÃO"); }
      bullets(r.limitations);
    }
    if (S.has("methodology")) { h2("Metodologia e origem das métricas"); bullets(r.methodology); }

    // ── Cabeçalho e rodapé em todas as páginas (com "Página X de N")
    const range = doc.bufferedPageRange();
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i);
      const prev = { ...doc.page.margins };
      doc.page.margins = { top: 0, bottom: 0, left: M.l, right: M.r };
      doc.font("Helvetica-Bold").fontSize(9).fillColor(C.blue); doc.text("AdsPilot", M.l, 28, { width: 100, lineBreak: false });
      doc.font("Helvetica").fillColor(C.muted).text(clean(`${r.title} · ${m.organization}`), M.l + 100, 28, { width: W - 100, align: "right", lineBreak: false });
      doc.moveTo(M.l, 48).lineTo(M.l + W, 48).strokeColor(C.line).stroke();
      const fy = doc.page.height - 38;
      doc.moveTo(M.l, fy - 8).lineTo(M.l + W, fy - 8).strokeColor(C.line).stroke();
      doc.fontSize(8).fillColor(C.muted).text(clean(`${m.isDemo ? "DADOS SIMULADOS · " : ""}Última sincronização: ${dt(m.lastSyncedAt)} · Gerado em ${dt(m.generatedAt)}`), M.l, fy, { width: W - 90, lineBreak: false });
      doc.text(`Página ${i + 1} de ${range.count}`, M.l + W - 90, fy, { width: 90, align: "right", lineBreak: false });
      doc.page.margins = prev;
    }
    doc.end();
  });
}

function tableHeader(doc: PDFKit.PDFDocument, cols: number[], cells: string[], right?: boolean[]) {
  const y = doc.y; let x = M.l;
  doc.rect(M.l, y, W, 16).fill(C.blue);
  doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF");
  cells.forEach((c, i) => { doc.text(clean(c), x + 4, y + 4, { width: cols[i] - 8, lineBreak: false, align: (right ? right[i] : i !== 0) ? "right" : "left" }); x += cols[i]; });
  doc.y = y + 18; doc.font("Helvetica").fontSize(9).fillColor(C.text);
}

function tableRow(doc: PDFKit.PDFDocument, cols: number[], cells: string[], right: boolean[], bottomY: number, onNewPage: () => void) {
  doc.font("Helvetica").fontSize(8.5);
  const h = Math.max(...cells.map((c, i) => doc.heightOfString(clean(c), { width: cols[i] - 8 }))) + 6;
  if (doc.y + h > bottomY) { doc.addPage(); onNewPage(); doc.font("Helvetica").fontSize(8.5); }
  const y = doc.y; let x = M.l;
  cells.forEach((c, i) => { doc.fillColor(C.text).text(clean(c), x + 4, y + 3, { width: cols[i] - 8, align: right[i] ? "right" : "left" }); x += cols[i]; });
  doc.moveTo(M.l, y + h).lineTo(M.l + W, y + h).strokeColor(C.line).lineWidth(0.5).stroke();
  doc.x = M.l; doc.y = y + h;
}

function chart(doc: PDFKit.PDFDocument, title: string, data: (number | null)[], fmt: (v: number) => string, color: string) {
  const x0 = M.l + 52, y0 = doc.y + 14, w = W - 60, h = 100;
  doc.font("Helvetica-Bold").fontSize(9).fillColor(C.text).text(clean(title), M.l, doc.y, { width: W });
  const vals = data.filter((v): v is number => v !== null);
  const max = Math.max(...vals, 1);
  doc.font("Helvetica").fontSize(7).fillColor(C.muted);
  for (const t of [0, 0.5, 1]) { const y = y0 + h - t * h; doc.moveTo(x0, y).lineTo(x0 + w, y).strokeColor(C.line).lineWidth(0.5).stroke(); doc.text(clean(fmt(max * t)), M.l, y - 3, { width: 48, align: "right", lineBreak: false }); }
  const px = (i: number) => x0 + (data.length === 1 ? w / 2 : (i * w) / (data.length - 1));
  const py = (v: number) => y0 + h - (v / max) * h;
  doc.strokeColor(color).lineWidth(1.4);
  let pen = false;
  data.forEach((v, i) => { if (v === null) { pen = false; return; } if (!pen) { doc.moveTo(px(i), py(v)); pen = true; } else doc.lineTo(px(i), py(v)); doc.stroke(); doc.moveTo(px(i), py(v)); });
  doc.lineWidth(1).fillColor(C.text); doc.x = M.l; doc.y = y0 + h + 14;
}
