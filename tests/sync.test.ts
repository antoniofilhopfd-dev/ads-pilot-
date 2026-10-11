import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { adAccounts, campaigns, insightsDaily, metaConnections, syncRuns } from "@/db/schema";
import { decryptSecret } from "@/lib/crypto";
import { connectDemo, connectWithToken, configureAccount, disconnect, listAccounts } from "@/server/meta/connection";
import { DemoProvider } from "@/server/meta/demo-provider";
import { getHealth } from "@/server/meta/health";
import { syncAccount } from "@/server/meta/sync";
import { MetaApiError, type MetaProvider } from "@/server/meta/types";
import { createClient } from "@/server/services/clients";
import { getOverview, getCampaignDetail, listCampaigns, resolvePeriod } from "@/server/insights";
import { addUserWithRole, newOrg } from "./helpers";

const NOW = new Date("2026-10-11T12:00:00Z");
const noSleep = async () => {};

// Provedor de teste: base demo + sobrescritas (spread de classe perderia os métodos do protótipo).
function mk(over: Partial<MetaProvider> = {}, mode: "demo" | "meta" = "demo"): MetaProvider {
  const d = new DemoProvider();
  return {
    mode, listAdAccounts: () => d.listAdAccounts(), listCampaigns: (a) => d.listCampaigns(a), listAdSets: (a) => d.listAdSets(a),
    listAds: (a) => d.listAds(a), getDailyInsights: (a, s, u) => d.getDailyInsights(a, s, u), ...over,
  };
}

async function demoOrg(label = "M") {
  const org = await newOrg(label);
  await connectDemo(org.admin);
  const accts = await listAccounts(org.admin);
  for (const a of accts) await configureAccount(org.admin, a.id, { selected: true, clientId: null });
  const loja = accts.find((a) => a.name.includes("Loja Exemplo"))!;
  return { ...org, accts, loja };
}

describe("sincronização", () => {
  it("sincroniza dados demo, é idempotente e não duplica linhas", async () => {
    const org = await demoOrg();
    const a = org.loja;
    const r1 = await syncAccount(org.admin, a.id, { now: NOW, sleep: noSleep });
    expect(r1.status).toBe("success");
    const count = async () => (await db.select().from(insightsDaily).where(eq(insightsDaily.adAccountId, a.id))).length;
    const n1 = await count();
    expect(n1).toBeGreaterThan(0);
    await syncAccount(org.admin, a.id, { now: NOW, sleep: noSleep });
    expect(await count()).toBe(n1);
    expect((await db.select().from(campaigns).where(eq(campaigns.adAccountId, a.id))).length).toBe(4);
  });

  it("campanha pausada/sem entrega fica sem métricas (nulo), não zerada", async () => {
    const org = await demoOrg();
    await syncAccount(org.admin, org.loja.id, { now: NOW, sleep: noSleep });
    const p = resolvePeriod(30, NOW);
    const ov = await getOverview(org.admin, { ...p }, NOW);
    const pausada = ov.campaigns.find((c) => c.name.startsWith("Reconhecimento"))!;
    expect(pausada.totals.spend).toBeNull();
    expect(pausada.totals.costPerResult).toBeNull();
  });

  it("não permite duas sincronizações simultâneas da mesma conta", async () => {
    const org = await demoOrg();
    const a = org.loja;
    const slow = mk({ listCampaigns: () => new Promise<[]>((r) => setTimeout(() => r([]), 300)), listAdSets: async () => [], listAds: async () => [], getDailyInsights: async () => [] });
    const first = syncAccount(org.admin, a.id, { now: NOW, provider: slow, sleep: noSleep });
    await new Promise((r) => setTimeout(r, 80));
    await expect(syncAccount(org.admin, a.id, { now: NOW, provider: slow, sleep: noSleep })).rejects.toMatchObject({ code: "conflict" });
    expect((await first).status).toBe("success");
    // trava liberada: nova sincronização é possível
    expect((await syncAccount(org.admin, a.id, { now: NOW, provider: slow, sleep: noSleep })).status).toBe("success");
  });

  it("retoma execução interrompida (sem batimento) e libera a trava", async () => {
    const org = await demoOrg();
    const a = org.loja;
    await db.insert(syncRuns).values({ id: randomUUID(), organizationId: org.organizationId, adAccountId: a.id, status: "running", trigger: "manual", lockKey: a.id, startedAt: new Date(NOW.getTime() - 3_600_000), heartbeatAt: new Date(NOW.getTime() - 3_600_000), rangeSince: "2026-09-12", rangeUntil: "2026-10-11" });
    const r = await syncAccount(org.admin, a.id, { now: NOW, sleep: noSleep });
    expect(r.status).toBe("success");
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.adAccountId, a.id));
    expect(runs.some((x) => x.status === "interrupted")).toBe(true);
  });

  it("erros temporários são repetidos com espera progressiva (1s, 2s) e depois dão certo", async () => {
    const org = await demoOrg();
    const demo = new DemoProvider();
    let calls = 0;
    const flaky = mk({ listCampaigns: async (a) => { if (++calls < 3) throw new MetaApiError("rate_limit", "limite", 17); return demo.listCampaigns(a); } });
    const sleep = vi.fn(async (_ms: number) => {});
    const r = await syncAccount(org.admin, org.loja.id, { now: NOW, provider: flaky, sleep });
    expect(r.status).toBe("success");
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([1000, 2000]);
    const [run] = await db.select().from(syncRuns).where(eq(syncRuns.id, r.runId));
    expect(run.attempts).toBe(3);
  });

  it("erro temporário persistente falha após 3 tentativas, sem apagar dados e sem marcar como atualizado", async () => {
    const org = await demoOrg();
    const a = org.loja;
    await syncAccount(org.admin, a.id, { now: NOW, sleep: noSleep });
    const [before] = await db.select().from(adAccounts).where(eq(adAccounts.id, a.id));
    const down = mk({ listCampaigns: async () => { throw new MetaApiError("transient", "indisponível"); } });
    const r = await syncAccount(org.admin, a.id, { now: new Date(NOW.getTime() + 3_600_000), provider: down, sleep: noSleep });
    expect(r).toMatchObject({ status: "failed", errorCode: "transient" });
    const [after] = await db.select().from(adAccounts).where(eq(adAccounts.id, a.id));
    expect(after.lastSyncedAt).toEqual(before.lastSyncedAt);
    expect((await db.select().from(insightsDaily).where(eq(insightsDaily.adAccountId, a.id))).length).toBeGreaterThan(0);
    const h = await getHealth(org.admin);
    expect(h.accounts.find((x) => x.id === a.id)!.lastAttempt!.status).toBe("failed");
    expect(h.accounts.find((x) => x.id === a.id)!.lastSuccess).not.toBeNull(); // conexão ativa ≠ dado novo, mas há sucesso anterior
  });

  it("token expirado marca a conexão como 'reconectar' e bloqueia novas sincronizações", async () => {
    const org = await newOrg("T");
    const fake = mk({ listAdAccounts: async () => [{ externalId: "act_5", name: "Conta Real", currency: "BRL", timezone: null, status: "1" }] }, "meta");
    await connectWithToken(org.admin, "EAAB-segredo", 5_000_000, fake);
    const [acct] = await listAccounts(org.admin);
    await configureAccount(org.admin, acct.id, { selected: true, clientId: null });
    const expired = mk({ listAdAccounts: fake.listAdAccounts, listCampaigns: async () => { throw new MetaApiError("token_expired", "Sessão expirada", 190); } }, "meta");
    const r = await syncAccount(org.admin, acct.id, { now: NOW, provider: expired, sleep: noSleep });
    expect(r).toMatchObject({ status: "failed", errorCode: "token_expired" });
    const [conn] = await db.select().from(metaConnections).where(eq(metaConnections.organizationId, org.organizationId));
    expect(conn.status).toBe("needs_reconnect");
    await expect(syncAccount(org.admin, acct.id, { now: NOW, provider: fake, sleep: noSleep })).rejects.toMatchObject({ code: "conflict" });
    const h = await getHealth(org.admin);
    expect(h.state).toBe("critical");
    expect(h.instructions.join(" ")).toMatch(/Reconecte/);
  });

  it("falha em conjuntos/anúncios gera sincronização PARCIAL (campanhas e métricas são mantidas)", async () => {
    const org = await demoOrg();
    const p = mk({ listAdSets: async () => { throw new MetaApiError("permission", "sem permissão", 200); } });
    const r = await syncAccount(org.admin, org.loja.id, { now: NOW, provider: p, sleep: noSleep });
    expect(r.status).toBe("partial");
    expect((await db.select().from(insightsDaily).where(eq(insightsDaily.adAccountId, org.loja.id))).length).toBeGreaterThan(0);
  });
});

describe("conexão, segurança e isolamento", () => {
  it("token da Meta é guardado criptografado e não aparece em auditoria", async () => {
    const org = await newOrg("S");
    const fake = mk({ listAdAccounts: async () => [{ externalId: "act_9", name: "X", currency: "BRL", timezone: null, status: null }] }, "meta");
    await connectWithToken(org.admin, "EAAB-token-super-secreto", null, fake);
    const [c] = await db.select().from(metaConnections).where(eq(metaConnections.organizationId, org.organizationId));
    expect(c.tokenEnc).not.toContain("EAAB");
    expect(decryptSecret(c.tokenEnc!)).toBe("EAAB-token-super-secreto");
    const { auditLog } = await import("@/db/schema");
    const rows = await db.select().from(auditLog).where(eq(auditLog.organizationId, org.organizationId));
    expect(JSON.stringify(rows)).not.toContain("EAAB");
  });

  it("recusa token inválido sem gravar conexão", async () => {
    const org = await newOrg("I");
    const bad = mk({ listAdAccounts: async () => { throw new MetaApiError("token_expired", "Invalid OAuth access token", 190); } }, "meta");
    await expect(connectWithToken(org.admin, "x", null, bad)).rejects.toMatchObject({ code: "validation" });
    expect((await db.select().from(metaConnections).where(eq(metaConnections.organizationId, org.organizationId))).length).toBe(0);
  });

  it("organização B não enxerga contas, campanhas, métricas nem consegue sincronizar dados da A", async () => {
    const a = await demoOrg("A");
    await syncAccount(a.admin, a.loja.id, { now: NOW, sleep: noSleep });
    const b = await demoOrg("B");
    const p = resolvePeriod(30, NOW);
    const [campA] = await db.select().from(campaigns).where(eq(campaigns.adAccountId, a.loja.id));
    await expect(getCampaignDetail(b.admin, campA.id, p)).rejects.toMatchObject({ code: "not_found" });
    await expect(syncAccount(b.admin, a.loja.id, { now: NOW, sleep: noSleep })).rejects.toMatchObject({ code: "not_found" });
    await expect(configureAccount(b.admin, a.loja.id, { selected: false, clientId: null })).rejects.toMatchObject({ code: "not_found" });
    const ovB = await getOverview(b.admin, p, NOW);
    expect(ovB.totals.spend).toBeNull(); // B ainda não sincronizou; nada de A vaza
    expect((await listCampaigns(b.admin, { ...p })).rows).toHaveLength(0);
    // vincular conta a cliente de outra organização é bloqueado
    const clientA = await createClient(a.admin, { name: "Cliente A" });
    await expect(configureAccount(b.admin, b.loja.id, { selected: true, clientId: clientA })).rejects.toMatchObject({ code: "not_found" });
  });

  it("analista lê dados mas não conecta nem sincroniza; gestor sincroniza mas não conecta", async () => {
    const org = await demoOrg("R");
    const an = await addUserWithRole(org, "analyst");
    const mg = await addUserWithRole(org, "manager");
    const id = org.loja.id;
    await expect(syncAccount(an.actor, id)).rejects.toMatchObject({ code: "forbidden" });
    await expect(disconnect(an.actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(configureAccount(mg.actor, id, { selected: false, clientId: null })).rejects.toMatchObject({ code: "forbidden" });
    expect((await syncAccount(mg.actor, id, { now: NOW, sleep: noSleep })).status).toBe("success");
    expect((await getOverview(an.actor, resolvePeriod(30, NOW), NOW)).totals.spend).not.toBeNull();
  });

  it("filtro por cliente só considera contas vinculadas a ele", async () => {
    const org = await demoOrg("F");
    const cli = await createClient(org.admin, { name: "Loja" });
    await configureAccount(org.admin, org.loja.id, { selected: true, clientId: cli });
    for (const a of org.accts) await syncAccount(org.admin, a.id, { now: NOW, sleep: noSleep });
    const p = resolvePeriod(30, NOW);
    const todos = await getOverview(org.admin, p, NOW);
    const soLoja = await getOverview(org.admin, { ...p, clientId: cli }, NOW);
    expect(soLoja.totals.spend!).toBeLessThan(todos.totals.spend!);
    expect(soLoja.campaigns.every((c) => c.accountName.includes("Loja Exemplo"))).toBe(true);
  });

  it("lista de campanhas: busca, ordenação (nulos por último) e paginação", async () => {
    const org = await demoOrg("L");
    await syncAccount(org.admin, org.loja.id, { now: NOW, sleep: noSleep });
    const p = resolvePeriod(30, NOW);
    const busca = await listCampaigns(org.admin, { ...p, q: "remarketing" });
    expect(busca.total).toBe(1);
    const asc = await listCampaigns(org.admin, { ...p, sort: "spend", dir: "asc" });
    expect(asc.rows.at(-1)!.totals.spend).toBeNull(); // pausada (sem dados) vai ao final mesmo em ordem crescente
    const pag = await listCampaigns(org.admin, { ...p, pageSize: 2, page: 2 });
    expect(pag.rows).toHaveLength(2); expect(pag.pages).toBe(2);
  });

  it("modo demo é identificado e desconectar remove os dados simulados", async () => {
    const org = await demoOrg("D");
    await syncAccount(org.admin, org.loja.id, { now: NOW, sleep: noSleep });
    expect((await getOverview(org.admin, resolvePeriod(30, NOW), NOW)).isDemo).toBe(true);
    await disconnect(org.admin);
    expect(await listAccounts(org.admin)).toHaveLength(0);
    const rows = await db.select().from(insightsDaily).where(and(eq(insightsDaily.organizationId, org.organizationId)));
    expect(rows).toHaveLength(0);
  });

  it("saúde: dados desatualizados (>24h) são sinalizados mesmo com conexão ativa", async () => {
    const org = await demoOrg("H");
    await syncAccount(org.admin, org.loja.id, { now: NOW, sleep: noSleep });
    const later = new Date(Date.now() + 30 * 3_600_000);
    const h = await getHealth(org.admin, later);
    expect(h.connection!.status).toBe("active");
    expect(h.accounts.find((a) => a.id === org.loja.id)!.stale).toBe(true);
    expect(h.state).toBe("attention");
  });
});

describe("painel: atenção", () => {
  it("sinaliza anúncios reprovados e campanha com problemas (fatos da Meta)", async () => {
    const org = await demoOrg("Z");
    for (const a of org.accts) await syncAccount(org.admin, a.id, { now: NOW, sleep: noSleep });
    const ov = await getOverview(org.admin, resolvePeriod(30, NOW), NOW);
    expect(ov.attention.some((a) => /reprovado/.test(a.title))).toBe(true);
    expect(ov.attention.some((a) => /problemas de entrega/.test(a.title))).toBe(true);
  });
});

describe("cobertura do período anterior", () => {
  it("só compara com o período anterior se ele foi sincronizado por inteiro", async () => {
    const org = await demoOrg("C");
    await syncAccount(org.admin, org.loja.id, { now: NOW, sleep: noSleep, days: 30 });
    const p = { ...resolvePeriod(30, NOW), accountId: org.loja.id };
    const parcial = await getOverview(org.admin, p, NOW);
    expect(parcial.prevComparable).toBe(false);
    expect(parcial.prevTotals.spend).toBeNull(); // nunca compara com dado parcial
    expect(parcial.totals.spend).not.toBeNull();
    await syncAccount(org.admin, org.loja.id, { now: NOW, sleep: noSleep, days: 60 });
    const completo = await getOverview(org.admin, p, NOW);
    expect(completo.prevComparable).toBe(true);
    expect(completo.prevTotals.spend).not.toBeNull();
    // filtro de 90 dias com apenas 60 sincronizados: aviso de cobertura parcial
    const p90 = { ...resolvePeriod(90, NOW), accountId: org.loja.id };
    expect((await getOverview(org.admin, p90, NOW)).partialCurrent).toBe(true);
  });

  it("com uma conta selecionada nunca sincronizada, não há cobertura (sem comparação)", async () => {
    const org = await demoOrg("C2");
    await syncAccount(org.admin, org.loja.id, { now: NOW, sleep: noSleep, days: 90 });
    const ov = await getOverview(org.admin, resolvePeriod(30, NOW), NOW);
    expect(ov.prevComparable).toBe(false);
    expect(ov.stale).toBe(true);
  });
});
