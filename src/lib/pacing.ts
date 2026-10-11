// Cálculos puros de ritmo e projeção de orçamento mensal. Sem acesso a banco: fáceis de testar.
//
// Premissas (mostradas ao usuário):
//  • Ritmo esperado: o orçamento é consumido de forma LINEAR ao longo dos dias do mês.
//  • Projeção de fechamento = gasto até hoje + (média diária dos últimos 7 dias com dado) × dias restantes.
//  • Com menos de 3 dias de dados, a projeção não é calculada (retorna null): evita "projetar" com amostra mínima.
//  • Gasto = valor REPORTADO pela Meta (não é limite de cobrança). Projeção é estimativa, não garantia.

export type DayRow = { date: string; spend: number | null };

export type Pacing = {
  period: string; daysInMonth: number; elapsedDays: number; remainingDays: number;
  amount: number; spent: number | null; consumptionPct: number | null;
  expectedSpent: number; paceRatio: number | null; // gasto ÷ esperado
  dailyAverage7: number | null; projectedClose: number | null; projectedPct: number | null;
  remaining: number | null; suggestedDaily: number | null; // quanto gastar por dia para fechar exatamente no orçamento
  milestonesReached: number[]; status: PacingStatus; daysWithData: number;
  assumptions: string[];
};
export type PacingStatus = "sem_dados" | "abaixo_do_ritmo" | "no_ritmo" | "acima_do_ritmo" | "projecao_excede" | "excedido" | "periodo_futuro";

export const daysInMonth = (period: string) => { const [y, m] = period.split("-").map(Number); return new Date(Date.UTC(y, m, 0)).getUTCDate(); };
export const isPeriod = (p: string) => /^\d{4}-(0[1-9]|1[0-2])$/.test(p);

export function computePacing(opts: { period: string; amount: number; rows: DayRow[]; today: string; milestones?: number[] }): Pacing {
  const { period, amount, today } = opts;
  const dim = daysInMonth(period), first = `${period}-01`, last = `${period}-${String(dim).padStart(2, "0")}`;
  const assumptions = [
    "Ritmo esperado: consumo linear do orçamento ao longo dos dias do mês.",
    "Projeção = gasto até hoje + média diária dos últimos 7 dias com dado × dias restantes (estimativa, não garantia).",
    "Gasto é o valor reportado pela Meta; não é limite de cobrança nem bloqueia gasto na Meta.",
  ];
  const base = { period, daysInMonth: dim, amount, assumptions };
  if (today < first) return { ...base, elapsedDays: 0, remainingDays: dim, spent: null, consumptionPct: null, expectedSpent: 0, paceRatio: null, dailyAverage7: null, projectedClose: null, projectedPct: null, remaining: amount, suggestedDaily: amount / dim, milestonesReached: [], status: "periodo_futuro", daysWithData: 0 };
  const asOf = today > last ? last : today;
  const elapsed = Number(asOf.slice(8, 10)), remainingDays = Math.max(dim - elapsed, 0);
  const inPeriod = opts.rows.filter((r) => r.date >= first && r.date <= asOf && r.spend !== null) as { date: string; spend: number }[];
  const byDay = new Map<string, number>();
  for (const r of inPeriod) byDay.set(r.date, (byDay.get(r.date) ?? 0) + r.spend);
  const daysWithData = byDay.size;
  const expectedSpent = (amount * elapsed) / dim;
  if (daysWithData === 0) return { ...base, elapsedDays: elapsed, remainingDays, spent: null, consumptionPct: null, expectedSpent, paceRatio: null, dailyAverage7: null, projectedClose: null, projectedPct: null, remaining: null, suggestedDaily: null, milestonesReached: [], status: "sem_dados", daysWithData };
  const spent = [...byDay.values()].reduce((a, b) => a + b, 0);
  const lastDays = [...byDay.entries()].sort(([a], [b]) => b.localeCompare(a)).slice(0, 7).map(([, v]) => v);
  const dailyAverage7 = lastDays.reduce((a, b) => a + b, 0) / lastDays.length;
  const projectedClose = daysWithData >= 3 ? spent + dailyAverage7 * remainingDays : null;
  const consumptionPct = (spent / amount) * 100;
  const paceRatio = expectedSpent > 0 ? spent / expectedSpent : null;
  const remaining = amount - spent;
  const milestonesReached = (opts.milestones ?? []).filter((m) => consumptionPct >= m).sort((a, b) => a - b);
  let status: PacingStatus;
  if (spent > amount) status = "excedido";
  else if (projectedClose !== null && projectedClose > amount * 1.02 && remainingDays > 0) status = "projecao_excede";
  else if (paceRatio !== null && paceRatio > 1.1) status = "acima_do_ritmo";
  else if (paceRatio !== null && paceRatio < 0.8 && remainingDays > 0) status = "abaixo_do_ritmo";
  else status = "no_ritmo";
  return { ...base, elapsedDays: elapsed, remainingDays, spent, consumptionPct, expectedSpent, paceRatio, dailyAverage7, projectedClose, projectedPct: projectedClose === null ? null : (projectedClose / amount) * 100, remaining, suggestedDaily: remainingDays > 0 ? Math.max(remaining, 0) / remainingDays : null, milestonesReached, status, daysWithData };
}

export const PACING_LABEL: Record<PacingStatus, string> = {
  sem_dados: "Sem dados no período", abaixo_do_ritmo: "Abaixo do ritmo", no_ritmo: "No ritmo", acima_do_ritmo: "Acima do ritmo",
  projecao_excede: "Projeção excede o orçamento", excedido: "Orçamento excedido", periodo_futuro: "Período futuro",
};

// ── Simulação de redistribuição ──
export type SimCampaign = { id: string; name: string; dailySpend: number; costPerResult: number | null };
export type SimChange = { id: string; newDaily: number };
export type SimResult = {
  rows: { id: string; name: string; currentDaily: number; newDaily: number; projectedSpendCurrent: number; projectedSpendNew: number; projectedResultsCurrent: number | null; projectedResultsNew: number | null }[];
  totals: { spendCurrent: number; spendNew: number; resultsCurrent: number | null; resultsNew: number | null; deltaSpend: number; deltaResults: number | null };
  assumptions: string[];
};

// Estimativa SIMPLES e transparente: gasto = diária × dias restantes; resultados = gasto ÷ custo por resultado atual (CPR constante).
export function simulateRedistribution(campaigns: SimCampaign[], changes: SimChange[], remainingDays: number): SimResult {
  const ch = new Map(changes.map((c) => [c.id, c.newDaily]));
  let spendCurrent = 0, spendNew = 0, resultsCurrent = 0, resultsNew = 0, unknown = false;
  const rows = campaigns.map((c) => {
    const newDaily = ch.has(c.id) ? ch.get(c.id)! : c.dailySpend;
    const projectedSpendCurrent = c.dailySpend * remainingDays, projectedSpendNew = newDaily * remainingDays;
    const known = !!c.costPerResult && c.costPerResult > 0;
    const projectedResultsCurrent = known ? projectedSpendCurrent / c.costPerResult! : null;
    const projectedResultsNew = known ? projectedSpendNew / c.costPerResult! : null;
    spendCurrent += projectedSpendCurrent; spendNew += projectedSpendNew;
    if (known) { resultsCurrent += projectedResultsCurrent!; resultsNew += projectedResultsNew!; } else if (projectedSpendCurrent > 0 || projectedSpendNew > 0) unknown = true;
    return { id: c.id, name: c.name, currentDaily: c.dailySpend, newDaily, projectedSpendCurrent, projectedSpendNew, projectedResultsCurrent, projectedResultsNew };
  });
  return {
    rows,
    totals: { spendCurrent, spendNew, resultsCurrent: unknown ? null : resultsCurrent, resultsNew: unknown ? null : resultsNew, deltaSpend: spendNew - spendCurrent, deltaResults: unknown ? null : resultsNew - resultsCurrent },
    assumptions: [
      "Gasto projetado = gasto diário × dias restantes.",
      "Resultados projetados = gasto ÷ custo por resultado ATUAL de cada campanha (custo constante).",
      "Não considera saturação de público, fase de aprendizado, sazonalidade nem mudanças no leilão: custos reais tendem a subir quando o orçamento aumenta.",
      "Se alguma campanha não tem custo por resultado informado, o total de resultados não é calculado (não é zero).",
    ],
  };
}
