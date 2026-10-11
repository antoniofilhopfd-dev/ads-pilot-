import { randomUUID } from "node:crypto";
import { and, asc, eq, gte, inArray, lte } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { adAccounts, campaigns, clients, GOAL_METRICS, GOAL_SCOPES, goals, insightsDaily } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { aggregate, type Totals } from "@/lib/metrics";
import { audit } from "./audit";
import { accountCond, assertCan, type Actor } from "./context";

const goalSchema = z.object({
  scope: z.enum(GOAL_SCOPES), scopeId: z.string().default(""),
  metric: z.enum(GOAL_METRICS), direction: z.enum(["max", "min"]),
  target: z.number().finite().positive("A meta deve ser maior que zero.").max(1_000_000_000),
  windowDays: z.number().int().min(1).max(365).default(30), note: z.string().trim().max(300).optional(),
});

// Direção padrão por métrica: custos devem ficar ATÉ o alvo; retorno/volume devem ficar NO MÍNIMO no alvo.
export const DEFAULT_DIRECTION: Record<(typeof GOAL_METRICS)[number], "max" | "min"> = { cpa: "max", cpl: "max", cpc: "max", cpm: "max", roas: "min", ctr: "min", spend: "max", results: "min" };

export const metricValue = (t: Totals, m: (typeof GOAL_METRICS)[number]): number | null =>
  ({ cpa: t.cpa, cpl: t.cpl, roas: t.roas, ctr: t.ctr, cpc: t.cpc, cpm: t.cpm, spend: t.spend, results: t.results } as Record<string, number | null>)[m];

async function assertScope(actor: Actor, scope: (typeof GOAL_SCOPES)[number], scopeId: string) {
  if (scope === "org") return;
  if (scope === "client") { const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, scopeId), eq(clients.organizationId, actor.organizationId))); if (!c) throw new AppError("not_found", "Cliente não encontrado."); }
  else if (scope === "account") { const [a] = await db.select({ id: adAccounts.id }).from(adAccounts).where(and(eq(adAccounts.id, scopeId), eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id))); if (!a) throw new AppError("not_found", "Conta não encontrada."); }
  else { const [c] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, scopeId), eq(campaigns.organizationId, actor.organizationId), accountCond(actor, campaigns.adAccountId))); if (!c) throw new AppError("not_found", "Campanha não encontrada."); }
}

export async function setGoal(actor: Actor, input: unknown) {
  assertCan(actor, "budgets.manage");
  const p = goalSchema.safeParse(input);
  if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  const d = p.data;
  if (d.scope !== "org" && !d.scopeId) throw new AppError("validation", "Escolha o item da meta.");
  if (d.scope === "org") d.scopeId = "";
  await assertScope(actor, d.scope, d.scopeId);
  const [before] = await db.select().from(goals).where(and(eq(goals.organizationId, actor.organizationId), eq(goals.scope, d.scope), eq(goals.scopeId, d.scopeId), eq(goals.metric, d.metric)));
  const id = before?.id ?? randomUUID();
  await db.insert(goals).values({ id, organizationId: actor.organizationId, scope: d.scope, scopeId: d.scopeId, metric: d.metric, direction: d.direction, target: d.target.toFixed(4), windowDays: d.windowDays, note: d.note ?? null, createdBy: actor.userId })
    .onDuplicateKeyUpdate({ set: { direction: d.direction, target: d.target.toFixed(4), windowDays: d.windowDays, note: d.note ?? null } });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "goal.set", objectType: "goal", objectId: id, before: before ? { target: Number(before.target), direction: before.direction } : null, after: { scope: d.scope, metric: d.metric, target: d.target, direction: d.direction, windowDays: d.windowDays }, result: "success", requestId: actor.requestId });
  return id;
}

export async function deleteGoal(actor: Actor, goalId: string) {
  assertCan(actor, "budgets.manage");
  const [g] = await db.select().from(goals).where(and(eq(goals.id, goalId), eq(goals.organizationId, actor.organizationId)));
  if (!g) throw new AppError("not_found", "Meta não encontrada.");
  await assertScope(actor, g.scope, g.scopeId);
  await db.delete(goals).where(eq(goals.id, goalId));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "goal.delete", objectType: "goal", objectId: goalId, before: { metric: g.metric, target: Number(g.target) }, result: "success", requestId: actor.requestId });
}

export type GoalStatus = "atingida" | "nao_atingida" | "sem_dados" | "amostra_insuficiente";
export type GoalRow = { id: string; scope: (typeof GOAL_SCOPES)[number]; scopeId: string; scopeLabel: string; metric: (typeof GOAL_METRICS)[number]; direction: "max" | "min"; target: number; windowDays: number; note: string | null; current: number | null; status: GoalStatus; gapPct: number | null };

const MIN_IMPRESSIONS = 1000;

// Avalia cada meta com os dados SINCRONIZADOS da janela. Sem dado → "sem_dados" (nunca "atingida"); pouca amostra → sinalizado.
export async function evaluateGoals(actor: Actor, now = new Date()): Promise<GoalRow[]> {
  assertCan(actor, "insights.read");
  const list = await db.select().from(goals).where(eq(goals.organizationId, actor.organizationId)).orderBy(asc(goals.scope), asc(goals.metric));
  const out: GoalRow[] = [];
  for (const g of list) {
    let accountIds: string[] = []; let label = "Organização inteira"; let campaignId: string | null = null;
    try {
      if (g.scope === "org") accountIds = (await db.select({ id: adAccounts.id }).from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.isSelected, true), accountCond(actor, adAccounts.id)))).map((a) => a.id);
      else if (g.scope === "client") { const [c] = await db.select().from(clients).where(eq(clients.id, g.scopeId)); label = c?.name ?? "Cliente"; accountIds = (await db.select({ id: adAccounts.id }).from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.clientId, g.scopeId), eq(adAccounts.isSelected, true), accountCond(actor, adAccounts.id)))).map((a) => a.id); if (actor.allowedAccountIds !== null && accountIds.length === 0) continue; }
      else if (g.scope === "account") { const [a] = await db.select().from(adAccounts).where(and(eq(adAccounts.id, g.scopeId), accountCond(actor, adAccounts.id))); if (!a) continue; label = a.name; accountIds = [a.id]; }
      else { const [c] = await db.select().from(campaigns).where(and(eq(campaigns.id, g.scopeId), accountCond(actor, campaigns.adAccountId))); if (!c) continue; label = c.name; accountIds = [c.adAccountId]; campaignId = c.id; }
    } catch { continue; }
    const since = new Date(now.getTime() - (g.windowDays - 1) * 86_400_000).toISOString().slice(0, 10), until = now.toISOString().slice(0, 10);
    const rows = accountIds.length ? await db.select().from(insightsDaily).where(and(eq(insightsDaily.organizationId, actor.organizationId), inArray(insightsDaily.adAccountId, accountIds), gte(insightsDaily.date, since), lte(insightsDaily.date, until), campaignId ? eq(insightsDaily.campaignId, campaignId) : undefined)) : [];
    const t = aggregate(rows.map((r) => ({ spend: r.spend === null ? null : Number(r.spend), impressions: r.impressions, reach: r.reach, clicks: r.clicks, results: r.results, resultType: r.resultType, purchaseValue: r.purchaseValue === null ? null : Number(r.purchaseValue), date: r.date })));
    const current = metricValue(t, g.metric), target = Number(g.target);
    let status: GoalStatus = "sem_dados", gapPct: number | null = null;
    if (current !== null) {
      if ((t.impressions ?? 0) < MIN_IMPRESSIONS) status = "amostra_insuficiente";
      else status = (g.direction === "max" ? current <= target : current >= target) ? "atingida" : "nao_atingida";
      gapPct = ((current - target) / target) * 100;
    }
    out.push({ id: g.id, scope: g.scope, scopeId: g.scopeId, scopeLabel: label, metric: g.metric, direction: g.direction, target, windowDays: g.windowDays, note: g.note, current, status, gapPct });
  }
  return out;
}
