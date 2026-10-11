import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, auditLog, BUDGET_SCOPES, budgetPlans, campaigns, clients, insightsDaily, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { computePacing, daysInMonth, isPeriod, simulateRedistribution, type Pacing } from "@/lib/pacing";
import { aggregate } from "@/lib/metrics";
import { audit } from "./audit";
import { accountCond, assertCan, type Actor } from "./context";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const num = (v: string | null) => (v === null ? null : Number(v));

const planSchema = z.object({
  scope: z.enum(BUDGET_SCOPES), scopeId: z.string().uuid(),
  period: z.string().refine(isPeriod, "Período inválido (use AAAA-MM)."),
  amount: z.number().finite().positive("O orçamento deve ser maior que zero.").max(100_000_000),
  milestones: z.array(z.number().int().min(1).max(200)).max(10).default([50, 80, 100]),
  note: z.string().trim().max(300).optional(),
});

// Contas (ids) que um escopo cobre, respeitando o acesso do ator. Retorna também a moeda.
async function scopeAccounts(actor: Actor, scope: (typeof BUDGET_SCOPES)[number], scopeId: string) {
  if (scope === "campaign") {
    const [c] = await db.select({ id: campaigns.id, name: campaigns.name, accountId: campaigns.adAccountId }).from(campaigns).where(and(eq(campaigns.id, scopeId), eq(campaigns.organizationId, actor.organizationId), accountCond(actor, campaigns.adAccountId)));
    if (!c) throw new AppError("not_found", "Campanha não encontrada.");
    const [a] = await db.select().from(adAccounts).where(eq(adAccounts.id, c.accountId));
    return { label: c.name, accountIds: [c.accountId], currency: a.currency, campaignId: c.id };
  }
  if (scope === "account") {
    const [a] = await db.select().from(adAccounts).where(and(eq(adAccounts.id, scopeId), eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id)));
    if (!a) throw new AppError("not_found", "Conta não encontrada.");
    return { label: a.name, accountIds: [a.id], currency: a.currency, campaignId: null as string | null };
  }
  const [cl] = await db.select().from(clients).where(and(eq(clients.id, scopeId), eq(clients.organizationId, actor.organizationId)));
  const accts = await db.select().from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.clientId, scopeId), accountCond(actor, adAccounts.id)));
  if (!cl || (actor.allowedAccountIds !== null && accts.length === 0)) throw new AppError("not_found", "Cliente não encontrado.");
  const currencies = [...new Set(accts.map((a) => a.currency))];
  return { label: cl.name, accountIds: accts.map((a) => a.id), currency: currencies.length === 1 ? currencies[0] : currencies.length === 0 ? "BRL" : "MIX", campaignId: null as string | null };
}

async function dailySpend(actor: Actor, sc: Awaited<ReturnType<typeof scopeAccounts>>, since: string, until: string) {
  if (sc.accountIds.length === 0) return [];
  const rows = await db.select({ date: insightsDaily.date, spend: insightsDaily.spend }).from(insightsDaily)
    .where(and(eq(insightsDaily.organizationId, actor.organizationId), inArray(insightsDaily.adAccountId, sc.accountIds), gte(insightsDaily.date, since), lte(insightsDaily.date, until), sc.campaignId ? eq(insightsDaily.campaignId, sc.campaignId) : undefined));
  return rows.map((r) => ({ date: r.date, spend: num(r.spend) }));
}

export async function setBudgetPlan(actor: Actor, input: unknown) {
  assertCan(actor, "budgets.manage");
  const p = planSchema.safeParse(input);
  if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  const d = p.data;
  const sc = await scopeAccounts(actor, d.scope, d.scopeId);
  if (sc.currency === "MIX") throw new AppError("validation", "Este cliente tem contas em moedas diferentes. Defina o orçamento por conta.");
  const [before] = await db.select().from(budgetPlans).where(and(eq(budgetPlans.organizationId, actor.organizationId), eq(budgetPlans.scope, d.scope), eq(budgetPlans.scopeId, d.scopeId), eq(budgetPlans.period, d.period)));
  const id = before?.id ?? randomUUID();
  const ms = [...new Set(d.milestones)].sort((a, b) => a - b);
  await db.insert(budgetPlans).values({ id, organizationId: actor.organizationId, scope: d.scope, scopeId: d.scopeId, period: d.period, amount: d.amount.toFixed(2), currency: sc.currency, milestones: ms, note: d.note ?? null, createdBy: actor.userId })
    .onDuplicateKeyUpdate({ set: { amount: d.amount.toFixed(2), milestones: ms, note: d.note ?? null, updatedAt: new Date() } });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "budget.set", objectType: "budget_plan", objectId: id, before: before ? { amount: Number(before.amount), milestones: before.milestones } : null, after: { scope: d.scope, scopeLabel: sc.label, period: d.period, amount: d.amount, milestones: ms }, result: "success", requestId: actor.requestId });
  return id;
}

export async function deleteBudgetPlan(actor: Actor, planId: string) {
  assertCan(actor, "budgets.manage");
  const [pl] = await db.select().from(budgetPlans).where(and(eq(budgetPlans.id, planId), eq(budgetPlans.organizationId, actor.organizationId)));
  if (!pl) throw new AppError("not_found", "Orçamento não encontrado.");
  await scopeAccounts(actor, pl.scope, pl.scopeId); // restrito a contas liberadas
  await db.delete(budgetPlans).where(eq(budgetPlans.id, planId));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "budget.delete", objectType: "budget_plan", objectId: planId, before: { scope: pl.scope, period: pl.period, amount: Number(pl.amount) }, result: "success", requestId: actor.requestId });
}

export type BudgetRow = { id: string; scope: (typeof BUDGET_SCOPES)[number]; scopeId: string; scopeLabel: string; period: string; amount: number; currency: string; note: string | null; milestones: number[]; pacing: Pacing };

// Planos do período com ritmo/projeção calculados do gasto REPORTADO (insights sincronizados).
export async function listBudgets(actor: Actor, period: string, now = new Date()): Promise<BudgetRow[]> {
  assertCan(actor, "insights.read");
  if (!isPeriod(period)) throw new AppError("validation", "Período inválido.");
  const plans = await db.select().from(budgetPlans).where(and(eq(budgetPlans.organizationId, actor.organizationId), eq(budgetPlans.period, period))).orderBy(asc(budgetPlans.scope), desc(budgetPlans.amount));
  const out: BudgetRow[] = [];
  for (const pl of plans) {
    let sc;
    try { sc = await scopeAccounts(actor, pl.scope, pl.scopeId); } catch { continue; } // fora do acesso do ator: não aparece
    const rows = await dailySpend(actor, sc, `${period}-01`, `${period}-${String(daysInMonth(period)).padStart(2, "0")}`);
    const amount = Number(pl.amount);
    out.push({ id: pl.id, scope: pl.scope, scopeId: pl.scopeId, scopeLabel: sc.label, period, amount, currency: pl.currency, note: pl.note, milestones: pl.milestones, pacing: computePacing({ period, amount, rows, today: ymd(now), milestones: pl.milestones }) });
  }
  return out;
}

export async function budgetHistory(actor: Actor, planId: string) {
  assertCan(actor, "insights.read");
  const [pl] = await db.select().from(budgetPlans).where(and(eq(budgetPlans.id, planId), eq(budgetPlans.organizationId, actor.organizationId)));
  if (pl) await scopeAccounts(actor, pl.scope, pl.scopeId);
  else throw new AppError("not_found", "Orçamento não encontrado.");
  return db.select({ at: auditLog.createdAt, action: auditLog.action, before: auditLog.before, after: auditLog.after, user: users.name }).from(auditLog).leftJoin(users, eq(users.id, auditLog.userId))
    .where(and(eq(auditLog.organizationId, actor.organizationId), eq(auditLog.objectId, planId), inArray(auditLog.action, ["budget.set", "budget.delete"]))).orderBy(desc(auditLog.createdAt)).limit(50);
}

// Dados para a simulação: gasto diário médio (7 dias) e custo por resultado de cada campanha do escopo.
export async function simulationBase(actor: Actor, scope: (typeof BUDGET_SCOPES)[number], scopeId: string, now = new Date()) {
  assertCan(actor, "insights.read");
  const sc = await scopeAccounts(actor, scope, scopeId);
  if (sc.accountIds.length === 0) return { label: sc.label, campaigns: [], remainingDays: 0 };
  const since = ymd(new Date(now.getTime() - 6 * 86_400_000)), until = ymd(now);
  const camps = await db.select({ id: campaigns.id, name: campaigns.name, status: campaigns.effectiveStatus }).from(campaigns).where(and(eq(campaigns.organizationId, actor.organizationId), inArray(campaigns.adAccountId, sc.accountIds), sc.campaignId ? eq(campaigns.id, sc.campaignId) : undefined));
  const rows = await db.select().from(insightsDaily).where(and(eq(insightsDaily.organizationId, actor.organizationId), inArray(insightsDaily.adAccountId, sc.accountIds), gte(insightsDaily.date, since), lte(insightsDaily.date, until)));
  const by = Map.groupBy(rows, (r) => r.campaignId);
  const list = camps.map((c) => {
    const r = (by.get(c.id) ?? []).map((x) => ({ spend: num(x.spend), impressions: x.impressions, reach: x.reach, clicks: x.clicks, results: x.results, purchaseValue: num(x.purchaseValue), date: x.date }));
    const t = aggregate(r);
    const days = new Set(r.filter((x) => x.spend !== null).map((x) => x.date)).size;
    return { id: c.id, name: c.name, dailySpend: t.spend !== null && days > 0 ? t.spend / days : 0, costPerResult: t.costPerResult };
  }).filter((c) => c.dailySpend > 0);
  const dim = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)).getUTCDate();
  return { label: sc.label, campaigns: list, remainingDays: Math.max(dim - now.getUTCDate(), 0) };
}

export { simulateRedistribution };
