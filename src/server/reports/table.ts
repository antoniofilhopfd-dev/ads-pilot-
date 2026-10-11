import type { Fmt, Report } from "./types";

export type Col = { header: string; type: "text" | Fmt | "date" | "datetime" };
export type Cell = string | number | Date | null;
export type Table = { name: string; cols: Col[]; rows: Cell[][] };

import { brl, int, pct, ratio } from "@/lib/metrics";
export const fmtValue = (v: number | null, f: Fmt, cur: string) => (f === "money" ? brl(v, cur) : f === "int" ? int(v) : f === "pct" ? pct(v) : ratio(v));

const ORIGEM = (r: Report) => (r.meta.isDemo ? "DEMONSTRAÇÃO (dados simulados)" : "Meta Marketing API");

// Tabela principal de cada tipo de relatório — usada igualmente por CSV e XLSX (e conferida na verificação).
export function primaryTable(r: Report): Table {
  const m = r.meta;
  switch (r.config.type) {
    case "client":
    case "account":
      return {
        name: r.config.type === "client" ? "Por cliente" : "Por conta",
        cols: [{ header: r.config.type === "client" ? "Cliente" : "Conta", type: "text" }, { header: "Gasto", type: "money" }, { header: "Resultados", type: "int" }, { header: "Custo por resultado", type: "money" }, { header: "CTR (%)", type: "pct" }, { header: "Moeda", type: "text" }, { header: "Início do período", type: "date" }, { header: "Fim do período", type: "date" }, { header: "Origem", type: "text" }],
        rows: r.breakdown.map((b) => [b.label, b.spend, b.results, b.costPerResult, b.ctr, m.currency, m.since, m.until, ORIGEM(r)]),
      };
    case "spend_budget":
      return {
        name: "Orçamento e gasto",
        cols: [{ header: "Campanha", type: "text" }, { header: "Orçamento diário configurado na Meta", type: "money" }, { header: "Gasto informado pela Meta", type: "money" }, { header: "Gasto médio diário", type: "money" }, { header: "Previsão 30 dias (estimativa AdsPilot)", type: "money" }, { header: "Moeda", type: "text" }, { header: "Início do período", type: "date" }, { header: "Fim do período", type: "date" }, { header: "Origem", type: "text" }],
        rows: r.budget.map((b) => [b.campaign, b.configuredDaily, b.spend, b.avgDaily, b.projected30, m.currency, m.since, m.until, ORIGEM(r)]),
      };
    case "comparison":
      return {
        name: "Comparação",
        cols: [{ header: "Indicador", type: "text" }, { header: "Período atual", type: "text" }, { header: "Período anterior", type: "text" }, { header: "Variação (%)", type: "pct" }],
        rows: r.kpis.map((k) => [k.label, fmtValue(k.value, k.format, m.currency), fmtValue(k.prev, k.format, m.currency), k.change] as Cell[]),
      };
    case "changes":
      return {
        name: "Alterações",
        cols: [{ header: "Quando", type: "datetime" }, { header: "Alteração", type: "text" }, { header: "Quem", type: "text" }, { header: "Ambiente", type: "text" }, { header: "Resultado", type: "text" }],
        rows: r.changes.map((c) => [c.at, c.what, c.who, c.mode === "demo" ? "Simulação" : "Meta", c.result]),
      };
    case "alerts":
      return { name: "Alertas", cols: [{ header: "Gravidade", type: "text" }, { header: "Alerta", type: "text" }, { header: "Detalhe", type: "text" }], rows: r.alerts.map((a) => [a.tone === "danger" ? "Crítico" : "Atenção", a.title, a.detail]) };
    case "health":
      return {
        name: "Saúde",
        cols: [{ header: "Conta", type: "text" }, { header: "Última sincronização bem-sucedida", type: "datetime" }, { header: "Desatualizada", type: "text" }, { header: "Última tentativa", type: "text" }],
        rows: r.health.accounts.map((a) => [a.name, a.lastSuccess, a.stale ? "Sim" : "Não", a.lastStatus]),
      };
    default:
      return {
        name: "Campanhas",
        cols: [{ header: "Campanha", type: "text" }, { header: "Conta", type: "text" }, { header: "Cliente", type: "text" }, { header: "Status", type: "text" }, { header: "Objetivo", type: "text" }, { header: "Gasto", type: "money" }, { header: "Impressões", type: "int" }, { header: "Cliques", type: "int" }, { header: "Resultados", type: "int" }, { header: "Custo por resultado", type: "money" }, { header: "CTR (%)", type: "pct" }, { header: "CPC", type: "money" }, { header: "CPM", type: "money" }, { header: "ROAS", type: "ratio" }, { header: "Moeda", type: "text" }, { header: "Início do período", type: "date" }, { header: "Fim do período", type: "date" }, { header: "Última sincronização", type: "datetime" }, { header: "Origem", type: "text" }],
        rows: r.campaigns.map((c) => [c.name, c.accountName, c.clientName, c.effectiveStatus, c.objective, c.totals.spend, c.totals.impressions, c.totals.clicks, c.totals.results, c.totals.costPerResult, c.totals.ctr, c.totals.cpc, c.totals.cpm, c.totals.roas, c.currency, m.since, m.until, m.lastSyncedAt, ORIGEM(r)]),
      };
  }
}

export const slug = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
export const filenameFor = (r: Report, ext: string) => `adspilot-${r.config.type}-${r.meta.since}_${r.meta.until}.${ext}`;
