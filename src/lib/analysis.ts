// Regras PURAS de alerta e diagnóstico. Sem banco, sem relógio: fáceis de testar.
// Princípios: nunca concluir com amostra pequena; null ≠ 0; hipótese ≠ fato; sem "benchmarks" sem fonte.
import type { AlertConfig } from "@/db/schema";
import { pctChange, type Totals } from "./metrics";

export type CampaignFacts = {
  id: string; name: string; accountId: string; accountName: string; currency: string; objective: string | null; effectiveStatus: string | null;
  cur: Totals; prev: Totals; // últimos 7 dias × 7 dias anteriores
  latestDay: { date: string; totals: Totals } | null; // dia mais recente COM dados
  recentZeroDelivery: boolean; // campanha ativa e todos os dias recentes com dado têm 0 impressão
  period: { since: string; until: string; prevSince: string; prevUntil: string };
};

export type Finding = {
  type: "no_delivery" | "cost_rise" | "ctr_drop" | "frequency_high";
  severity: "info" | "warning" | "critical"; title: string; message: string; facts: Record<string, string | number | null>; assumptions?: string[];
};

const f2 = (n: number | null, d = 2) => (n === null ? "—" : n.toFixed(d).replace(".", ","));
export const enoughSample = (t: Totals, cfg: AlertConfig) => (t.impressions ?? 0) >= cfg.minImpressions;
const enoughResults = (t: Totals, cfg: AlertConfig) => (t.results ?? 0) >= cfg.minResults;

export function campaignFindings(f: CampaignFacts, cfg: AlertConfig): Finding[] {
  const out: Finding[] = [];
  const on = (k: keyof AlertConfig["enabled"]) => cfg.enabled[k] !== false;
  if (on("no_delivery") && f.effectiveStatus === "ACTIVE" && f.recentZeroDelivery)
    out.push({ type: "no_delivery", severity: "critical", title: "Campanha ativa sem entrega", message: `A campanha está ativa, mas não teve impressões nos últimos ${cfg.noDeliveryDays} dia(s) com dados.`, facts: { status: f.effectiveStatus, impressoes: 0 } });
  const rise = pctChange(f.cur.costPerResult, f.prev.costPerResult);
  if (on("cost_rise") && rise !== null && rise >= cfg.costRisePct && enoughSample(f.cur, cfg) && enoughSample(f.prev, cfg) && enoughResults(f.cur, cfg) && enoughResults(f.prev, cfg))
    out.push({ type: "cost_rise", severity: rise >= cfg.costRisePct * 2 ? "critical" : "warning", title: "Custo por resultado subiu", message: `O custo por resultado subiu ${f2(rise, 1)}% (de ${f2(f.prev.costPerResult)} para ${f2(f.cur.costPerResult)}) em relação aos 7 dias anteriores.`,
      facts: { custo_atual: f.cur.costPerResult, custo_anterior: f.prev.costPerResult, variacao_pct: Math.round(rise * 10) / 10, resultados_atual: f.cur.results, resultados_anterior: f.prev.results }, assumptions: [`Limiar configurado: +${cfg.costRisePct}%. Mínimos: ${cfg.minImpressions} impressões e ${cfg.minResults} resultados em cada janela.`] });
  const drop = pctChange(f.cur.ctr, f.prev.ctr);
  if (on("ctr_drop") && drop !== null && drop <= -cfg.ctrDropPct && enoughSample(f.cur, cfg) && enoughSample(f.prev, cfg))
    out.push({ type: "ctr_drop", severity: "warning", title: "CTR caiu", message: `O CTR caiu ${f2(Math.abs(drop), 1)}% (de ${f2(f.prev.ctr)}% para ${f2(f.cur.ctr)}%) em relação aos 7 dias anteriores.`,
      facts: { ctr_atual: f.cur.ctr, ctr_anterior: f.prev.ctr, variacao_pct: Math.round(drop * 10) / 10 }, assumptions: [`Limiar configurado: −${cfg.ctrDropPct}%. Mínimo: ${cfg.minImpressions} impressões em cada janela.`] });
  const fr = f.latestDay?.totals.frequency ?? null;
  if (on("frequency_high") && fr !== null && fr >= cfg.frequencyMax && (f.latestDay!.totals.impressions ?? 0) >= cfg.minImpressions)
    out.push({ type: "frequency_high", severity: "warning", title: "Frequência alta", message: `Em ${f.latestDay!.date}, cada pessoa alcançada viu o anúncio em média ${f2(fr)} vezes.`, facts: { frequencia: Math.round(fr * 100) / 100, data: f.latestDay!.date },
      assumptions: [`Limiar configurado: ${cfg.frequencyMax}. Frequência só é confiável em 1 dia (alcance não soma entre dias).`] });
  return out;
}

// ───────────── Diagnóstico ─────────────
export type Diagnosis = {
  id: string; observation: string; period: string; data: Record<string, string | number | null>; comparison: string;
  hypothesis: string | null; // SEMPRE rotulada como não comprovada
  confidence: "baixa" | "média" | "alta"; recommendation: string; risks: string; nextAction: string; tone: "info" | "warn" | "danger" | "ok";
};

export function diagnose(f: CampaignFacts, cfg: AlertConfig): Diagnosis[] {
  const period = `${f.period.since} a ${f.period.until} (comparado com ${f.period.prevSince} a ${f.period.prevUntil})`;
  const base = { period };
  const out: Diagnosis[] = [];
  if (f.cur.impressions === null) return [{ ...base, id: "sem_dados", observation: "Não há dados sincronizados para esta campanha no período.", data: {}, comparison: "—", hypothesis: null, confidence: "alta", recommendation: "Sincronize a conta e confira se a campanha teve entrega.", risks: "Decidir sem dados.", nextAction: "Sincronizar em Integrações.", tone: "info" }];
  if (!enoughSample(f.cur, cfg))
    return [{ ...base, id: "amostra_pequena", observation: `Apenas ${f.cur.impressions} impressões nos últimos 7 dias (mínimo configurado: ${cfg.minImpressions}).`, data: { impressoes: f.cur.impressions }, comparison: "Amostra pequena demais para comparar.", hypothesis: null, confidence: "baixa",
      recommendation: "Não tire conclusões ainda. Deixe a campanha acumular dados.", risks: "Pausar ou otimizar com poucos dados costuma reagir a ruído.", nextAction: "Reavaliar quando atingir a amostra mínima.", tone: "info" }];

  if (f.recentZeroDelivery) out.push({ ...base, id: "sem_entrega", observation: "A campanha está ativa mas sem impressões nos dias recentes.", data: { status: f.effectiveStatus, impressoes: 0 }, comparison: "—",
    hypothesis: "Possíveis causas (não comprovadas): orçamento/lance muito baixo, reprovação de anúncio, público pequeno, problema de pagamento ou fim da programação.", confidence: "média",
    recommendation: "Verifique reprovações, forma de pagamento, programação e limites do conjunto no Gerenciador.", risks: "Perda de tempo de veiculação.", nextAction: "Abrir a campanha e conferir status dos anúncios.", tone: "danger" });

  const rise = pctChange(f.cur.costPerResult, f.prev.costPerResult);
  const ctrCh = pctChange(f.cur.ctr, f.prev.ctr);
  const convCh = pctChange(f.cur.conversionRate, f.prev.conversionRate);
  const fr = f.latestDay?.totals.frequency ?? null;
  const bothEnough = enoughSample(f.prev, cfg) && enoughResults(f.cur, cfg) && enoughResults(f.prev, cfg);
  if (rise !== null && bothEnough && rise >= cfg.costRisePct) {
    let hypothesis: string, rec: string, conf: Diagnosis["confidence"] = "baixa";
    if (ctrCh !== null && ctrCh <= -10 && fr !== null && fr >= 2.5) { hypothesis = "Hipótese (não comprovada): fadiga de criativo ou saturação do público — o CTR caiu enquanto a frequência está alta."; rec = "Teste criativos novos ou amplie o público; compare com o criativo atual em um experimento."; conf = "média"; }
    else if (ctrCh !== null && ctrCh > -10 && convCh !== null && convCh <= -15) { hypothesis = "Hipótese (não comprovada): o problema está depois do clique — página de destino, oferta ou rastreamento — pois o CTR se manteve e a conversão caiu."; rec = "Revise a página (velocidade, oferta), o pixel/eventos e as UTMs."; conf = "média"; }
    else { hypothesis = "Hipótese (não comprovada): variação de leilão/concorrência ou mudança recente na campanha; os dados disponíveis não distinguem a causa."; rec = "Verifique o histórico de alterações e a sazonalidade antes de agir."; }
    out.push({ ...base, id: "custo_subiu", observation: `O custo por resultado subiu ${f2(rise, 1)}%.`, data: { custo_atual: f.cur.costPerResult, custo_anterior: f.prev.costPerResult, ctr_atual: f.cur.ctr, ctr_anterior: f.prev.ctr, frequencia_ultimo_dia: fr, conversao_atual: f.cur.conversionRate, conversao_anterior: f.prev.conversionRate },
      comparison: `7 dias × 7 dias anteriores; CTR ${ctrCh === null ? "—" : f2(ctrCh, 1) + "%"}, conversão ${convCh === null ? "—" : f2(convCh, 1) + "%"}.`, hypothesis, confidence: conf, recommendation: rec,
      risks: "Duas janelas de 7 dias podem refletir variação normal; mudanças bruscas podem reiniciar o aprendizado.", nextAction: "Acompanhar por mais 3–4 dias antes de mudar orçamento; registrar a decisão.", tone: "warn" });
  } else if (rise !== null && bothEnough && rise <= -cfg.costRisePct) {
    out.push({ ...base, id: "custo_caiu", observation: `O custo por resultado caiu ${f2(Math.abs(rise), 1)}%.`, data: { custo_atual: f.cur.costPerResult, custo_anterior: f.prev.costPerResult }, comparison: "7 dias × 7 dias anteriores.",
      hypothesis: "Hipótese (não comprovada): melhora de criativo/público ou variação favorável do leilão; pode ser ruído.", confidence: "baixa", recommendation: "Não escale de uma vez; aumente o orçamento em passos pequenos observando o custo.", risks: "Escalar rápido pode piorar o custo e reiniciar o aprendizado.", nextAction: "Confirmar a tendência por mais alguns dias.", tone: "ok" });
  }
  if (out.length === 0) out.push({ ...base, id: "estavel", observation: "Nenhuma variação relevante detectada com a amostra atual.", data: { custo_por_resultado: f.cur.costPerResult, ctr: f.cur.ctr }, comparison: `Limiar configurado: ±${cfg.costRisePct}%.`, hypothesis: null, confidence: "média", recommendation: "Manter a observação.", risks: "Ausência de alerta não garante bom desempenho.", nextAction: "Reavaliar na próxima semana.", tone: "ok" });
  if ((f.cur.results ?? 0) < 50 && f.objective && f.objective !== "OUTCOME_AWARENESS" && f.objective !== "OUTCOME_TRAFFIC")
    out.push({ ...base, id: "aprendizado", observation: `${f.cur.results ?? 0} resultados em 7 dias.`, data: { resultados_7d: f.cur.results }, comparison: "Referência da Meta: cerca de 50 eventos de otimização por semana por conjunto para sair do aprendizado.", hypothesis: "Hipótese (não comprovada): o conjunto pode estar com aprendizado limitado.", confidence: "baixa", recommendation: "Considere consolidar conjuntos ou usar um evento mais frequente.", risks: "Consolidar muda a segmentação.", nextAction: "Conferir o status de aprendizado no Gerenciador.", tone: "info" });
  return out;
}
