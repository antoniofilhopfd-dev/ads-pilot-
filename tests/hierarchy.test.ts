import { eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { adSets, campaigns } from "@/db/schema";
import { summarizeTargeting } from "@/lib/targeting";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { GraphApiProvider } from "@/server/meta/graph-provider";
import { syncAccount } from "@/server/meta/sync";
import { getCampaignDetail, resolvePeriod } from "@/server/insights";
import { newOrg } from "./helpers";

describe("hierarquia: conjunto com lance, datas e segmentação", () => {
  it("Graph API (resposta simulada) → campos do conjunto mapeados; ausentes = null", async () => {
    const f = vi.fn().mockResolvedValue(new Response(JSON.stringify({ data: [
      { id: "10", campaign_id: "1", name: "Conj A", status: "ACTIVE", effective_status: "ACTIVE", optimization_goal: "LINK_CLICKS", bid_strategy: "COST_CAP", start_time: "2026-09-01T03:00:00+0000", targeting: { age_min: 25, age_max: 40, geo_locations: { countries: ["BR"] } } },
      { id: "11", campaign_id: "1", name: "Conj B" },
    ] }), { status: 200 }));
    const r = await new GraphApiProvider("T", f as unknown as typeof fetch).listAdSets("act_1");
    expect(r[0]).toMatchObject({ bidStrategy: "COST_CAP", targeting: { age_min: 25 } });
    expect(r[0].startTime?.toISOString()).toBe("2026-09-01T03:00:00.000Z");
    expect(r[1]).toMatchObject({ bidStrategy: null, startTime: null, endTime: null, targeting: null });
    expect(String(f.mock.calls[0][0])).toContain("bid_strategy");
  });

  it("resumo da segmentação descreve só o que existe", () => {
    expect(summarizeTargeting(null)).toEqual({ age: null, genders: null, places: null, interests: null, placements: null });
    expect(summarizeTargeting({ age_min: 25, age_max: 54, genders: [2], geo_locations: { countries: ["BR"], cities: [{ name: "São Paulo" }] }, interests: [{ name: "Compras online" }], publisher_platforms: ["instagram"] }))
      .toEqual({ age: "25–54 anos", genders: "Mulheres", places: "BR, São Paulo", interests: "Compras online", placements: "instagram" });
  });

  it("sincronização grava os campos e o detalhe da campanha os devolve", async () => {
    const o = await newOrg("Hi");
    await connectDemo(o.admin);
    const [a] = (await listAccounts(o.admin)).filter((x) => x.name.includes("Loja"));
    await configureAccount(o.admin, a.id, { selected: true, clientId: null });
    await syncAccount(o.admin, a.id, { now: new Date(), sleep: async () => {} });
    const camp = (await db.select().from(campaigns).where(eq(campaigns.adAccountId, a.id))).find((c) => c.name.startsWith("Remarketing"))!;
    const sets = await db.select().from(adSets).where(eq(adSets.campaignId, camp.id));
    expect(sets).toHaveLength(2);
    expect(sets.map((s) => s.bidStrategy).sort()).toEqual(["COST_CAP", "LOWEST_COST_WITHOUT_CAP"]);
    expect(sets.every((s) => s.targeting && s.startTime)).toBe(true);
    const d = await getCampaignDetail(o.admin, camp.id, resolvePeriod(30));
    expect(d.adSets.find((s) => s.bidStrategy === "COST_CAP")?.targeting).toMatchObject({ age_min: 25, genders: [2] });
  });
});
