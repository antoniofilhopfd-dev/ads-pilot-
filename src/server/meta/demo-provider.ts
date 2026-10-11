import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { demoRemoteState } from "@/db/schema";
import { MetaApiError, type CampaignPatch, type CampaignRemoteState, type MetaWriter, type MetaProvider, type RemoteAd, type RemoteAdAccount, type RemoteAdSet, type RemoteCampaign, type RemoteInsight } from "./types";

// DADOS SIMULADOS — determinísticos, só para demonstração e testes. Nunca vêm da Meta.
// Inclui casos reais de borda: campanha sem resultado informado, anúncio reprovado, campanha pausada, sem ROAS.
const ACCOUNTS: RemoteAdAccount[] = [
  { externalId: "act_900000001", name: "[DEMO] Loja Exemplo — Conta principal", currency: "BRL", timezone: "America/Sao_Paulo", status: "ACTIVE" },
  { externalId: "act_900000002", name: "[DEMO] Clínica Vida — Captação", currency: "BRL", timezone: "America/Sao_Paulo", status: "ACTIVE" },
];

const CAMPAIGNS: Record<string, (RemoteCampaign & { base: number; cpr: number | null; ctr: number; roas: number | null })[]> = {
  act_900000001: [
    { externalId: "c_1001", name: "Remarketing – Catálogo", objective: "OUTCOME_SALES", status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: 200, lifetimeBudget: null, startTime: new Date("2026-06-01T00:00:00Z"), stopTime: null, base: 190, cpr: 15.4, ctr: 0.021, roas: 4.2 },
    { externalId: "c_1002", name: "Leads – Black Friday", objective: "OUTCOME_LEADS", status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: 120, lifetimeBudget: null, startTime: new Date("2026-09-15T00:00:00Z"), stopTime: null, base: 115, cpr: 16.8, ctr: 0.017, roas: null },
    { externalId: "c_1003", name: "Tráfego – Blog", objective: "OUTCOME_TRAFFIC", status: "ACTIVE", effectiveStatus: "LEARNING_LIMITED", dailyBudget: 50, lifetimeBudget: null, startTime: new Date("2026-08-01T00:00:00Z"), stopTime: null, base: 45, cpr: 1.1, ctr: 0.012, roas: null },
    { externalId: "c_1004", name: "Reconhecimento – Marca", objective: "OUTCOME_AWARENESS", status: "PAUSED", effectiveStatus: "PAUSED", dailyBudget: null, lifetimeBudget: 3000, startTime: new Date("2026-05-01T00:00:00Z"), stopTime: new Date("2026-12-31T00:00:00Z"), base: 0, cpr: null, ctr: 0.008, roas: null },
  ],
  act_900000002: [
    { externalId: "c_2001", name: "Agendamentos – Consulta", objective: "OUTCOME_LEADS", status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: 80, lifetimeBudget: null, startTime: new Date("2026-07-10T00:00:00Z"), stopTime: null, base: 76, cpr: 22, ctr: 0.019, roas: null },
    { externalId: "c_2002", name: "Conversão – Lançamento", objective: "OUTCOME_SALES", status: "ACTIVE", effectiveStatus: "WITH_ISSUES", dailyBudget: 60, lifetimeBudget: null, startTime: new Date("2026-10-01T00:00:00Z"), stopTime: null, base: 0, cpr: null, ctr: 0.01, roas: null },
  ],
};

function seeded(seed: string, day: string): number {
  let h = 2166136261;
  for (const ch of seed + day) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  return ((h >>> 0) % 1000) / 1000; // 0..1 determinístico
}

function* days(since: string, until: string) {
  for (let d = new Date(since + "T00:00:00Z"); d <= new Date(until + "T00:00:00Z"); d = new Date(d.getTime() + 86_400_000)) yield d.toISOString().slice(0, 10);
}

export class DemoProvider implements MetaProvider, MetaWriter {
  readonly mode = "demo" as const;
  // organizationId habilita o "estado remoto" simulado (mudanças feitas pelas operações). Sem ele, só o estado base.
  constructor(private organizationId?: string) {}

  private async overrides(acct: string) {
    if (!this.organizationId) return new Map<string, { status: string | null; dailyBudget: number | null }>();
    const rows = await db.select().from(demoRemoteState).where(and(eq(demoRemoteState.organizationId, this.organizationId), eq(demoRemoteState.accountExternalId, acct)));
    return new Map(rows.map((r) => [r.campaignExternalId, { status: r.status, dailyBudget: r.dailyBudget === null ? null : Number(r.dailyBudget) }]));
  }

  private applyOverride<T extends { status: string | null; effectiveStatus: string | null; dailyBudget: number | null }>(c: T, o?: { status: string | null; dailyBudget: number | null }): T {
    if (!o) return c;
    const status = o.status ?? c.status;
    const wasPaused = c.effectiveStatus === "PAUSED" || c.effectiveStatus === "CAMPAIGN_PAUSED";
    const effectiveStatus = status === "PAUSED" ? "PAUSED" : wasPaused ? "ACTIVE" : c.effectiveStatus;
    return { ...c, status, effectiveStatus, dailyBudget: o.dailyBudget ?? c.dailyBudget };
  }

  async getCampaignState(acct: string, camp: string): Promise<CampaignRemoteState> {
    const base = this.camps(acct).find((c) => c.externalId === camp);
    if (!base) throw new MetaApiError("permission", "Campanha não encontrada ou sem acesso (demo).", 100);
    const c = this.applyOverride({ status: base.status, effectiveStatus: base.effectiveStatus, dailyBudget: base.dailyBudget }, (await this.overrides(acct)).get(camp));
    return c;
  }

  async updateCampaign(acct: string, camp: string, patch: CampaignPatch): Promise<void> {
    if (!this.organizationId) throw new MetaApiError("unknown", "Ambiente demo sem organização.");
    const cur = await this.getCampaignState(acct, camp);
    const status = patch.status ?? cur.status;
    const dailyBudget = patch.dailyBudget ?? cur.dailyBudget;
    await db.insert(demoRemoteState).values({ organizationId: this.organizationId, accountExternalId: acct, campaignExternalId: camp, status, dailyBudget: dailyBudget === null ? null : dailyBudget.toFixed(2) })
      .onDuplicateKeyUpdate({ set: { status, dailyBudget: dailyBudget === null ? null : dailyBudget.toFixed(2) } });
  }

  async listAdAccounts() { return ACCOUNTS; }
  private camps(acct: string) {
    const c = CAMPAIGNS[acct];
    if (!c) throw new MetaApiError("permission", "Conta não acessível nesta conexão (demo).", 200);
    return c;
  }
  async listCampaigns(acct: string): Promise<RemoteCampaign[]> {
    const ov = await this.overrides(acct);
    return this.camps(acct).map(({ base, cpr, ctr, roas, ...c }) => this.applyOverride(c, ov.get(c.externalId)));
  }
  async listAdSets(acct: string): Promise<RemoteAdSet[]> {
    return this.camps(acct).flatMap((c) => [
      { externalId: `${c.externalId}_s1`, campaignExternalId: c.externalId, name: `${c.name} — Público amplo`, status: c.status, effectiveStatus: c.effectiveStatus, optimizationGoal: c.objective === "OUTCOME_SALES" ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS", dailyBudget: null, lifetimeBudget: null,
        bidStrategy: "LOWEST_COST_WITHOUT_CAP", startTime: c.startTime, endTime: c.stopTime, targeting: { age_min: 18, age_max: 65, geo_locations: { countries: ["BR"] }, publisher_platforms: ["facebook", "instagram"] } },
      { externalId: `${c.externalId}_s2`, campaignExternalId: c.externalId, name: `${c.name} — Interesses`, status: c.status, effectiveStatus: c.effectiveStatus, optimizationGoal: c.objective === "OUTCOME_SALES" ? "OFFSITE_CONVERSIONS" : "LINK_CLICKS", dailyBudget: null, lifetimeBudget: null,
        bidStrategy: c.objective === "OUTCOME_SALES" ? "COST_CAP" : "LOWEST_COST_WITHOUT_CAP", startTime: c.startTime, endTime: c.stopTime, targeting: { age_min: 25, age_max: 54, genders: [2], geo_locations: { countries: ["BR"], cities: [{ name: "São Paulo" }] }, interests: [{ id: "6003139266461", name: "Compras online" }], publisher_platforms: ["instagram"] } },
    ]);
  }
  async listAds(acct: string): Promise<RemoteAd[]> {
    return this.camps(acct).flatMap((c) => [1, 2].map((n): RemoteAd => ({
      externalId: `${c.externalId}_s1_a${n}`, adSetExternalId: `${c.externalId}_s1`, name: `Criativo ${n} — ${c.name}`,
      status: "ACTIVE", effectiveStatus: c.externalId === "c_2002" ? "DISAPPROVED" : c.effectiveStatus,
    })));
  }
  async getDailyInsights(acct: string, since: string, until: string): Promise<RemoteInsight[]> {
    const out: RemoteInsight[] = [];
    for (const c of this.camps(acct)) {
      for (const day of days(since, until)) {
        if (c.base === 0) continue; // pausada/reprovada: sem entrega → a API simplesmente não devolve linha
        const spend = Math.round(c.base * (0.8 + 0.4 * seeded(c.externalId, day)) * 100) / 100;
        const impressions = Math.round((spend / 14) * 1000 * (0.9 + 0.2 * seeded(c.externalId + "i", day)));
        const clicks = Math.round(impressions * c.ctr);
        const results = c.cpr ? Math.round(spend / c.cpr) : null;
        out.push({
          campaignExternalId: c.externalId, date: day, spend, impressions, clicks,
          reach: Math.round(impressions * 0.72), results, resultType: results === null ? null : c.objective === "OUTCOME_SALES" ? "purchase" : c.objective === "OUTCOME_LEADS" ? "lead" : "link_click",
          purchaseValue: c.roas && results !== null ? Math.round(spend * c.roas * 100) / 100 : null,
        });
      }
    }
    return out;
  }
}
