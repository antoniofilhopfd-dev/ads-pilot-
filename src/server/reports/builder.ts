import { and, eq, gte, lte } from "drizzle-orm";
import { db } from "@/db";
import { campaigns, operations, organizations, users, adAccounts } from "@/db/schema";
import { aggregate, pctChange, type Totals } from "@/lib/metrics";
import { AppError } from "@/lib/errors";
import { accountCond, assertCan, type Actor } from "../context";
import { getOverview, loadCampaigns, resolvePeriod } from "../insights";
import { getHealth } from "../meta/health";
import { listClients } from "../services/clients";
import { getLogo } from "../services/logo";
import { METHODOLOGY, narrate } from "./narrative";
import { DEFAULT_SECTIONS, REPORT_TYPES, SECTIONS, TYPE_LABEL, type Fmt, type Kpi, type Report, type ReportConfig } from "./types";

export function parseConfig(input: Record<string, string | string[] | undefined>): ReportConfig {
  const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v) || undefined;
  const type = REPORT_TYPES.find((t) => t === one(input.tipo)) ?? "executive";
  const days = ([7, 30, 90] as const).find((d) => d === Number(one(input.dias))) ?? 30;
  const raw = ([] as string[]).concat(input.secoes ?? []).flatMap((s) => s.split(","));
  const sections = SECTIONS.filter((s) => raw.includes(s));
  return { type, days, clientId: one(input.cliente), accountId: one(input.conta), sections: sections.length ? sections : DEFAULT_SECTIONS[type] };
}

const kpi = (key: string, label: string, format: Fmt, cur: number | null, prev: number | null, comparable: boolean, lowerIsBetter = false): Kpi =>
  ({ key, label, value: cur, prev: comparable ? prev : null, change: comparable ? pctChange(cur, prev) : null, format, lowerIsBetter });

export async function buildReport(actor: Actor, config: ReportConfig, now = new Date()): Promise<Report> {
  assertCan(actor, "insights.read");
  const p = resolvePeriod(config.days, now);
  const f = { ...p, clientId: config.clientId, accountId: config.accountId };
  const [ov, org, clients] = await Promise.all([getOverview(actor, f, now), db.select({ name: organizations.name }).from(organizations).where(eq(organizations.id, actor.organizationId)), listClients(actor)]);
  const clientName = (id: string | null) => clients.find((c) => c.id === id)?.name ?? null;
  if (config.clientId && !clients.some((c) => c.id === config.clientId)) throw new AppError("not_found", "Cliente não encontrado.");
  let accountName: string | null = null;
  if (config.accountId) {
    const [a] = await db.select({ name: adAccounts.name }).from(adAccounts).where(and(eq(adAccounts.id, config.accountId), eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id)));
    if (!a) throw new AppError("not_found", "Conta não encontrada.");
    accountName = a.name;
  }

  const allCamps = (await loadCampaigns(actor, f)).map((c) => ({ ...c, clientName: clientName(c.clientId) })).sort((a, b) => (b.totals.spend ?? -1) - (a.totals.spend ?? -1));
  const prevCamps = ov.prevComparable ? await loadCampaigns(actor, { ...f, since: p.prevSince, until: p.prevUntil }) : [];
  const prevById = new Map(prevCamps.map((c) => [c.id, c.totals]));
  const t = ov.totals, pv = ov.prevTotals, cmp = ov.prevComparable && !ov.mixedCurrency;

  const kpis: Kpi[] = [
    kpi("spend", "Gasto (informado pela Meta)", "money", t.spend, pv.spend, cmp),
    kpi("impressions", "Impressões", "int", t.impressions, pv.impressions, cmp),
    kpi("clicks", "Cliques", "int", t.clicks, pv.clicks, cmp),
    kpi("results", "Resultados", "int", t.results, pv.results, cmp),
    kpi("costPerResult", "Custo por resultado", "money", t.costPerResult, pv.costPerResult, cmp, true),
    kpi("ctr", "CTR", "pct", t.ctr, pv.ctr, cmp),
    kpi("cpc", "CPC", "money", t.cpc, pv.cpc, cmp, true),
    kpi("cpm", "CPM", "money", t.cpm, pv.cpm, cmp, true),
    kpi("roas", "ROAS", "ratio", t.roas, pv.roas, cmp),
  ];

  // variações relevantes: ≥ 20% e base mínima, nas métricas gasto e custo por resultado
  const variations: Report["variations"] = [];
  for (const c of allCamps) {
    const pt = prevById.get(c.id);
    if (!pt) continue;
    for (const [metric, cu, pr, format] of [["Gasto", c.totals.spend, pt.spend, "money"], ["Custo por resultado", c.totals.costPerResult, pt.costPerResult, "money"]] as [string, number | null, number | null, Fmt][]) {
      const ch = pctChange(cu, pr);
      if (ch !== null && Math.abs(ch) >= 20 && (pr ?? 0) >= 50) variations.push({ name: c.name, metric, curr: cu, prev: pr, change: ch, format });
    }
  }
  variations.sort((a, b) => Math.abs(b.change) - Math.abs(a.change));

  // quebra por conta (ou por cliente, em relatórios de cliente)
  const groupKey = config.type === "client" ? (c: (typeof allCamps)[number]) => c.clientName ?? "Sem cliente" : (c: (typeof allCamps)[number]) => c.accountName;
  const breakdown: Report["breakdown"] = [...Map.groupBy(ov.mixedCurrency ? [] : allCamps, groupKey).entries()].map(([label, cs]) => {
    const tot = aggregateCampaigns(cs.map((c) => c.totals));
    return { label, spend: tot.spend, results: tot.results, costPerResult: tot.costPerResult, ctr: tot.ctr };
  }).sort((a, b) => (b.spend ?? -1) - (a.spend ?? -1));

  const budget: Report["budget"] = allCamps.map((c) => {
    const avg = c.totals.spend !== null && c.totals.days > 0 ? c.totals.spend / c.totals.days : null;
    return { campaign: c.name, configuredDaily: c.dailyBudget, spend: c.totals.spend, avgDaily: avg, projected30: avg !== null && c.totals.days >= 3 ? avg * 30 : null };
  });

  // alterações: operações no período
  const ops = await db
    .select({ at: operations.createdAt, type: operations.type, status: operations.status, mode: operations.mode, who: users.name, campaign: campaigns.name, params: operations.params })
    .from(operations).innerJoin(campaigns, eq(campaigns.id, operations.campaignId)).leftJoin(users, eq(users.id, operations.createdBy))
    .where(and(eq(operations.organizationId, actor.organizationId), accountCond(actor, operations.adAccountId), gte(operations.createdAt, new Date(p.since + "T00:00:00Z")), lte(operations.createdAt, new Date(p.until + "T23:59:59Z"))));
  const OPN = { pause: "Pausar", activate: "Reativar", set_daily_budget: "Alterar orçamento diário" } as const;
  const changes: Report["changes"] = ops.sort((a, b) => b.at.getTime() - a.at.getTime()).map((o) => ({
    at: o.at, what: `${OPN[o.type]}: ${o.campaign}${o.type === "set_daily_budget" && o.params.dailyBudget ? ` → ${o.params.dailyBudget.toFixed(2)}` : ""}`, who: o.who, mode: o.mode, result: o.status,
  }));

  const health = await getHealth(actor, now);
  const logo = await getLogo(actor);
  const base: Report = {
    config, title: TYPE_LABEL[config.type],
    meta: {
      organization: org[0]?.name ?? "—", client: clientName(config.clientId ?? null), account: accountName, since: p.since, until: p.until, prevSince: p.prevSince, prevUntil: p.prevUntil,
      generatedAt: now, lastSyncedAt: ov.lastSyncedAt, stale: ov.stale, isDemo: ov.isDemo, currency: ov.currency, mixedCurrency: ov.mixedCurrency,
      coverageSince: ov.coverageSince, prevComparable: ov.prevComparable, partialCurrent: ov.partialCurrent, hasData: t.spend !== null || t.impressions !== null, logo,
    },
    kpis,
    daily: ov.daily.map((d) => ({ date: d.date, spend: d.spend, results: d.results, impressions: d.impressions, clicks: d.clicks })),
    campaigns: allCamps, variations: variations.slice(0, 10), breakdown, budget, alerts: ov.attention, changes,
    health: { state: health.state, instructions: health.instructions, accounts: health.accounts.map((a) => ({ name: a.name, lastSuccess: a.lastSuccess?.at ?? null, stale: a.stale, lastStatus: a.lastAttempt?.status ?? null })) },
    facts: [], hypotheses: [], recommendations: [], limitations: [], methodology: METHODOLOGY,
  };
  return { ...base, ...narrate(base) };
}

// Agrega totais já calculados por campanha em um total de grupo (soma de aditivos; razões recalculadas).
function aggregateCampaigns(ts: Totals[]): Totals {
  const rows = ts.flatMap((x) => (x.spend === null && x.impressions === null && x.results === null ? [] : [{ spend: x.spend, impressions: x.impressions, reach: null, clicks: x.clicks, results: x.results, purchaseValue: x.purchaseValue, date: "agg" }]));
  const a = aggregate(rows);
  // custo por resultado do grupo: usa apenas campanhas com gasto e resultado informados
  const paired = ts.filter((x) => x.spend !== null && x.results !== null);
  const ps = paired.reduce((s, x) => s + x.spend!, 0), pr = paired.reduce((s, x) => s + x.results!, 0);
  return { ...a, costPerResult: pr > 0 ? ps / pr : null };
}
