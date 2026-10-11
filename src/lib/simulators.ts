// Simuladores simples e transparentes. Todos retornam as premissas usadas.
const pos = (n: number) => Number.isFinite(n) && n > 0;
export type SimOut<T> = { ok: true; value: T; assumptions: string[] } | { ok: false; error: string };

// Resultados esperados dado orçamento e custo por resultado.
export function simResults(budget: number, cpr: number): SimOut<{ results: number }> {
  if (!pos(budget) || !pos(cpr)) return { ok: false, error: "Informe orçamento e custo por resultado maiores que zero." };
  return { ok: true, value: { results: budget / cpr }, assumptions: ["Custo por resultado constante (na prática tende a subir com escala).", "Não considera aprendizado, sazonalidade nem saturação."] };
}
// Orçamento necessário para uma meta de resultados.
export function simBudgetForResults(results: number, cpr: number): SimOut<{ budget: number }> {
  if (!pos(results) || !pos(cpr)) return { ok: false, error: "Informe resultados desejados e custo por resultado maiores que zero." };
  return { ok: true, value: { budget: results * cpr }, assumptions: ["Custo por resultado constante.", "Estimativa: o custo real pode variar."] };
}
// ROAS de equilíbrio a partir da margem de contribuição (%).
export function simBreakEvenRoas(marginPct: number): SimOut<{ roas: number; maxCpaPct: number }> {
  if (!Number.isFinite(marginPct) || marginPct <= 0 || marginPct > 100) return { ok: false, error: "Margem deve estar entre 0 e 100%." };
  return { ok: true, value: { roas: 100 / marginPct, maxCpaPct: marginPct }, assumptions: ["ROAS de equilíbrio = 1 ÷ margem (antes de outros custos fixos).", "Margem de contribuição = receita − custos variáveis (produto, frete, taxas, impostos)."] };
}
// CPA máximo e CPL máximo a partir do ticket e da taxa de conversão.
export function simMaxCpa(ticket: number, marginPct: number): SimOut<{ maxCpa: number }> {
  if (!pos(ticket) || !Number.isFinite(marginPct) || marginPct <= 0 || marginPct > 100) return { ok: false, error: "Informe ticket (>0) e margem entre 0 e 100%." };
  return { ok: true, value: { maxCpa: ticket * (marginPct / 100) }, assumptions: ["CPA máximo para não ter prejuízo na primeira venda = ticket × margem.", "Não considera recompra/LTV."] };
}
// Funil: impressões → cliques → leads → vendas.
export function simFunnel(budget: number, cpm: number, ctrPct: number, leadRatePct: number, closeRatePct: number, ticket: number | null): SimOut<{ impressions: number; clicks: number; leads: number; sales: number; revenue: number | null; cpl: number | null; cpa: number | null }> {
  if (![budget, cpm, ctrPct, leadRatePct].every(pos) || !Number.isFinite(closeRatePct) || closeRatePct < 0) return { ok: false, error: "Informe orçamento, CPM, CTR e taxa de lead maiores que zero." };
  const impressions = (budget / cpm) * 1000, clicks = impressions * (ctrPct / 100), leads = clicks * (leadRatePct / 100), sales = leads * (closeRatePct / 100);
  return { ok: true, value: { impressions, clicks, leads, sales, revenue: ticket && ticket > 0 ? sales * ticket : null, cpl: leads > 0 ? budget / leads : null, cpa: sales > 0 ? budget / sales : null },
    assumptions: ["Todas as taxas são constantes e informadas por você (não são previsão da Meta).", "Resultado é um cenário, não uma garantia."] };
}
