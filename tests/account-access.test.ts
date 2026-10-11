import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { and, eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { POST } from "@/app/api/mcp/route";
import { db } from "@/db";
import { adAccounts, campaigns, memberAccountAccess, memberships } from "@/db/schema";
import { resetRateLimits } from "@/lib/rate-limit";
import { getActor } from "@/server/context";
import { getCampaignDetail, getOverview, listCampaigns, resolvePeriod } from "@/server/insights";
import { createMcpToken } from "@/server/mcp/tokens";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { getHealth } from "@/server/meta/health";
import { cancelOperation, executeOperation, getOperation, listOperations, prepareOperation } from "@/server/meta/operations";
import { recentRuns, syncAccount, syncAllSelected } from "@/server/meta/sync";
import { buildReport } from "@/server/reports/builder";
import { deleteTemplate, exportReport, listExports, saveTemplate } from "@/server/reports/service";
import { DEFAULT_SECTIONS } from "@/server/reports/types";
import { addMemberByEmail, changeMemberRole, listActivity, removeMember, setMemberAccess } from "@/server/services/organizations";
import { createClient, getClient, listClients } from "@/server/services/clients";
import { addUserWithRole, newOrg, PW, uniq } from "./helpers";
import { register } from "@/server/services/auth";

const NOW = new Date();
const P = resolvePeriod(30);
const cfg = (extra = {}) => ({ type: "campaigns" as const, days: 30 as const, sections: DEFAULT_SECTIONS.campaigns, ...extra });
beforeEach(() => resetRateLimits());

async function world() {
  const o = await newOrg("Ac");
  await connectDemo(o.admin);
  const accts = await listAccounts(o.admin);
  const loja = accts.find((a) => a.name.includes("Loja"))!, clinica = accts.find((a) => a.name.includes("Clínica"))!;
  const cLoja = await createClient(o.admin, { name: "Cliente Loja" }), cClin = await createClient(o.admin, { name: "Cliente Clínica" });
  await configureAccount(o.admin, loja.id, { selected: true, clientId: cLoja });
  await configureAccount(o.admin, clinica.id, { selected: true, clientId: cClin });
  for (const a of [loja, clinica]) await syncAccount(o.admin, a.id, { now: NOW, sleep: async () => {} });
  const camps = await db.select().from(campaigns).where(eq(campaigns.organizationId, o.organizationId));
  const campLoja = camps.find((c) => c.adAccountId === loja.id && c.name.startsWith("Remarketing"))!, campClin = camps.find((c) => c.adAccountId === clinica.id && c.name.startsWith("Agendamentos"))!;
  const opClin = (await prepareOperation(o.admin, { campaignId: campClin.id, type: "pause" }, { clientRequestId: "req-clinica-1" })).operationId;
  return { ...o, loja, clinica, cLoja, cClin, campLoja, campClin, opClin };
}
async function restrictedTo(w: Awaited<ReturnType<typeof world>>, accountIds: string[], role: "manager" | "analyst" = "manager") {
  const m = await addUserWithRole(w, role);
  await setMemberAccess(w.admin, m.userId, { scope: "restricted", accountIds });
  return { ...m, actor: await getActor(m.userId, w.organizationId) };
}

describe("acesso restrito por conta: dados e telas", () => {
  it("o ator restrito enxerga somente as contas liberadas (contas, painel, campanhas, detalhe, saúde, sincronizações)", async () => {
    const w = await world();
    const r = await restrictedTo(w, [w.loja.id]);
    expect(r.actor.allowedAccountIds).toEqual([w.loja.id]);
    expect((await listAccounts(r.actor)).map((a) => a.id)).toEqual([w.loja.id]);
    const ov = await getOverview(r.actor, P, NOW), ovLoja = await getOverview(w.admin, { ...P, accountId: w.loja.id }, NOW), ovAll = await getOverview(w.admin, P, NOW);
    expect(ov.totals.spend).toBe(ovLoja.totals.spend); expect(ov.totals.spend!).toBeLessThan(ovAll.totals.spend!);
    expect(ov.campaigns.every((c) => c.accountId === w.loja.id)).toBe(true);
    expect((await listCampaigns(r.actor, { ...P })).rows.every((c) => c.accountId === w.loja.id)).toBe(true);
    // pedir explicitamente a conta de outra pessoa não vaza nada
    expect((await getOverview(r.actor, { ...P, accountId: w.clinica.id }, NOW)).totals.spend).toBeNull();
    await expect(getCampaignDetail(r.actor, w.campClin.id, P)).rejects.toMatchObject({ code: "not_found" });
    expect((await getCampaignDetail(r.actor, w.campLoja.id, P)).campaign.id).toBe(w.campLoja.id);
    expect((await getHealth(r.actor)).accounts.map((a) => a.id)).toEqual([w.loja.id]);
    expect((await recentRuns(r.actor)).every((x) => x.run.adAccountId === w.loja.id)).toBe(true);
    expect((await listClients(r.actor)).map((c) => c.id)).toEqual([w.cLoja]);
    await expect(getClient(r.actor, w.cClin)).rejects.toMatchObject({ code: "not_found" });
  });

  it("sincronização: só as contas liberadas", async () => {
    const w = await world();
    const r = await restrictedTo(w, [w.loja.id]);
    await expect(syncAccount(r.actor, w.clinica.id, { now: NOW, sleep: async () => {} })).rejects.toMatchObject({ code: "not_found" });
    expect((await syncAccount(r.actor, w.loja.id, { now: NOW, sleep: async () => {} })).status).toBe("success");
    const all = await syncAllSelected(r.actor, { now: NOW, sleep: async () => {} });
    expect(all.map((x) => x.accountId)).toEqual([w.loja.id]);
  });

  it("relatórios e exportações não contêm contas/clientes fora do acesso", async () => {
    const w = await world();
    const r = await restrictedTo(w, [w.loja.id]);
    const rep = await buildReport(r.actor, cfg(), NOW);
    expect(rep.campaigns.every((c) => c.accountId === w.loja.id)).toBe(true);
    await expect(buildReport(r.actor, cfg({ accountId: w.clinica.id }), NOW)).rejects.toMatchObject({ code: "not_found" });
    await expect(buildReport(r.actor, cfg({ clientId: w.cClin }), NOW)).rejects.toMatchObject({ code: "not_found" });
    const csv = (await exportReport(r.actor, cfg(), "csv", { now: NOW })).buffer.toString("utf8");
    expect(csv).toContain("Remarketing"); expect(csv).not.toMatch(/Clínica|Agendamentos|Conversão – Lançamento/);
    for (const f of ["xlsx", "pdf"] as const) expect((await exportReport(r.actor, cfg(), f, { now: NOW })).verification.ok).toBe(true);
    // histórico de exportações: restrito vê só as próprias
    await exportReport(w.admin, cfg(), "csv", { now: NOW });
    expect((await listExports(r.actor)).every((e) => e.userId === r.userId)).toBe(true);
    expect((await listExports(w.admin)).some((e) => e.userId === w.userId)).toBe(true);
  }, 90_000);

  it("operações: prepara só em contas liberadas; operações de outras contas são inexistentes (ver, executar, cancelar, listar, reuso de clientRequestId)", async () => {
    const w = await world();
    const r = await restrictedTo(w, [w.loja.id]);
    await expect(prepareOperation(r.actor, { campaignId: w.campClin.id, type: "pause" })).rejects.toMatchObject({ code: "not_found" });
    const ok = await prepareOperation(r.actor, { campaignId: w.campLoja.id, type: "pause" });
    expect((await executeOperation(r.actor, ok.operationId)).status).toBe("succeeded");
    await expect(getOperation(r.actor, w.opClin)).rejects.toMatchObject({ code: "not_found" });
    await expect(executeOperation(r.actor, w.opClin)).rejects.toMatchObject({ code: "not_found" });
    await expect(cancelOperation(r.actor, w.opClin)).rejects.toMatchObject({ code: "not_found" });
    await expect(prepareOperation(r.actor, { campaignId: w.campLoja.id, type: "activate" }, { clientRequestId: "req-clinica-1" })).rejects.toBeTruthy();
    expect((await listOperations(r.actor)).map((x) => x.op.id)).not.toContain(w.opClin);
    expect((await listOperations(w.admin)).map((x) => x.op.id)).toContain(w.opClin);
  });

  it("ações de alcance organizacional são negadas ao restrito (clientes, atividades, equipe, modelos, conexão)", async () => {
    const w = await world();
    const r = await restrictedTo(w, [w.loja.id]);
    await expect(createClient(r.actor, { name: "Novo" })).rejects.toMatchObject({ code: "forbidden" });
    await expect(listActivity(r.actor)).rejects.toMatchObject({ code: "forbidden" });
    await expect(setMemberAccess(r.actor, w.userId, { scope: "all", accountIds: [] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveTemplate(r.actor, "Modelo X", cfg())).rejects.toMatchObject({ code: "forbidden" });
    await expect(configureAccount(r.actor, w.loja.id, { selected: false, clientId: null })).rejects.toMatchObject({ code: "forbidden" });
    void deleteTemplate;
  });

  it("restrito sem nenhuma conta não vê nada (lista vazia ≠ tudo)", async () => {
    const w = await world();
    const r = await restrictedTo(w, [], "analyst");
    expect(await listAccounts(r.actor)).toHaveLength(0);
    expect((await getOverview(r.actor, P, NOW)).totals.spend).toBeNull();
    expect((await listCampaigns(r.actor, { ...P })).total).toBe(0);
    expect(await listClients(r.actor)).toHaveLength(0);
    expect((await buildReport(r.actor, cfg(), NOW)).meta.hasData).toBe(false);
  });

  it("conta nova NÃO é liberada automaticamente a quem é restrito", async () => {
    const w = await world();
    const r = await restrictedTo(w, [w.loja.id]);
    const [created] = [{ id: crypto.randomUUID() }];
    const [conn] = await db.select().from(adAccounts).where(eq(adAccounts.id, w.loja.id));
    await db.insert(adAccounts).values({ id: created.id, organizationId: w.organizationId, connectionId: conn.connectionId, externalId: "act_novo", name: "Conta nova", currency: "BRL", isSelected: true });
    expect((await listAccounts(r.actor)).map((a) => a.id)).not.toContain(created.id);
    expect((await listAccounts(w.admin)).map((a) => a.id)).toContain(created.id);
  });
});

describe("gestão do acesso por pessoa", () => {
  it("só administradores definem; admin não pode ser restringido; contas de outra organização são recusadas", async () => {
    const w = await world(), other = await world();
    const m = await addUserWithRole(w, "manager");
    await expect(setMemberAccess(m.actor, m.userId, { scope: "restricted", accountIds: [] })).rejects.toMatchObject({ code: "forbidden" });
    await expect(setMemberAccess(w.admin, w.userId, { scope: "restricted", accountIds: [w.loja.id] })).rejects.toMatchObject({ code: "conflict" });
    await expect(setMemberAccess(w.admin, m.userId, { scope: "restricted", accountIds: [other.loja.id] })).rejects.toMatchObject({ code: "not_found" });
    await expect(setMemberAccess(w.admin, m.userId, { scope: "restricted", accountIds: ["não-é-uuid"] })).rejects.toMatchObject({ code: "validation" });
    await expect(setMemberAccess(other.admin, m.userId, { scope: "all", accountIds: [] })).rejects.toMatchObject({ code: "not_found" }); // membro de outra organização
  });

  it("voltar para 'todas', promover a admin e remover limpam as restrições; trocas ficam na auditoria", async () => {
    const w = await world();
    const m = await addUserWithRole(w, "manager");
    await setMemberAccess(w.admin, m.userId, { scope: "restricted", accountIds: [w.loja.id, w.clinica.id] });
    expect((await getActor(m.userId, w.organizationId)).allowedAccountIds).toHaveLength(2);
    await setMemberAccess(w.admin, m.userId, { scope: "restricted", accountIds: [w.clinica.id] });
    expect((await getActor(m.userId, w.organizationId)).allowedAccountIds).toEqual([w.clinica.id]);
    await setMemberAccess(w.admin, m.userId, { scope: "all", accountIds: [w.loja.id] });
    expect((await getActor(m.userId, w.organizationId)).allowedAccountIds).toBeNull();
    expect(await db.select().from(memberAccountAccess).where(eq(memberAccountAccess.userId, m.userId))).toHaveLength(0);
    await setMemberAccess(w.admin, m.userId, { scope: "restricted", accountIds: [w.loja.id] });
    await changeMemberRole(w.admin, m.userId, "admin");
    const [row] = await db.select().from(memberships).where(and(eq(memberships.userId, m.userId), eq(memberships.organizationId, w.organizationId)));
    expect(row.accessScope).toBe("all");
    expect((await getActor(m.userId, w.organizationId)).allowedAccountIds).toBeNull();
    await removeMember(w.admin, m.userId);
    expect(await db.select().from(memberAccountAccess).where(eq(memberAccountAccess.userId, m.userId))).toHaveLength(0);
    const { auditLog } = await import("@/db/schema");
    expect((await db.select().from(auditLog).where(and(eq(auditLog.organizationId, w.organizationId), eq(auditLog.action, "member.access_change")))).length).toBe(4);
  });

  it("novo membro adicionado como restrito começa sem ver nenhuma conta", async () => {
    const w = await world();
    const email = `novo-${uniq()}@teste.com`;
    const { userId } = await register({ name: "Novo", email, password: PW, organizationName: `Outra ${uniq()}` });
    await addMemberByEmail(w.admin, email, "analyst", { restricted: true });
    const a = await getActor(userId, w.organizationId);
    expect(a.allowedAccountIds).toEqual([]);
    expect(await listAccounts(a)).toHaveLength(0);
  });
});

describe("acesso restrito também vale no MCP", () => {
  it("token de usuário restrito não alcança contas/campanhas/operações fora do acesso", async () => {
    const w = await world();
    const r = await restrictedTo(w, [w.loja.id]);
    const { token } = await createMcpToken(r.actor, { name: "Token restrito", scopes: ["read", "write"], ttlDays: 30 });
    const c = new Client({ name: "t", version: "1" });
    await c.connect(new StreamableHTTPClientTransport(new URL("http://localhost:3000/api/mcp"), { requestInit: { headers: { Authorization: `Bearer ${token}` } }, fetch: ((u: string | URL, i?: RequestInit) => POST(new Request(u, i))) as typeof fetch }));
    const call = async (name: string, args = {}) => { const x = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] }; return { isError: !!x.isError, json: JSON.parse(x.content[0].text) }; };
    const accts = (await call("list_ad_accounts")).json.data as { id: string }[];
    expect(accts.map((a) => a.id)).toEqual([w.loja.id]);
    const camps = (await call("list_campaigns")).json.data as { id: string }[];
    expect(camps.map((x) => x.id)).not.toContain(w.campClin.id);
    expect((await call("get_campaign_details", { campaignId: w.campClin.id })).json.error.code).toBe("not_found");
    expect((await call("prepare_campaign_pause", { campaignId: w.campClin.id })).json.error.code).toBe("not_found");
    expect((await call("get_operation", { operationId: w.opClin })).json.error.code).toBe("not_found");
    expect((await call("get_report", { type: "campaigns" })).json.data.campaigns.every((x: { id: string }) => x.id !== w.campClin.id)).toBe(true);
    expect((await call("list_clients")).json.data.map((x: { id: string }) => x.id)).toEqual([w.cLoja]);
    await c.close();
  });
});
