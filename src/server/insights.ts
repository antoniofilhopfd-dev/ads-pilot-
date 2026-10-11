import { and, eq, gte, inArray, lte, min } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, adSets, ads, campaigns, insightsDaily, metaConnections, syncRuns } from "@/db/schema";
import { aggregate, type Totals } from "@/lib/metrics";
import { AppError } from "@/lib/errors";
import { assertCan, type Actor } from "./context";
import { STALE_AFTER_HOURS } from "./meta/sync";

export type Filters = { clientId?: string; accountId?: string; since: string; until: string };
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (s: string, n: number) => ymd(new Date(new Date(s + "T00:00:00Z").getTime() + n * 86_400_000));
const dec = (v: string | null) => (v === null ? null : Number(v));

export function resolvePeriod(days: number, now = new Date()) {
  const until = ymd(now);
  const since = addDays(until, -(days - 1));
  return { since, until, prevSince: addDays(since, -days), prevUntil: addDays(since, -1) };
}

async function loadRows(actor: Actor, f: Filters) {
  const rows = await db
    .select({
      campaignId: insightsDaily.campaignId, adAccountId: insightsDaily.adAccountId, date: insightsDaily.date,
      spend: insightsDaily.spend, impressions: insightsDaily.impressions, reach: insightsDaily.reach, clicks: insightsDaily.clicks,
      results: insightsDaily.results, purchaseValue: insightsDaily.purchaseValue, currency: adAccounts.currency,
    })
    .from(insightsDaily)
    .innerJoin(adAccounts, eq(adAccounts.id, insightsDaily.adAccountId))
    .where(and(
      eq(insightsDaily.organizationId, actor.organizationId), eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.isSelected, true),
      gte(insightsDaily.date, f.since), lte(insightsDaily.date, f.until),
      f.accountId ? eq(adAccounts.id, f.accountId) : undefined, f.clientId ? eq(adAccounts.clientId, f.clientId) : undefined,
    ));
  return rows.map((r) => ({ ...r, spend: dec(r.spend), purchaseValue: dec(r.purchaseValue) }));
}

export type CampaignRow = {
  id: string; accountId: string; clientId: string | null; name: string; objective: string | null; status: string | null; effectiveStatus: string | null; accountName: string; currency: string;
  dailyBudget: number | null; lifetimeBudget: number | null; totals: Totals;
};

export async function loadCampaigns(actor: Actor, f: Filters): Promise<CampaignRow[]> {
  const camps = await db
    .select({ c: campaigns, accountName: adAccounts.name, currency: adAccounts.currency })
    .from(campaigns).innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(
      eq(campaigns.organizationId, actor.organizationId), eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.isSelected, true),
      f.accountId ? eq(adAccounts.id, f.accountId) : undefined, f.clientId ? eq(adAccounts.clientId, f.clientId) : undefined,
    ));
  const acctRows = await db.select({ id: adAccounts.id, clientId: adAccounts.clientId }).from(adAccounts).where(eq(adAccounts.organizationId, actor.organizationId));
  const clientOf = new Map(acctRows.map((a) => [a.id, a.clientId]));
  const rows = await loadRows(actor, f);
  const byCamp = Map.groupBy(rows, (r) => r.campaignId);
  return camps.map(({ c, accountName, currency }) => ({
    id: c.id, accountId: c.adAccountId, clientId: clientOf.get(c.adAccountId) ?? null, name: c.name, objective: c.objective, status: c.status, effectiveStatus: c.effectiveStatus, accountName, currency,
    dailyBudget: dec(c.dailyBudget), lifetimeBudget: dec(c.lifetimeBudget), totals: aggregate(byCamp.get(c.id) ?? []),
  }));
}

export type AttentionItem = { tone: "danger" | "warn"; title: string; detail: string; href?: string };

export async function getOverview(actor: Actor, f: Filters & { prevSince: string; prevUntil: string }, now = new Date()) {
  assertCan(actor, "insights.read");
  const [conn] = await db.select().from(metaConnections).where(eq(metaConnections.organizationId, actor.organizationId)).limit(1);
  const accts = await db.select().from(adAccounts).where(and(
    eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.isSelected, true),
    f.accountId ? eq(adAccounts.id, f.accountId) : undefined, f.clientId ? eq(adAccounts.clientId, f.clientId) : undefined,
  ));
  const currencies = [...new Set(accts.map((a) => a.currency))];
  const mixedCurrency = currencies.length > 1; // somas entre moedas diferentes seriam incorretas
  const rows = await loadRows(actor, f);
  const prevRows = await loadRows(actor, { ...f, since: f.prevSince, until: f.prevUntil });
  // Cobertura: data mais antiga sincronizada em TODAS as contas filtradas. Comparar com período só parcialmente
  // sincronizado geraria variações falsas, então nesse caso a comparação é omitida.
  const cov = accts.length
    ? await db.select({ id: syncRuns.adAccountId, since: min(syncRuns.rangeSince) }).from(syncRuns)
        .where(and(eq(syncRuns.organizationId, actor.organizationId), inArray(syncRuns.adAccountId, accts.map((a) => a.id)), inArray(syncRuns.status, ["success", "partial"]))).groupBy(syncRuns.adAccountId)
    : [];
  const coverageSince = cov.length === accts.length && cov.length ? cov.map((c) => c.since!).sort().at(-1)! : null;
  const prevComparable = coverageSince !== null && f.prevSince >= coverageSince;
  const partialCurrent = coverageSince !== null && f.since < coverageSince;
  const camps = await loadCampaigns(actor, f);

  const synced = accts.map((a) => a.lastSyncedAt).filter((d): d is Date => d !== null);
  const oldest = synced.length === accts.length && synced.length ? new Date(Math.min(...synced.map((d) => d.getTime()))) : null;
  const stale = accts.length > 0 && (oldest === null || (now.getTime() - oldest.getTime()) / 3_600_000 > STALE_AFTER_HOURS);

  const byDay = Map.groupBy(rows, (r) => r.date);
  const daily = [...byDay.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([date, rs]) => ({ date, ...aggregate(rs) }));

  const attention: AttentionItem[] = [];
  for (const c of camps) {
    if (c.effectiveStatus === "DISAPPROVED") attention.push({ tone: "danger", title: `${c.name}: reprovada`, detail: "A Meta reprovou esta campanha. Veja os anúncios para o motivo.", href: `/app/campanhas/${c.id}` });
    else if (c.effectiveStatus === "WITH_ISSUES") attention.push({ tone: "warn", title: `${c.name}: com problemas de entrega`, detail: "A Meta sinalizou problemas (status WITH_ISSUES).", href: `/app/campanhas/${c.id}` });
    else if (c.effectiveStatus === "ACTIVE" && c.totals.spend === null) attention.push({ tone: "warn", title: `${c.name}: ativa sem gasto no período`, detail: "Nenhum gasto registrado no período selecionado.", href: `/app/campanhas/${c.id}` });
  }
  const bad = await db
    .select({ campaignId: campaigns.id, campaignName: campaigns.name, adName: ads.name })
    .from(ads).innerJoin(adSets, eq(adSets.id, ads.adSetId)).innerJoin(campaigns, eq(campaigns.id, adSets.campaignId)).innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(
      eq(ads.organizationId, actor.organizationId), eq(adAccounts.organizationId, actor.organizationId), eq(adAccounts.isSelected, true), eq(ads.effectiveStatus, "DISAPPROVED"),
      f.accountId ? eq(adAccounts.id, f.accountId) : undefined, f.clientId ? eq(adAccounts.clientId, f.clientId) : undefined,
    ));
  for (const [cid, list] of Map.groupBy(bad, (b) => b.campaignId))
    attention.push({ tone: "danger", title: `${list.length} anúncio(s) reprovado(s) em ${list[0].campaignName}`, detail: "A Meta reprovou estes anúncios; revise-os no Gerenciador de Anúncios.", href: `/app/campanhas/${cid}` });
  if (stale) attention.push({ tone: "warn", title: "Dados desatualizados", detail: oldest ? `Última sincronização há mais de ${STALE_AFTER_HOURS} h.` : "Há contas que nunca foram sincronizadas.", href: "/app/integracoes" });
  if (conn && conn.status !== "active") attention.push({ tone: "danger", title: "Conexão com a Meta precisa de atenção", detail: conn.lastError ?? "Reconecte a conta.", href: "/app/integracoes" });

  return {
    isDemo: conn?.mode === "demo", hasConnection: !!conn, hasSelectedAccounts: accts.length > 0, currency: currencies[0] ?? "BRL", mixedCurrency,
    lastSyncedAt: oldest, stale,
    totals: mixedCurrency ? aggregate([]) : aggregate(rows), prevTotals: mixedCurrency || !prevComparable ? aggregate([]) : aggregate(prevRows),
    coverageSince, prevComparable, partialCurrent,
    daily, campaigns: camps, attention,
  };
}

export type CampaignQuery = Filters & { q?: string; status?: string; objective?: string; sort?: string; dir?: "asc" | "desc"; page?: number; pageSize?: number };

const SORTS: Record<string, (c: CampaignRow) => number | string | null> = {
  name: (c) => c.name.toLowerCase(), spend: (c) => c.totals.spend, results: (c) => c.totals.results, costPerResult: (c) => c.totals.costPerResult, ctr: (c) => c.totals.ctr, status: (c) => c.effectiveStatus ?? "",
};

export async function listCampaigns(actor: Actor, q: CampaignQuery) {
  assertCan(actor, "insights.read");
  let rows = await loadCampaigns(actor, q);
  const objectives = [...new Set(rows.map((r) => r.objective).filter((o): o is string => !!o))].sort();
  const statuses = [...new Set(rows.map((r) => r.effectiveStatus).filter((o): o is string => !!o))].sort();
  if (q.q) rows = rows.filter((r) => r.name.toLowerCase().includes(q.q!.toLowerCase()));
  if (q.status) rows = rows.filter((r) => r.effectiveStatus === q.status);
  if (q.objective) rows = rows.filter((r) => r.objective === q.objective);
  const key = SORTS[q.sort ?? "spend"] ?? SORTS.spend;
  const dir = q.dir === "asc" ? 1 : -1;
  // valores ausentes (null) sempre ao final, independentemente da direção
  rows.sort((a, b) => {
    const x = key(a), y = key(b);
    if (x === null && y === null) return 0;
    if (x === null) return 1;
    if (y === null) return -1;
    return (x < y ? -1 : x > y ? 1 : 0) * dir;
  });
  const pageSize = Math.min(Math.max(q.pageSize ?? 20, 1), 100);
  const total = rows.length;
  const pages = Math.max(Math.ceil(total / pageSize), 1);
  const page = Math.min(Math.max(q.page ?? 1, 1), pages);
  return { rows: rows.slice((page - 1) * pageSize, page * pageSize), total, page, pages, objectives, statuses };
}

export async function getCampaignDetail(actor: Actor, campaignId: string, f: Filters & { prevSince: string; prevUntil: string }) {
  assertCan(actor, "insights.read");
  const [row] = await db
    .select({ c: campaigns, accountName: adAccounts.name, currency: adAccounts.currency, accountId: adAccounts.id, lastSyncedAt: adAccounts.lastSyncedAt, clientId: adAccounts.clientId })
    .from(campaigns).innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, actor.organizationId), eq(adAccounts.organizationId, actor.organizationId)))
    .limit(1);
  if (!row) throw new AppError("not_found", "Campanha não encontrada.");
  const scope = (since: string, until: string) => and(eq(insightsDaily.campaignId, campaignId), eq(insightsDaily.organizationId, actor.organizationId), gte(insightsDaily.date, since), lte(insightsDaily.date, until));
  const sel = { date: insightsDaily.date, spend: insightsDaily.spend, impressions: insightsDaily.impressions, reach: insightsDaily.reach, clicks: insightsDaily.clicks, results: insightsDaily.results, purchaseValue: insightsDaily.purchaseValue };
  const norm = (rs: { date: string; spend: string | null; impressions: number | null; reach: number | null; clicks: number | null; results: number | null; purchaseValue: string | null }[]) => rs.map((r) => ({ ...r, spend: dec(r.spend), purchaseValue: dec(r.purchaseValue) }));
  const cur = norm(await db.select(sel).from(insightsDaily).where(scope(f.since, f.until)).orderBy(insightsDaily.date));
  const prev = norm(await db.select(sel).from(insightsDaily).where(scope(f.prevSince, f.prevUntil)));
  const sets = await db.select().from(adSets).where(and(eq(adSets.campaignId, campaignId), eq(adSets.organizationId, actor.organizationId)));
  const adRows = sets.length ? await db.select().from(ads).where(and(inArray(ads.adSetId, sets.map((s) => s.id)), eq(ads.organizationId, actor.organizationId))) : [];
  return {
    campaign: { ...row.c, dailyBudget: dec(row.c.dailyBudget), lifetimeBudget: dec(row.c.lifetimeBudget) },
    accountName: row.accountName, currency: row.currency, lastSyncedAt: row.lastSyncedAt,
    totals: aggregate(cur), prevTotals: aggregate(prev), daily: cur.map((r) => ({ date: r.date, ...aggregate([r]) })),
    adSets: sets.map((s) => ({ ...s, dailyBudget: dec(s.dailyBudget), lifetimeBudget: dec(s.lifetimeBudget) })), ads: adRows,
  };
}
