import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { campaigns } from "@/db/schema";
import { computePacing, simulateRedistribution } from "@/lib/pacing";
import { setBudgetPlan, deleteBudgetPlan, listBudgets, budgetHistory, simulationBase } from "@/server/budget";
import { deleteGoal, evaluateGoals, setGoal } from "@/server/goals";
import { getActor } from "@/server/context";
import { createClient } from "@/server/services/clients";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { syncAccount } from "@/server/meta/sync";
import { setMemberAccess } from "@/server/services/organizations";
import { addUserWithRole, newOrg } from "./helpers";

const rows = (n: number, v: number, month = "2026-03") => Array.from({ length: n }, (_, i) => ({ date: `${month}-${String(i + 1).padStart(2, "0")}`, spend: v }));

describe("computePacing", () => {
  it("sem dados não é zero", () => {
    const p = computePacing({ period: "2026-03", amount: 3100, rows: [], today: "2026-03-10" });
    expect(p.status).toBe("sem_dados"); expect(p.spent).toBeNull(); expect(p.projectedClose).toBeNull();
  });
  it("período futuro", () => {
    expect(computePacing({ period: "2026-04", amount: 100, rows: [], today: "2026-03-10" }).status).toBe("periodo_futuro");
  });
  it("no ritmo e projeção", () => {
    const p = computePacing({ period: "2026-03", amount: 3100, rows: rows(10, 100), today: "2026-03-10" });
    expect(p.spent).toBe(1000); expect(p.expectedSpent).toBe(1000); expect(p.status).toBe("no_ritmo");
    expect(p.projectedClose).toBe(3100); expect(p.suggestedDaily).toBeCloseTo(2100 / 21);
  });
  it("menos de 3 dias: não projeta", () => {
    const p = computePacing({ period: "2026-03", amount: 3100, rows: rows(2, 100), today: "2026-03-02" });
    expect(p.projectedClose).toBeNull();
  });
  it("projeção excede / excedido / marcos", () => {
    expect(computePacing({ period: "2026-03", amount: 3100, rows: rows(10, 150), today: "2026-03-10" }).status).toBe("projecao_excede");
    const ex = computePacing({ period: "2026-03", amount: 500, rows: rows(10, 100), today: "2026-03-10", milestones: [50, 80, 100] });
    expect(ex.status).toBe("excedido"); expect(ex.milestonesReached).toEqual([50, 80, 100]);
  });
  it("abaixo do ritmo", () => {
    expect(computePacing({ period: "2026-03", amount: 3100, rows: rows(10, 50), today: "2026-03-10" }).status).toBe("abaixo_do_ritmo");
  });
  it("fevereiro bissexto e mês encerrado", () => {
    const p = computePacing({ period: "2028-02", amount: 2900, rows: rows(29, 100, "2028-02"), today: "2028-03-05" });
    expect(p.daysInMonth).toBe(29); expect(p.remainingDays).toBe(0); expect(p.spent).toBe(2900);
  });
  it("ignora gasto nulo", () => {
    const p = computePacing({ period: "2026-03", amount: 1000, rows: [{ date: "2026-03-01", spend: null }], today: "2026-03-05" });
    expect(p.status).toBe("sem_dados");
  });
});

describe("simulateRedistribution", () => {
  const camps = [{ id: "a", name: "A", dailySpend: 100, costPerResult: 10 }, { id: "b", name: "B", dailySpend: 50, costPerResult: 25 }];
  it("calcula com CPR constante", () => {
    const r = simulateRedistribution(camps, [{ id: "a", newDaily: 150 }, { id: "b", newDaily: 0 }], 10);
    expect(r.totals.spendCurrent).toBe(1500); expect(r.totals.spendNew).toBe(1500);
    expect(r.totals.resultsCurrent).toBe(100 + 20); expect(r.totals.resultsNew).toBe(150);
    expect(r.assumptions.length).toBeGreaterThan(2);
  });
  it("sem CPR: total de resultados é null, não zero", () => {
    const r = simulateRedistribution([...camps, { id: "c", name: "C", dailySpend: 20, costPerResult: null }], [], 5);
    expect(r.totals.resultsCurrent).toBeNull(); expect(r.totals.deltaResults).toBeNull();
  });
});

async function world() {
  const o = await newOrg("Bg");
  await connectDemo(o.admin);
  const accts = await listAccounts(o.admin);
  const loja = accts.find((a) => a.name.includes("Loja"))!, clin = accts.find((a) => a.name.includes("Clínica"))!;
  const cl = await createClient(o.admin, { name: "Cli" });
  await configureAccount(o.admin, loja.id, { selected: true, clientId: cl });
  await configureAccount(o.admin, clin.id, { selected: true, clientId: null });
  const now = new Date();
  for (const a of [loja, clin]) await syncAccount(o.admin, a.id, { now, sleep: async () => {} });
  return { o, loja, clin, cl, now, period: now.toISOString().slice(0, 7) };
}

describe("orçamento e metas (serviços)", () => {
  it("CRUD, ritmo, histórico, auditoria e isolamento", async () => {
    const w = await world();
    const id = await setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.loja.id, period: w.period, amount: 5000 });
    expect(await setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.loja.id, period: w.period, amount: 6000 })).toBe(id); // upsert
    const list = await listBudgets(w.o.admin, w.period, w.now);
    expect(list).toHaveLength(1); expect(list[0].amount).toBe(6000); expect(list[0].scopeLabel).toContain("Loja");
    expect((await budgetHistory(w.o.admin, id)).length).toBe(2);
    await expect(setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.loja.id, period: "2026-13", amount: 1 })).rejects.toThrow();
    await expect(setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.loja.id, period: w.period, amount: -5 })).rejects.toThrow();
    const other = await newOrg("Out");
    await expect(setBudgetPlan(other.admin, { scope: "account", scopeId: w.loja.id, period: w.period, amount: 10 })).rejects.toThrow();
    expect(await listBudgets(other.admin, w.period)).toHaveLength(0);
    await expect(deleteBudgetPlan(other.admin, id)).rejects.toThrow();
    const sim = await simulationBase(w.o.admin, "account", w.loja.id, w.now);
    expect(sim.campaigns.length).toBeGreaterThan(0);
    await deleteBudgetPlan(w.o.admin, id);
    expect(await listBudgets(w.o.admin, w.period)).toHaveLength(0);
  });

  it("restrito: não vê/edita orçamento de conta não liberada; analista não gerencia", async () => {
    const w = await world();
    await setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.clin.id, period: w.period, amount: 1000 });
    await setBudgetPlan(w.o.admin, { scope: "account", scopeId: w.loja.id, period: w.period, amount: 2000 });
    const mgr = await addUserWithRole(w.o, "manager");
    await setMemberAccess(w.o.admin, mgr.userId, { scope: "restricted", accountIds: [w.loja.id] });
    const act = await getActor(mgr.userId, w.o.organizationId);
    const seen = await listBudgets(act, w.period, w.now);
    expect(seen.map((b) => b.scopeLabel).join()).toContain("Loja"); expect(seen).toHaveLength(1);
    await expect(setBudgetPlan(act, { scope: "account", scopeId: w.clin.id, period: w.period, amount: 5 })).rejects.toThrow();
    const an = await addUserWithRole(w.o, "analyst");
    await expect(setBudgetPlan(an.actor, { scope: "account", scopeId: w.loja.id, period: w.period, amount: 5 })).rejects.toThrow();
  });

  it("metas: avalia, nunca 'atingida' sem dado, isolamento", async () => {
    const w = await world();
    const camp = (await db.select().from(campaigns).where(eq(campaigns.organizationId, w.o.organizationId)))[0];
    await setGoal(w.o.admin, { scope: "org", metric: "ctr", direction: "min", target: 0.0001 });
    await setGoal(w.o.admin, { scope: "campaign", scopeId: camp.id, metric: "spend", direction: "max", target: 1 });
    const g = await evaluateGoals(w.o.admin, w.now);
    expect(g.length).toBe(2);
    for (const r of g) if (r.current === null) expect(r.status).toBe("sem_dados");
    const sp = g.find((r) => r.metric === "spend")!; expect(["nao_atingida", "amostra_insuficiente", "sem_dados"]).toContain(sp.status);
    await expect(setGoal(w.o.admin, { scope: "campaign", scopeId: camp.id, metric: "cpa", direction: "max", target: 0 })).rejects.toThrow();
    const other = await newOrg("Out2");
    expect(await evaluateGoals(other.admin, w.now)).toHaveLength(0);
    await expect(deleteGoal(other.admin, g[0].id)).rejects.toThrow();
    await deleteGoal(w.o.admin, g[0].id);
    expect(await evaluateGoals(w.o.admin, w.now)).toHaveLength(1);
  });
});
