// Avaliação de experimentos A/B SEM declarar vencedor sem dados suficientes.
// Teste: duas proporções (z, bicaudal) para taxas (CTR = cliques/impressões; conversão = resultados/cliques).
// Para métricas de custo/retorno (CPA, CPL, ROAS, CPC) não há teste estatístico aqui: só comparação descritiva.
export type VariantData = { name: string; impressions: number | null; clicks: number | null; results: number | null; spend: number | null; purchaseValue?: number | null };
export type Verdict = { status: "sem_dados" | "amostra_insuficiente" | "inconclusivo" | "diferenca_significativa" | "descritivo"; leader: string | null; pValue: number | null; notes: string[] };

export const MIN_IMPRESSIONS = 1000, MIN_SUCCESSES = 30;

// Φ(x) — aproximação de Abramowitz-Stegun 7.1.26 (erro < 1,5e-7).
export function normalCdf(x: number) {
  const t = 1 / (1 + 0.3275911 * Math.abs(x) / Math.SQRT2);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-(x * x) / 2);
  return x >= 0 ? 0.5 * (1 + y) : 0.5 * (1 - y);
}

export function twoProportionP(x1: number, n1: number, x2: number, n2: number): number | null {
  if (n1 <= 0 || n2 <= 0) return null;
  const p = (x1 + x2) / (n1 + n2), se = Math.sqrt(p * (1 - p) * (1 / n1 + 1 / n2));
  if (se === 0) return null;
  const z = (x1 / n1 - x2 / n2) / se;
  return 2 * (1 - normalCdf(Math.abs(z)));
}

export function evaluateExperiment(metric: string, variants: VariantData[], alpha = 0.05): Verdict {
  const notes: string[] = [];
  const v = variants.filter((x) => x.impressions !== null);
  if (v.length < 2) return { status: "sem_dados", leader: null, pValue: null, notes: ["É preciso dados sincronizados de ao menos 2 variantes."] };
  if (metric === "ctr" || metric === "conversion_rate") {
    const pairs = v.map((x) => metric === "ctr" ? { name: x.name, s: x.clicks, n: x.impressions } : { name: x.name, s: x.results, n: x.clicks });
    if (pairs.some((p) => p.s === null || p.n === null)) return { status: "sem_dados", leader: null, pValue: null, notes: ["Faltam cliques/resultados em alguma variante (nulo não é zero)."] };
    const a = pairs[0] as { name: string; s: number; n: number }, b = pairs[1] as { name: string; s: number; n: number };
    if (pairs.length > 2) notes.push("Mais de 2 variantes: apenas as duas primeiras foram testadas; compare as demais com cautela (comparações múltiplas).");
    if (v.some((x) => (x.impressions ?? 0) < MIN_IMPRESSIONS) || a.s < MIN_SUCCESSES || b.s < MIN_SUCCESSES)
      return { status: "amostra_insuficiente", leader: null, pValue: null, notes: [`Amostra mínima: ${MIN_IMPRESSIONS} impressões e ${MIN_SUCCESSES} eventos por variante. Continue o teste.`, ...notes] };
    const p = twoProportionP(a.s, a.n, b.s, b.n);
    if (p === null) return { status: "inconclusivo", leader: null, pValue: null, notes };
    const leader = a.s / a.n > b.s / b.n ? a.name : b.name;
    if (p < alpha) return { status: "diferenca_significativa", leader, pValue: p, notes: [...notes, `p = ${p.toFixed(4)} (< ${alpha}). Significância estatística não garante efeito prático nem causalidade fora do teste.`] };
    return { status: "inconclusivo", leader: null, pValue: p, notes: [...notes, `p = ${p.toFixed(4)} (≥ ${alpha}): não há evidência suficiente de diferença.`] };
  }
  return { status: "descritivo", leader: null, pValue: null, notes: ["Para CPA, CPL, CPC e ROAS não há teste estatístico nesta versão: compare os valores e use o bom senso com amostras pequenas. Nenhum vencedor é declarado automaticamente."] };
}
