import { and, eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { auditLog, campaigns, demoRemoteState, operations } from "@/db/schema";
import { configureAccount, connectDemo, listAccounts, connectWithToken } from "@/server/meta/connection";
import { DemoProvider } from "@/server/meta/demo-provider";
import { cancelOperation, executeOperation, getOperation, listOperations, prepareOperation, reconcileOperation } from "@/server/meta/operations";
import { syncAccount } from "@/server/meta/sync";
import { MetaApiError, type MetaProvider } from "@/server/meta/types";
import { addUserWithRole, newOrg } from "./helpers";

const NOW = new Date("2026-10-11T12:00:00Z");

async function setup(label = "Op") {
  const org = await newOrg(label);
  await connectDemo(org.admin);
  const accts = await listAccounts(org.admin);
  const loja = accts.find((a) => a.name.includes("Loja Exemplo"))!;
  await configureAccount(org.admin, loja.id, { selected: true, clientId: null });
  await syncAccount(org.admin, loja.id, { now: NOW, sleep: async () => {} });
  const camps = await db.select().from(campaigns).where(eq(campaigns.adAccountId, loja.id));
  const by = (n: string) => camps.find((c) => c.name.startsWith(n))!;
  return { ...org, loja, remarketing: by("Remarketing"), leads: by("Leads"), pausada: by("Reconhecimento") };
}

// provedor de teste: demo + sobrescritas na escrita
function wrap(orgId: string, over: Partial<Pick<DemoProvider, "updateCampaign" | "getCampaignState">>): MetaProvider {
  const d = new DemoProvider(orgId);
  const p = Object.create(d) as DemoProvider;
  Object.assign(p, over && { updateCampaign: over.updateCampaign ?? d.updateCampaign.bind(d), getCampaignState: over.getCampaignState ?? d.getCampaignState.bind(d) });
  return p;
}

describe("operações de campanha (ambiente demo)", () => {
  it("pausa: prepara (atual × novo), confirma, executa e VERIFICA no remoto; audita antes/depois", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    expect(prep.before.status).toBe("ACTIVE");
    expect(prep.warnings.join(" ")).toMatch(/SIMULAÇÃO/);
    // preparar NÃO altera nada
    expect((await new DemoProvider(o.organizationId).getCampaignState(o.loja.externalId, o.remarketing.externalId)).status).toBe("ACTIVE");
    const r = await executeOperation(o.admin, prep.operationId);
    expect(r).toMatchObject({ status: "succeeded", verified: true, mode: "demo" });
    expect(r.after?.status).toBe("PAUSED");
    const [local] = await db.select().from(campaigns).where(eq(campaigns.id, o.remarketing.id));
    expect(local.effectiveStatus).toBe("PAUSED");
    const logs = await db.select().from(auditLog).where(and(eq(auditLog.organizationId, o.organizationId), eq(auditLog.action, "operation.pause")));
    expect(logs).toHaveLength(1);
    expect(logs[0]).toMatchObject({ result: "success", userId: o.userId, objectId: o.remarketing.id });
    expect(logs[0].before).toMatchObject({ status: "ACTIVE" }); expect(logs[0].after).toMatchObject({ status: "PAUSED" });
  });

  it("reativa só campanha pausada; pausa só campanha ativa", async () => {
    const o = await setup();
    await expect(prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "activate" })).rejects.toMatchObject({ code: "validation" });
    await expect(prepareOperation(o.admin, { campaignId: o.pausada.id, type: "pause" })).rejects.toMatchObject({ code: "validation" });
    const prep = await prepareOperation(o.admin, { campaignId: o.pausada.id, type: "activate" });
    expect((await executeOperation(o.admin, prep.operationId)).status).toBe("succeeded");
  });

  it("orçamento: valida limites e exige confirmação reforçada para aumento grande", async () => {
    const o = await setup();
    const id = o.remarketing.id;
    for (const dailyBudget of [0, -5, 2_000_000, 200]) await expect(prepareOperation(o.admin, { campaignId: id, type: "set_daily_budget", dailyBudget })).rejects.toMatchObject({ code: "validation" });
    await expect(prepareOperation(o.admin, { campaignId: id, type: "set_daily_budget" })).rejects.toMatchObject({ code: "validation" });
    await expect(prepareOperation(o.admin, { campaignId: o.pausada.id, type: "set_daily_budget", dailyBudget: 50 })).rejects.toMatchObject({ code: "validation" }); // orçamento total, sem diário
    const big = await prepareOperation(o.admin, { campaignId: id, type: "set_daily_budget", dailyBudget: 500 }); // +150%
    expect(big.requiresAcknowledgement).toBe(true);
    await expect(executeOperation(o.admin, big.operationId)).rejects.toMatchObject({ code: "validation" });
    const r = await executeOperation(o.admin, big.operationId, { acknowledgeLargeChange: true });
    expect(r.status).toBe("succeeded"); expect(r.after?.dailyBudget).toBe(500);
    const [local] = await db.select().from(campaigns).where(eq(campaigns.id, id));
    expect(Number(local.dailyBudget)).toBe(500);
  });

  it("idempotência: executar de novo devolve o mesmo resultado sem nova escrita", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    await executeOperation(o.admin, prep.operationId);
    let writes = 0;
    const spy = wrap(o.organizationId, { updateCampaign: async () => { writes++; } });
    const again = await executeOperation(o.admin, prep.operationId, {}, { provider: spy });
    expect(again.status).toBe("succeeded"); expect(writes).toBe(0);
  });

  it("duas confirmações simultâneas: só uma escrita acontece", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    let writes = 0;
    const d = new DemoProvider(o.organizationId);
    const slow = wrap(o.organizationId, { updateCampaign: async (a, c, p) => { writes++; await new Promise((r) => setTimeout(r, 150)); return d.updateCampaign(a, c, p); } });
    const res = await Promise.allSettled([executeOperation(o.admin, prep.operationId, {}, { provider: slow }), executeOperation(o.admin, prep.operationId, {}, { provider: slow })]);
    expect(writes).toBe(1);
    expect(res.filter((r) => r.status === "fulfilled" && (r.value as { status: string }).status === "succeeded").length).toBeGreaterThanOrEqual(1);
    expect(await db.select().from(demoRemoteState).where(eq(demoRemoteState.organizationId, o.organizationId))).toHaveLength(1);
  });

  it("estado mudou entre preparar e confirmar: aborta sem escrever", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "set_daily_budget", dailyBudget: 220 });
    await new DemoProvider(o.organizationId).updateCampaign(o.loja.externalId, o.remarketing.externalId, { dailyBudget: 300 }); // alguém mudou na Meta
    const r = await executeOperation(o.admin, prep.operationId);
    expect(r.status).toBe("failed"); expect(r.message).toMatch(/mudou/);
    expect((await new DemoProvider(o.organizationId).getCampaignState(o.loja.externalId, o.remarketing.externalId)).dailyBudget).toBe(300);
  });

  it("erro ambíguo (a Meta aplicou mas a chamada falhou): resolvido como sucesso só após ler o remoto, sem repetir a escrita", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    const d = new DemoProvider(o.organizationId);
    let writes = 0;
    const p = wrap(o.organizationId, { updateCampaign: async (a, c, pt) => { writes++; await d.updateCampaign(a, c, pt); throw new MetaApiError("transient", "timeout"); } });
    const r = await executeOperation(o.admin, prep.operationId, {}, { provider: p });
    expect(r.status).toBe("succeeded"); expect(r.message).toMatch(/devolveu erro/); expect(writes).toBe(1);
  });

  it("falha comprovada (não aplicou): marca falha e informa que é seguro preparar de novo", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    const p = wrap(o.organizationId, { updateCampaign: async () => { throw new MetaApiError("permission", "sem permissão", 200); } });
    const r = await executeOperation(o.admin, prep.operationId, {}, { provider: p });
    expect(r.status).toBe("failed"); expect(r.message).toMatch(/seguro preparar/);
    const [log] = await db.select().from(auditLog).where(and(eq(auditLog.organizationId, o.organizationId), eq(auditLog.action, "operation.pause")));
    expect(log.result).toBe("failure");
  });

  it("sucesso aparente sem efeito → ambíguo (nunca declara concluído sem verificar); reconciliar depois resolve", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    const noop = wrap(o.organizationId, { updateCampaign: async () => {} }); // "aceita" mas não aplica
    const r = await executeOperation(o.admin, prep.operationId, {}, { provider: noop });
    expect(r.status).toBe("ambiguous"); expect(r.verified).toBe(false);
    // depois a mudança efetivamente aparece no remoto (atraso de propagação)
    await new DemoProvider(o.organizationId).updateCampaign(o.loja.externalId, o.remarketing.externalId, { status: "PAUSED" });
    expect((await reconcileOperation(o.admin, prep.operationId)).status).toBe("succeeded");
  });

  it("verificação indisponível após escrever → ambíguo", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    const d = new DemoProvider(o.organizationId);
    let reads = 0;
    const p = wrap(o.organizationId, { getCampaignState: async (a, c) => { if (++reads >= 2) throw new MetaApiError("transient", "indisponível"); return d.getCampaignState(a, c); } });
    const r = await executeOperation(o.admin, prep.operationId, {}, { provider: p });
    expect(r.status).toBe("ambiguous"); expect(r.message).toMatch(/Resultado desconhecido/);
  });

  it("confirmação expira", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" }, { now: new Date(Date.now() - 3_600_000) });
    await expect(executeOperation(o.admin, prep.operationId)).rejects.toMatchObject({ code: "conflict" });
    expect((await getOperation(o.admin, prep.operationId)).status).toBe("expired");
    expect((await listOperations(o.admin)).length).toBeGreaterThan(0);
  });

  it("cancelar impede a execução", async () => {
    const o = await setup();
    const prep = await prepareOperation(o.admin, { campaignId: o.remarketing.id, type: "pause" });
    await cancelOperation(o.admin, prep.operationId);
    expect((await executeOperation(o.admin, prep.operationId)).status).toBe("cancelled");
    expect((await new DemoProvider(o.organizationId).getCampaignState(o.loja.externalId, o.remarketing.externalId)).status).toBe("ACTIVE");
  });
});

describe("autorização das operações", () => {
  it("analista não prepara nem confirma; gestor opera; confirmação é vinculada a quem preparou (ou admin)", async () => {
    const o = await setup();
    const an = await addUserWithRole(o, "analyst");
    const m1 = await addUserWithRole(o, "manager");
    const m2 = await addUserWithRole(o, "manager");
    await expect(prepareOperation(an.actor, { campaignId: o.remarketing.id, type: "pause" })).rejects.toMatchObject({ code: "forbidden" });
    const prep = await prepareOperation(m1.actor, { campaignId: o.remarketing.id, type: "pause" });
    await expect(executeOperation(an.actor, prep.operationId)).rejects.toMatchObject({ code: "forbidden" });
    await expect(executeOperation(m2.actor, prep.operationId)).rejects.toMatchObject({ code: "forbidden" }); // outro gestor
    expect((await executeOperation(o.admin, prep.operationId)).status).toBe("succeeded"); // admin pode
    const [op] = await db.select().from(operations).where(eq(operations.id, prep.operationId));
    expect(op).toMatchObject({ createdBy: m1.userId, confirmedBy: o.userId });
  });

  it("outra organização não consegue preparar, ver, confirmar nem cancelar", async () => {
    const a = await setup("A");
    const b = await setup("B");
    await expect(prepareOperation(b.admin, { campaignId: a.remarketing.id, type: "pause" })).rejects.toMatchObject({ code: "not_found" });
    const prep = await prepareOperation(a.admin, { campaignId: a.remarketing.id, type: "pause" });
    await expect(executeOperation(b.admin, prep.operationId)).rejects.toMatchObject({ code: "not_found" });
    await expect(cancelOperation(b.admin, prep.operationId)).rejects.toMatchObject({ code: "not_found" });
    await expect(getOperation(b.admin, prep.operationId)).rejects.toMatchObject({ code: "not_found" });
    expect((await listOperations(b.admin)).map((x) => x.op.id)).not.toContain(prep.operationId);
  });

  it("Meta REAL: escrita bloqueada (não habilitada), nada é gravado", async () => {
    const org = await newOrg("Real");
    const fake: MetaProvider = {
      mode: "meta", listAdAccounts: async () => [{ externalId: "act_77", name: "Real", currency: "BRL", timezone: null, status: null }],
      listCampaigns: async () => [{ externalId: "c1", name: "Camp real", objective: "OUTCOME_SALES", status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: 100, lifetimeBudget: null, startTime: null, stopTime: null }],
      listAdSets: async () => [], listAds: async () => [], getDailyInsights: async () => [],
    };
    await connectWithToken(org.admin, "EAAB-x", null, fake);
    const [acct] = await listAccounts(org.admin);
    await configureAccount(org.admin, acct.id, { selected: true, clientId: null });
    await syncAccount(org.admin, acct.id, { now: NOW, provider: fake, sleep: async () => {} });
    const [camp] = await db.select().from(campaigns).where(eq(campaigns.adAccountId, acct.id));
    await expect(prepareOperation(org.admin, { campaignId: camp.id, type: "pause" }, { provider: fake })).rejects.toThrow(/ainda não está habilitado/);
    expect(await db.select().from(operations).where(eq(operations.organizationId, org.organizationId))).toHaveLength(0);
  });
});
