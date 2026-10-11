import { brl, int, pct } from "@/lib/metrics";
import type { Report } from "./types";

// Texto analítico gerado por REGRAS sobre os dados do relatório (sem IA generativa).
//  • Fatos: números e estados observados nos dados.
//  • Hipóteses: possíveis leituras, sempre marcadas como NÃO comprovadas (não afirmam causa).
//  • Recomendações: ações consultivas; nada é executado automaticamente.
//  • Limitações: o que impede conclusões firmes.
const fmtPct = (v: number) => `${v >= 0 ? "+" : "−"}${Math.abs(v).toFixed(1).replace(".", ",")}%`;

export function narrate(r: Report): Pick<Report, "facts" | "hypotheses" | "recommendations" | "limitations"> {
  const facts: string[] = [], hypotheses: string[] = [], recommendations: string[] = [], limitations: string[] = [];
  const cur = r.meta.currency;
  const k = (key: string) => r.kpis.find((x) => x.key === key);
  const spend = k("spend"), results = k("results"), cpr = k("costPerResult"), ctr = k("ctr");

  if (!r.meta.hasData) {
    limitations.push("Não há métricas sincronizadas para os filtros e o período selecionados; nenhum indicador foi calculado.");
  } else {
    if (spend?.value != null) facts.push(`Gasto informado pela Meta no período: ${brl(spend.value, cur)}${spend.change != null ? ` (${fmtPct(spend.change)} em relação ao período anterior)` : ""}.`);
    if (results?.value != null) facts.push(`Resultados informados: ${int(results.value)}${results.change != null ? ` (${fmtPct(results.change)})` : ""}.`);
    if (cpr?.value != null) facts.push(`Custo por resultado: ${brl(cpr.value, cur)}${cpr.change != null ? ` (${fmtPct(cpr.change)})` : ""}.`);
    const withSpend = r.campaigns.filter((c) => (c.totals.spend ?? 0) > 0).sort((a, b) => b.totals.spend! - a.totals.spend!);
    const total = spend?.value ?? 0;
    if (withSpend.length >= 3 && total > 0) {
      const share = (withSpend.slice(0, 3).reduce((a, c) => a + c.totals.spend!, 0) / total) * 100;
      facts.push(`${withSpend.length} campanhas tiveram gasto; as 3 maiores concentram ${share.toFixed(0)}% do gasto (${withSpend.slice(0, 3).map((c) => c.name).join(", ")}).`);
    }
    for (const a of r.alerts) if (a.tone === "danger") facts.push(`${a.title}.`);

    // Hipóteses: só quando os dados sugerem, sempre sem afirmar causa.
    if (spend?.change != null && results?.change != null && spend.change > 10 && results.change <= 0)
      hypotheses.push(`HIPÓTESE (não comprovada): o gasto subiu ${spend.change.toFixed(0)}% sem aumento de resultados; isso pode indicar perda de eficiência (público saturado, criativo desgastado ou custo de leilão maior). Este relatório não tem dados para confirmar a causa.`);
    if (ctr?.change != null && ctr.change < -10)
      hypotheses.push(`HIPÓTESE (não comprovada): a queda de ${Math.abs(ctr.change).toFixed(0)}% no CTR pode estar associada a fadiga de criativo ou mudança de público; correlação não é causa.`);
    const noResult = withSpend.filter((c) => c.totals.results === null && c.objective && c.objective !== "OUTCOME_AWARENESS");
    if (noResult.length)
      hypotheses.push(`HIPÓTESE (não comprovada): ${noResult.length} campanha(s) com gasto e sem resultado informado (${noResult.slice(0, 3).map((c) => c.name).join(", ")}) podem ter rastreamento/evento de conversão ausente ou objetivo sem mapeamento de resultado.`);

    // Recomendações consultivas
    if (r.alerts.some((a) => /reprovad/i.test(a.title))) recommendations.push("Revisar e corrigir, no Gerenciador de Anúncios, os anúncios reprovados; eles podem estar limitando a entrega.");
    if (noResult.length) recommendations.push(`Conferir objetivo e rastreamento das campanhas com gasto e sem resultado informado: ${noResult.slice(0, 5).map((c) => c.name).join(", ")}.`);
    if (hypotheses.some((h) => h.includes("perda de eficiência"))) recommendations.push("Avaliar criativos e públicos das campanhas de maior gasto; acompanhar o custo por resultado nos próximos dias antes de alterar orçamentos.");
    if (r.meta.stale) recommendations.push("Sincronizar as contas antes de tomar decisões: os dados estão desatualizados.");

    // Limitações
    const imps = r.kpis.find((x) => x.key === "impressions")?.value ?? 0;
    if ((results?.value ?? 0) < 30 || imps < 1000) limitations.push("Amostra pequena (menos de 30 resultados ou 1.000 impressões): variações percentuais são pouco confiáveis.");
    if (!r.meta.prevComparable) limitations.push(`Comparação omitida: o período anterior não está totalmente sincronizado${r.meta.coverageSince ? ` (dados desde ${r.meta.coverageSince.split("-").reverse().join("/")})` : ""}.`);
    if (r.meta.partialCurrent) limitations.push("O início do período selecionado não está coberto pelos dados sincronizados; totais podem estar incompletos.");
    limitations.push("Resultados usam a janela de atribuição padrão da conta na Meta e podem ser revisados pela Meta nos dias seguintes; podem diferir do Gerenciador de Anúncios.");
  }
  if (r.meta.mixedCurrency) limitations.push("Há contas com moedas diferentes: totais não foram somados. Filtre por uma conta.");
  if (r.meta.stale) limitations.push("Dados desatualizados (última sincronização há mais de 24 h ou ausente).");
  if (r.meta.isDemo) limitations.push("DADOS SIMULADOS (modo demonstração): não representam resultados reais nem vêm da Meta.");
  if (!facts.length && r.meta.hasData) facts.push("Sem fatos relevantes a destacar para o período.");
  void pct;
  return { facts, hypotheses, recommendations, limitations };
}

export const METHODOLOGY = [
  "Origem: API oficial da Meta (Marketing API), nível de campanha, por dia, no fuso da conta de anúncios. A data de última sincronização acompanha cada relatório.",
  "Gasto e orçamento: “gasto” é o valor informado pela Meta; “orçamento configurado” é o definido na Meta; “previsão” é cálculo do AdsPilot (gasto médio diário × 30), apenas estimativa. Limites internos do AdsPilot não bloqueiam gasto na Meta.",
  "Valores ausentes: se a Meta não informa um dado, ele aparece vazio (“—”); nunca é tratado como zero. Totais somam apenas valores informados.",
  "CTR = cliques ÷ impressões; CPC = gasto ÷ cliques; CPM = gasto ÷ impressões × 1.000; custo por resultado = gasto ÷ resultados (dias com ambos informados); ROAS = valor de compras ÷ gasto (exige valor de compra informado). Razões são recalculadas dos totais.",
  "Resultado = ação do objetivo da campanha (vendas: compras; cadastros: leads; tráfego: cliques no link; engajamento: engajamentos). Outros objetivos: resultado não calculado.",
  "Alcance e frequência não são somáveis entre dias e não aparecem em períodos de mais de um dia.",
  "Comparação: período imediatamente anterior, de mesma duração; só exibida quando totalmente sincronizado.",
];
