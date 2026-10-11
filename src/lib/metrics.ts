// Fórmulas e regras de agregação das métricas. Fonte única usada por dashboard, tabelas e (futuramente) relatórios.
//
// Regras:
//  • Somas (gasto, impressões, cliques, resultados, valor de compra): soma apenas valores informados.
//    Se NENHUMA linha informou o campo, o total é null ("sem dados"), nunca 0.
//  • Razões (CTR, CPC, CPM, custo/resultado, ROAS) são recalculadas a partir dos TOTAIS (nunca média de razões).
//    Se o denominador é nulo ou 0, a razão é null.
//  • Alcance e frequência NÃO são aditivos entre dias (pessoas se repetem). Em períodos de mais de 1 dia
//    o alcance agregado é null; só é exibido em recortes de 1 dia.
//  • Custo por resultado e ROAS só consideram linhas em que gasto E resultado/valor foram informados.
//    ROAS exige valor de compra informado (objetivo de vendas com receita atribuída).
export type Row = {
  spend: number | null; impressions: number | null; reach: number | null; clicks: number | null;
  results: number | null; purchaseValue: number | null;
};

export type Totals = {
  spend: number | null; impressions: number | null; reach: number | null; clicks: number | null; results: number | null;
  purchaseValue: number | null; ctr: number | null; cpc: number | null; cpm: number | null; costPerResult: number | null;
  roas: number | null; frequency: number | null; days: number;
};

const sum = (xs: (number | null)[]) => {
  const v = xs.filter((x): x is number => x !== null);
  return v.length ? v.reduce((a, b) => a + b, 0) : null;
};
const div = (a: number | null, b: number | null) => (a === null || b === null || b === 0 ? null : a / b);

export function aggregate(rows: (Row & { date?: string })[]): Totals {
  const spend = sum(rows.map((r) => r.spend));
  const impressions = sum(rows.map((r) => r.impressions));
  const clicks = sum(rows.map((r) => r.clicks));
  const results = sum(rows.map((r) => r.results));
  const purchaseValue = sum(rows.map((r) => r.purchaseValue));
  const dates = new Set(rows.map((r) => r.date).filter(Boolean));
  const days = dates.size || (rows.length ? 1 : 0);
  const single = days <= 1;
  const reach = single ? sum(rows.map((r) => r.reach)) : null;

  // pares consistentes para razões que combinam duas colunas
  const paired = rows.filter((r) => r.spend !== null && r.results !== null);
  const pairedSpend = sum(paired.map((r) => r.spend));
  const pairedResults = sum(paired.map((r) => r.results));
  const roasRows = rows.filter((r) => r.spend !== null && r.purchaseValue !== null);

  return {
    spend, impressions, reach, clicks, results, purchaseValue, days,
    ctr: div(clicks, impressions) === null ? null : (clicks! / impressions!) * 100,
    cpc: div(spend, clicks),
    cpm: div(spend, impressions) === null ? null : (spend! / impressions!) * 1000,
    costPerResult: div(pairedSpend, pairedResults),
    roas: div(sum(roasRows.map((r) => r.purchaseValue)), sum(roasRows.map((r) => r.spend))),
    frequency: single ? div(impressions, reach) : null,
  };
}

// Variação percentual vs. período anterior; null quando não comparável.
export function pctChange(curr: number | null, prev: number | null): number | null {
  if (curr === null || prev === null || prev === 0) return null;
  return ((curr - prev) / prev) * 100;
}

export const brl = (v: number | null, currency = "BRL") =>
  v === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency }).format(v);
export const int = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("pt-BR").format(Math.round(v)));
export const pct = (v: number | null, d = 2) => (v === null ? "—" : `${v.toFixed(d).replace(".", ",")}%`);
export const ratio = (v: number | null) => (v === null ? "—" : `${v.toFixed(2).replace(".", ",")}x`);
export const brl0 = (v: number | null, currency = "BRL") =>
  v === null ? "—" : new Intl.NumberFormat("pt-BR", { style: "currency", currency, maximumFractionDigits: 0 }).format(v);
