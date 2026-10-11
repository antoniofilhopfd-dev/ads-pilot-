import { randomUUID } from "node:crypto";
import { and, desc, eq, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, adSets, ads, campaigns, insightsDaily, metaConnections, syncRuns } from "@/db/schema";
import { AppError, isDuplicateKey } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { audit } from "../audit";
import { accountCond, assertCan, type Actor } from "../context";
import { markConnectionError, providerFor } from "./connection";
import { MetaApiError, type MetaProvider } from "./types";

export const STALE_AFTER_HOURS = 24;
const INTERRUPTED_AFTER_MS = 10 * 60_000; // execução "running" sem batimento por 10 min = interrompida
const MAX_ATTEMPTS = 3;
// 90 dias permite comparar "últimos 30 dias" com os 30 anteriores e cobre o filtro de 90 dias parcialmente (avisado na tela).
export const DEFAULT_SYNC_DAYS = 90;

type Opts = { trigger?: "manual" | "scheduled"; days?: number; provider?: MetaProvider; sleep?: (ms: number) => Promise<void>; now?: Date };

const money = (n: number | null) => (n === null ? null : n.toFixed(2));
const chunk = <T,>(xs: T[], n = 500) => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n));
const ymd = (d: Date) => d.toISOString().slice(0, 10);

// Repete erros temporários (rede, limite de taxa) com espera progressiva: 1s, 2s, 4s.
async function withRetry<T>(fn: () => Promise<T>, sleep: (ms: number) => Promise<void>, onRetry: () => void): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      if (!(e instanceof MetaApiError) || !e.retryable || attempt >= MAX_ATTEMPTS) throw e;
      onRetry();
      await sleep(1000 * 2 ** (attempt - 1));
    }
  }
}

export async function syncAccount(actor: Actor, accountId: string, opts: Opts = {}) {
  assertCan(actor, "meta.sync");
  const now = opts.now ?? new Date();
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const [acct] = await db.select().from(adAccounts).where(and(eq(adAccounts.id, accountId), eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id))).limit(1);
  if (!acct) throw new AppError("not_found", "Conta não encontrada.");
  const [conn] = await db.select().from(metaConnections).where(eq(metaConnections.id, acct.connectionId)).limit(1);
  if (!conn || conn.status !== "active") throw new AppError("conflict", "A conexão com a Meta precisa ser refeita antes de sincronizar.");
  const provider = opts.provider ?? providerFor(conn);

  // Retomada: execuções "running" sem batimento recente são marcadas como interrompidas e liberam a trava.
  await db.update(syncRuns)
    .set({ status: "interrupted", lockKey: null, finishedAt: now, errorCode: "interrupted", errorMessage: "Execução interrompida (sem batimento)." })
    .where(and(eq(syncRuns.adAccountId, accountId), eq(syncRuns.status, "running"), lt(syncRuns.heartbeatAt, new Date(now.getTime() - INTERRUPTED_AFTER_MS))));

  const days = opts.days ?? DEFAULT_SYNC_DAYS;
  const since = ymd(new Date(now.getTime() - (days - 1) * 86_400_000));
  const until = ymd(now);
  const runId = randomUUID();
  try {
    await db.insert(syncRuns).values({ id: runId, organizationId: actor.organizationId, adAccountId: accountId, status: "running", trigger: opts.trigger ?? "manual", lockKey: accountId, startedAt: now, heartbeatAt: now, rangeSince: since, rangeUntil: until });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError("conflict", "Já existe uma sincronização em andamento para esta conta.");
    throw e;
  }

  let attempts = 1;
  const retryHook = () => { attempts++; };
  const beat = () => db.update(syncRuns).set({ heartbeatAt: new Date() }).where(eq(syncRuns.id, runId));
  const counts: Record<string, number> = {};
  let status: "success" | "partial" | "failed" = "success";
  let errorCode: string | null = null;
  let errorMessage: string | null = null;

  try {
    // 1) Campanhas (essencial)
    const remoteCamps = await withRetry(() => provider.listCampaigns(acct.externalId), sleep, retryHook);
    const syncedAt = new Date();
    for (const part of chunk(remoteCamps)) {
      await db.insert(campaigns).values(part.map((c) => ({
        id: randomUUID(), organizationId: actor.organizationId, adAccountId: accountId, externalId: c.externalId, name: c.name, objective: c.objective,
        status: c.status, effectiveStatus: c.effectiveStatus, dailyBudget: money(c.dailyBudget), lifetimeBudget: money(c.lifetimeBudget), startTime: c.startTime, stopTime: c.stopTime, syncedAt,
      }))).onDuplicateKeyUpdate({ set: {
        name: sql`VALUES(name)`, objective: sql`VALUES(objective)`, status: sql`VALUES(status)`, effectiveStatus: sql`VALUES(effective_status)`,
        dailyBudget: sql`VALUES(daily_budget)`, lifetimeBudget: sql`VALUES(lifetime_budget)`, startTime: sql`VALUES(start_time)`, stopTime: sql`VALUES(stop_time)`, syncedAt: sql`VALUES(synced_at)`,
      } });
    }
    counts.campaigns = remoteCamps.length;
    await beat();
    const campRows = await db.select({ id: campaigns.id, externalId: campaigns.externalId }).from(campaigns).where(eq(campaigns.adAccountId, accountId));
    const campId = new Map(campRows.map((c) => [c.externalId, c.id]));

    // 2) Conjuntos e anúncios (falha aqui = sincronização parcial)
    try {
      const sets = await withRetry(() => provider.listAdSets(acct.externalId), sleep, retryHook);
      const okSets = sets.filter((s) => campId.has(s.campaignExternalId));
      for (const part of chunk(okSets)) {
        await db.insert(adSets).values(part.map((s) => ({
          id: randomUUID(), organizationId: actor.organizationId, campaignId: campId.get(s.campaignExternalId)!, externalId: s.externalId, name: s.name, status: s.status,
          effectiveStatus: s.effectiveStatus, optimizationGoal: s.optimizationGoal, dailyBudget: money(s.dailyBudget), lifetimeBudget: money(s.lifetimeBudget),
          bidStrategy: s.bidStrategy, startTime: s.startTime, endTime: s.endTime, targeting: s.targeting, syncedAt,
        }))).onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)`, status: sql`VALUES(status)`, effectiveStatus: sql`VALUES(effective_status)`, optimizationGoal: sql`VALUES(optimization_goal)`, dailyBudget: sql`VALUES(daily_budget)`, lifetimeBudget: sql`VALUES(lifetime_budget)`, bidStrategy: sql`VALUES(bid_strategy)`, startTime: sql`VALUES(start_time)`, endTime: sql`VALUES(end_time)`, targeting: sql`VALUES(targeting)`, syncedAt: sql`VALUES(synced_at)` } });
      }
      counts.adSets = okSets.length;
      const setRows = await db.select({ id: adSets.id, externalId: adSets.externalId }).from(adSets).innerJoin(campaigns, eq(campaigns.id, adSets.campaignId)).where(eq(campaigns.adAccountId, accountId));
      const setId = new Map(setRows.map((s) => [s.externalId, s.id]));
      const remoteAds = await withRetry(() => provider.listAds(acct.externalId), sleep, retryHook);
      const okAds = remoteAds.filter((a) => setId.has(a.adSetExternalId));
      for (const part of chunk(okAds)) {
        await db.insert(ads).values(part.map((a) => ({
          id: randomUUID(), organizationId: actor.organizationId, adSetId: setId.get(a.adSetExternalId)!, externalId: a.externalId, name: a.name, status: a.status, effectiveStatus: a.effectiveStatus, syncedAt,
        }))).onDuplicateKeyUpdate({ set: { name: sql`VALUES(name)`, status: sql`VALUES(status)`, effectiveStatus: sql`VALUES(effective_status)`, syncedAt: sql`VALUES(synced_at)` } });
      }
      counts.ads = okAds.length;
      await beat();
    } catch (e) {
      if (e instanceof MetaApiError && (e.kind === "token_expired")) throw e;
      status = "partial";
      errorCode = e instanceof MetaApiError ? e.kind : "unknown";
      errorMessage = `Conjuntos/anúncios não sincronizados: ${(e as Error).message}`.slice(0, 300);
    }

    // 3) Métricas diárias (essencial). Reescrever o mesmo dia é idempotente (chave campanha+data).
    const insights = await withRetry(() => provider.getDailyInsights(acct.externalId, since, until), sleep, retryHook);
    const okIns = insights.filter((i) => campId.has(i.campaignExternalId));
    for (const part of chunk(okIns)) {
      await db.insert(insightsDaily).values(part.map((i) => ({
        campaignId: campId.get(i.campaignExternalId)!, date: i.date, organizationId: actor.organizationId, adAccountId: accountId,
        spend: money(i.spend), impressions: i.impressions, reach: i.reach, clicks: i.clicks, results: i.results, resultType: i.resultType, purchaseValue: money(i.purchaseValue), syncedAt,
      }))).onDuplicateKeyUpdate({ set: {
        spend: sql`VALUES(spend)`, impressions: sql`VALUES(impressions)`, reach: sql`VALUES(reach)`, clicks: sql`VALUES(clicks)`,
        results: sql`VALUES(results)`, resultType: sql`VALUES(result_type)`, purchaseValue: sql`VALUES(purchase_value)`, syncedAt: sql`VALUES(synced_at)`,
      } });
    }
    counts.insightRows = okIns.length;
    if (insights.length !== okIns.length) counts.insightRowsSkipped = insights.length - okIns.length;
  } catch (e) {
    status = "failed";
    if (e instanceof MetaApiError) {
      errorCode = e.kind;
      errorMessage = e.message.slice(0, 300);
      if (e.kind === "token_expired" || e.kind === "permission") await markConnectionError(conn.id, e);
    } else {
      errorCode = "internal";
      errorMessage = "Erro interno durante a sincronização.";
      logger.error("sync_failed", { accountId, error: e instanceof Error ? e.message : String(e) });
    }
  }

  await db.update(syncRuns).set({ status, lockKey: null, finishedAt: new Date(), attempts, counts, errorCode, errorMessage }).where(eq(syncRuns.id, runId));
  if (status !== "failed") await db.update(adAccounts).set({ lastSyncedAt: new Date() }).where(eq(adAccounts.id, accountId));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, clientId: acct.clientId, action: "meta.sync", objectType: "ad_account", objectId: accountId, after: { status, counts, since, until }, result: status === "failed" ? "failure" : "success", error: errorMessage, requestId: actor.requestId });
  return { runId, status, counts, errorCode, errorMessage };
}

export async function syncAllSelected(actor: Actor, opts: Opts = {}) {
  const accts = await db.select({ id: adAccounts.id }).from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.isSelected, true), accountCond(actor, adAccounts.id)));
  const out = [];
  for (const a of accts) {
    try { out.push({ accountId: a.id, ...(await syncAccount(actor, a.id, opts)) }); }
    catch (e) { out.push({ accountId: a.id, error: e instanceof AppError ? e.message : "erro" }); }
  }
  return out;
}

export async function recentRuns(actor: Actor, limit = 15) {
  assertCan(actor, "insights.read");
  return db.select({ run: syncRuns, accountName: adAccounts.name }).from(syncRuns).innerJoin(adAccounts, eq(adAccounts.id, syncRuns.adAccountId))
    .where(and(eq(syncRuns.organizationId, actor.organizationId), accountCond(actor, syncRuns.adAccountId))).orderBy(desc(syncRuns.startedAt)).limit(limit);
}
