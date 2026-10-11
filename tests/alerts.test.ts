import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { alerts, notifications, DEFAULT_ALERT_CONFIG } from "@/db/schema";
import { aggregate, type Row } from "@/lib/metrics";
import { campaignFindings, diagnose, type CampaignFacts } from "@/lib/analysis";
import { acknowledgeAlert, evaluateAlerts, getAlertConfig, listAlerts, listNotifications, markNotificationsRead, saveAlertConfig, unreadCount } from "@/server/alerts";
import { campaignDiagnostics } from "@/server/diagnostics";
import { setBudgetPlan, deleteBudgetPlan } from "@/server/budget";
import { setGoal } from "@/server/goals";
import { getActor } from "@/server/context";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { syncAccount } from "@/server/meta/sync";
import { setMemberAccess } from "@/server/services/organizations";
import { campaigns } from "@/db/schema";
import { addUserWithRole, newOrg } from "./helpers";

const cfg = DEFAULT_ALERT_CONFIG;
const r = (o: Partial<Row>): Row => ({ spend: 100, impressions: 5000, reach: 3000, clicks: 100, results: 20, resultType: "lead", purchaseValue: null, ...o });
const facts = (cur: Row, prev: Row, extra: Partial<CampaignFacts> = {}): CampaignFacts => ({
  id: "c1", name: "Camp", accountId: "a1", accountName: "Conta", currency: "BRL", objective: "OUTCOME_LEADS", effectiveStatus: "ACTIVE",
  cur: aggregate([{ ...cur, date: "2026-03-10" }]), prev: aggregate([{ ...prev, date: "2026-03-03" }]), latestDay: { date: "2026-03-10", totals: aggregate([{ ...cur, date: "2026-03-10" }]) }, recentZeroDelivery: false,
  period: { since: "2026-03-04", until: "2026-03-10", prevSince: "2026-02-25", prevUntil: "2026-03-03" }, ...extra,
});

describe("métricas por tipo", () => {
  it("separa leads e compras, sem misturar", () => {
    const t = aggregate([{ ...r({}), date: "1" }, { ...r({ resultType: "purchase", results: 5, spend: 100 }), date: "2" }]);
    expect(t.leads).toBe(20); expect(t.cpl).toBe(5); expect(t.purchases).toBe(5); expect(t.cpa).toBe(20);
    expect(aggregate([{ ...r({ resultType: "link_click" }), date: "1" }]).cpl).toBeNull();
    expect(aggregate([{ ...r({ resultType: null }), date: "1" }]).leads).toBeNull();
  });
});

describe("regras de alerta (puras)", () => {
  it("custo subiu com amostra suficiente", () => {
    const f = campaignFindings(facts(r({ spend: 200 }), r({ spend: 100 })), cfg);
    expect(f.map((x) => x.type)).toContain("cost_rise");
  });
  it("não alerta com amostra pequena nem com resultados insuficientes", () => {
    expect(campaignFindings(facts(r({ spend: 200, impressions: 200 }), r({})), cfg)).toHaveLength(0);
    expect(campaignFindings(facts(r({ spend: 200, results: 3 }), r({ results: 3 })), cfg)).toHaveLength(0);
  });
  it("CTR caiu, frequência alta, sem entrega", () => {
    expect(campaignFindings(facts(r({ clicks: 40 }), r({ clicks: 100 })), cfg).map((x) => x.type)).toContain("ctr_drop");
    expect(campaignFindings(facts(r({ impressions: 6000, reach: 1000 }), r({})), cfg).map((x) => x.type)).toContain("frequency_high");
    expect(campaignFindings(facts(r({}), r({}), { recentZeroDelivery: true }), cfg).map((x) => x.type)).toContain("no_delivery");
    expect(campaignFindings(facts(r({}), r({}), { recentZeroDelivery: true, effectiveStatus: "PAUSED" }), cfg)).toHaveLength(0);
  });
  it("regra desabilitada não dispara", () => {
    expect(campaignFindings(facts(r({ spend: 200 }), r({})), { ...cfg, enabled: { cost_rise: false } }).map((x) => x.type)).not.toContain("cost_rise");
  });
});

describe("diagnóstico (puro)", () => {
  it("amostra pequena: sem hipótese", () => {
    const d = diagnose(facts(r({ impressions: 100 }), r({})), cfg);
    expect(d).toHaveLength(1); expect(d[0].id).toBe("amostra_pequena"); expect(d[0].hypothesis).toBeNull(); expect(d[0].confidence).toBe("baixa");
  });
  it("sem dados", () => {
    const f = facts(r({}), r({})); f.cur = aggregate([]);
    expect(diagnose(f, cfg)[0].id).toBe("sem_dados");
  });
  it("fadiga: hipótese rotulada como não comprovada", () => {
    const f = facts(r({ spend: 200, clicks: 50, impressions: 6000, reach: 1500 }), r({}));
    const d = diagnose(f, cfg).find((x) => x.id === "custo_subiu")!;
    expect(d.hypothesis).toMatch(/não comprovada/); expect(d.hypothesis).toMatch(/fadiga/); expect(d.confidence).toBe("média");
  });
  it("pós-clique", () => {
    const f = facts(r({ spend: 200, results: 12 }), r({}));
    const d = diagnose(f, cfg).find((x) => x.id === "custo_subiu")!;
    expect(d.hypothesis).toMatch(/depois do clique/);
  });
  it("estável", () => { expect(diagnose(facts(r({}), r({})), cfg).some((x) => x.id === "estavel")).toBe(true); });
});

async function world() {
  const o = await newOrg("Al");
  await connectDemo(o.admin);
  const accts = await listAccounts(o.admin);
  for (const a of accts.slice(0, 2)) { await configureAccount(o.admin, a.id, { selected: true, clientId: null }); await syncAccount(o.admin, a.id, { now: new Date(), sleep: async () => {} }); }
  return { o, accts: accts.slice(0, 2), now: new Date() };
}

describe("motor de alertas (serviço)", () => {
  it("abre, deduplica, reconhece, resolve e reabre; notifica", async () => {
    const w = await world();
    const period = w.now.toISOString().slice(0, 7);
    const bid = await setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.accts[0].id, period, amount: 1 });
    const g1 = await evaluateAlerts(w.o.organizationId, w.now);
    expect(g1.opened).toBeGreaterThanOrEqual(1);
    const list = await listAlerts(w.o.admin);
    const ex = list.find((a) => a.type === "budget_exceeded")!;
    expect(ex.severity).toBe("critical"); expect(ex.detail.assumptions?.length).toBeGreaterThan(0);
    const g2 = await evaluateAlerts(w.o.organizationId, w.now);
    expect(g2.opened).toBe(0); // dedupe: nada de novo
    expect((await db.select().from(alerts).where(and(eq(alerts.organizationId, w.o.organizationId), eq(alerts.type, "budget_exceeded")))).length).toBe(1);
    expect((await db.select().from(alerts).where(eq(alerts.id, ex.id)))[0].occurrences).toBe(2);
    expect(g2.notified).toBe(0); // reaviso só após renotifyHours
    expect(await unreadCount(w.o.admin)).toBeGreaterThanOrEqual(1);
    expect((await listNotifications(w.o.admin))[0].href).toBe("/app/alertas");
    await markNotificationsRead(w.o.admin); expect(await unreadCount(w.o.admin)).toBe(0);
    await acknowledgeAlert(w.o.admin, ex.id);
    await expect(acknowledgeAlert(w.o.admin, ex.id)).rejects.toThrow();
    expect((await db.select().from(alerts).where(eq(alerts.id, ex.id)))[0].state).toBe("acknowledged");
    await deleteBudgetPlan(w.o.admin, bid);
    const g3 = await evaluateAlerts(w.o.organizationId, w.now);
    expect(g3.resolved).toBeGreaterThanOrEqual(1);
    expect((await listAlerts(w.o.admin)).some((a) => a.id === ex.id)).toBe(false);
    await setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.accts[0].id, period, amount: 1 });
    const g4 = await evaluateAlerts(w.o.organizationId, w.now);
    expect(g4.opened).toBeGreaterThanOrEqual(1);
    expect((await db.select().from(alerts).where(eq(alerts.id, ex.id)))[0].state).toBe("open"); // reabriu o MESMO alerta
  });

  it("meta não atingida gera alerta; reaviso após o prazo", async () => {
    const w = await world();
    await setGoal(w.o.admin, { scope: "org", metric: "ctr", direction: "min", target: 99 });
    await evaluateAlerts(w.o.organizationId, w.now);
    expect((await listAlerts(w.o.admin)).some((a) => a.type === "goal_not_met")).toBe(true);
    const later = new Date(w.now.getTime() + 25 * 3_600_000);
    const g = await evaluateAlerts(w.o.organizationId, later);
    expect(g.notified).toBeGreaterThan(0); // passou de 24 h e continua aberto
  });

  it("configuração: validação, responsáveis e auditoria; analista não altera", async () => {
    const w = await world();
    const base = { costRisePct: 30, ctrDropPct: 30, frequencyMax: 4, minImpressions: 2000, minResults: 5, noDeliveryDays: 2, renotifyHours: 12, responsibleUserIds: [w.o.userId], enabled: { stale_sync: false } };
    await saveAlertConfig(w.o.admin, base);
    expect((await getAlertConfig(w.o.organizationId)).costRisePct).toBe(30);
    await expect(saveAlertConfig(w.o.admin, { ...base, costRisePct: 1 })).rejects.toThrow();
    await expect(saveAlertConfig(w.o.admin, { ...base, responsibleUserIds: ["00000000-0000-4000-8000-000000000000"] })).rejects.toThrow(/organização/);
    const an = await addUserWithRole(w.o, "analyst");
    await expect(saveAlertConfig(an.actor, base)).rejects.toThrow();
    await expect(acknowledgeAlert(an.actor, "x")).rejects.toThrow();
  });

  it("acesso restrito vê só alertas das suas contas; isolamento entre organizações", async () => {
    const w = await world();
    const period = w.now.toISOString().slice(0, 7);
    for (const a of w.accts) await setBudgetPlan(w.o.admin, { scope: "account", scopeId: a.id, period, amount: 1 });
    await evaluateAlerts(w.o.organizationId, w.now);
    const mgr = await addUserWithRole(w.o, "manager");
    await setMemberAccess(w.o.admin, mgr.userId, { scope: "restricted", accountIds: [w.accts[0].id] });
    const act = await getActor(mgr.userId, w.o.organizationId);
    const mine = await listAlerts(act);
    expect(mine.length).toBeGreaterThan(0); expect(mine.every((a) => a.adAccountId === w.accts[0].id)).toBe(true);
    const all = await listAlerts(w.o.admin); const hidden = all.find((a) => a.adAccountId === w.accts[1].id)!;
    await expect(acknowledgeAlert(act, hidden.id)).rejects.toThrow();
    const notif = await db.select().from(notifications).where(and(eq(notifications.organizationId, w.o.organizationId), eq(notifications.userId, mgr.userId)));
    expect(notif.every((n) => !n.body.includes(w.accts[1].name))).toBe(true);
    const other = await newOrg("Al2");
    expect(await listAlerts(other.admin)).toHaveLength(0);
    await expect(acknowledgeAlert(other.admin, hidden.id)).rejects.toThrow();
  });

  it("diagnóstico de campanha respeita acesso e organização", async () => {
    const w = await world();
    const camp = (await db.select().from(campaigns).where(eq(campaigns.organizationId, w.o.organizationId)))[0];
    const d = await campaignDiagnostics(w.o.admin, camp.id, w.now);
    expect(d.items.length).toBeGreaterThan(0); expect(d.llm.available).toBe(false);
    for (const i of d.items) if (i.hypothesis) expect(i.hypothesis).toMatch(/não comprovada|Possíveis causas|Hipótese/);
    const other = await newOrg("Al3");
    await expect(campaignDiagnostics(other.admin, camp.id)).rejects.toThrow();
  });
});
