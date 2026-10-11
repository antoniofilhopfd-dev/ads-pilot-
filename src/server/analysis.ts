import { and, eq, gte, inArray, lte } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, campaigns, insightsDaily } from "@/db/schema";
import { aggregate, type Row } from "@/lib/metrics";
import type { CampaignFacts } from "@/lib/analysis";

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);
const dec = (v: string | null) => (v === null ? null : Number(v));

// Monta os fatos por campanha: janela atual (7 dias terminando hoje) × janela anterior (7 dias antes).
// allowedAccountIds: null = organização inteira (uso interno do motor de alertas); lista = recorte do ator.
export async function loadFacts(organizationId: string, allowedAccountIds: string[] | null, now = new Date(), opts: { campaignId?: string; noDeliveryDays?: number } = {}): Promise<CampaignFacts[]> {
  if (allowedAccountIds !== null && allowedAccountIds.length === 0) return [];
  const until = ymd(now), since = ymd(addDays(now, -6)), prevUntil = ymd(addDays(now, -7)), prevSince = ymd(addDays(now, -13));
  const camps = await db.select({ c: campaigns, accountName: adAccounts.name, currency: adAccounts.currency }).from(campaigns).innerJoin(adAccounts, eq(adAccounts.id, campaigns.adAccountId))
    .where(and(eq(campaigns.organizationId, organizationId), eq(adAccounts.organizationId, organizationId), eq(adAccounts.isSelected, true),
      allowedAccountIds ? inArray(adAccounts.id, allowedAccountIds) : undefined, opts.campaignId ? eq(campaigns.id, opts.campaignId) : undefined));
  if (!camps.length) return [];
  const rows = await db.select().from(insightsDaily).where(and(eq(insightsDaily.organizationId, organizationId), inArray(insightsDaily.campaignId, camps.map((c) => c.c.id)), gte(insightsDaily.date, prevSince), lte(insightsDaily.date, until)));
  const by = Map.groupBy(rows, (r) => r.campaignId);
  const toRow = (r: (typeof rows)[number]): Row & { date: string } => ({ spend: dec(r.spend), impressions: r.impressions, reach: r.reach, clicks: r.clicks, results: r.results, resultType: r.resultType, purchaseValue: dec(r.purchaseValue), date: r.date });
  const zeroDays = opts.noDeliveryDays ?? 1;
  return camps.map(({ c, accountName, currency }) => {
    const mine = (by.get(c.id) ?? []).map(toRow);
    const cur = mine.filter((r) => r.date >= since), prev = mine.filter((r) => r.date <= prevUntil);
    const dates = [...new Set(cur.map((r) => r.date))].sort();
    const latest = dates.at(-1);
    const lastN = dates.slice(-zeroDays);
    const recentZeroDelivery = lastN.length >= zeroDays && lastN.every((d) => (aggregate(cur.filter((r) => r.date === d)).impressions ?? 0) === 0);
    return {
      id: c.id, name: c.name, accountId: c.adAccountId, accountName, currency, objective: c.objective, effectiveStatus: c.effectiveStatus,
      cur: aggregate(cur), prev: aggregate(prev), latestDay: latest ? { date: latest, totals: aggregate(cur.filter((r) => r.date === latest)) } : null, recentZeroDelivery,
      period: { since, until, prevSince, prevUntil },
    };
  });
}
