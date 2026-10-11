import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { campaigns, clients, operations } from "@/db/schema";
import { getActor } from "@/server/context";
import { createMcpToken, revokeMcpToken } from "@/server/mcp/tokens";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { cancelOperation, executeOperation, executeWithConfirmationCode, getOperation, issueConfirmationCode, prepareOperation, reconcileOperation } from "@/server/meta/operations";
import { syncAccount } from "@/server/meta/sync";
import { getCampaignDetail, listCampaigns, resolvePeriod } from "@/server/insights";
import { buildReport } from "@/server/reports/builder";
import { deleteTemplate, exportReport, saveTemplate } from "@/server/reports/service";
import { DEFAULT_SECTIONS } from "@/server/reports/types";
import { createClient, deleteClient, getClient, updateClient } from "@/server/services/clients";
import { changeMemberRole, removeMember } from "@/server/services/organizations";
import { newOrg } from "./helpers";

const NOW = new Date();
const cfg = (extra = {}) => ({ type: "campaigns" as const, days: 30 as const, sections: DEFAULT_SECTIONS.campaigns, ...extra });

async function world(label: string) {
  const o = await newOrg(label);
  await connectDemo(o.admin);
  const accts = await listAccounts(o.admin);
  const cli = await createClient(o.admin, { name: `Cliente ${label}` });
  for (const a of accts) { await configureAccount(o.admin, a.id, { selected: true, clientId: a.name.includes("Loja") ? cli : null }); await syncAccount(o.admin, a.id, { now: NOW, sleep: async () => {} }); }
  const loja = accts.find((a) => a.name.includes("Loja"))!;
  const camp = (await db.select().from(campaigns).where(eq(campaigns.adAccountId, loja.id))).find((c) => c.name.startsWith("Remarketing"))!;
  const prep = await prepareOperation(o.admin, { campaignId: camp.id, type: "pause" });
  const tpl = await saveTemplate(o.admin, `Modelo ${label}`, cfg());
  const tok = await createMcpToken(o.admin, { name: `Token ${label}`, scopes: ["read"], ttlDays: 30 });
  return { ...o, loja, cli, camp, opId: prep.operationId, tpl, tokId: tok.id };
}

describe("matriz de ataque entre organizações (A → recursos de B)", () => {
  it("TODA operação de A sobre ids de B é recusada (not_found/forbidden) e nada de B muda", async () => {
    const a = await world("A"), b = await world("B");
    const P = resolvePeriod(30);
    const attacks: [string, () => Promise<unknown>][] = [
      ["getClient", () => getClient(a.admin, b.cli)], ["updateClient", () => updateClient(a.admin, b.cli, { name: "pwned" })], ["deleteClient", () => deleteClient(a.admin, b.cli)],
      ["configureAccount", () => configureAccount(a.admin, b.loja.id, { selected: false, clientId: null })],
      ["configureAccount→cliente alheio", () => configureAccount(a.admin, a.loja.id, { selected: true, clientId: b.cli })],
      ["syncAccount", () => syncAccount(a.admin, b.loja.id, { now: NOW })],
      ["getCampaignDetail", () => getCampaignDetail(a.admin, b.camp.id, P)],
      ["prepareOperation", () => prepareOperation(a.admin, { campaignId: b.camp.id, type: "pause" })],
      ["getOperation", () => getOperation(a.admin, b.opId)], ["executeOperation", () => executeOperation(a.admin, b.opId)], ["cancelOperation", () => cancelOperation(a.admin, b.opId)],
      ["reconcileOperation", () => reconcileOperation(a.admin, b.opId)], ["issueConfirmationCode", () => issueConfirmationCode(a.admin, b.opId)],
      ["executeWithCode", () => executeWithConfirmationCode(a.admin, b.opId, "AAAA-AAAA")],
      ["buildReport(cliente)", () => buildReport(a.admin, cfg({ clientId: b.cli }))], ["buildReport(conta)", () => buildReport(a.admin, cfg({ accountId: b.loja.id }))],
      ["exportReport(cliente)", () => exportReport(a.admin, cfg({ clientId: b.cli }), "csv")],
      ["deleteTemplate", () => deleteTemplate(a.admin, b.tpl)], ["revokeMcpToken", () => revokeMcpToken(a.admin, b.tokId)],
      ["changeMemberRole", () => changeMemberRole(a.admin, b.userId, "analyst")], ["removeMember", () => removeMember(a.admin, b.userId)],
      ["getActor(org alheia)", () => getActor(a.userId, b.organizationId)],
    ];
    for (const [name, fn] of attacks) {
      const err = await fn().then(() => null, (e) => e);
      expect(err, `${name} deveria ser recusado`).not.toBeNull();
      expect(["not_found", "forbidden"], `${name}: código ${err?.code}`).toContain(err.code);
    }
    // nada de B foi alterado
    const [cb] = await db.select().from(clients).where(eq(clients.id, b.cli)); expect(cb.name).toBe("Cliente B");
    const [ob] = await db.select().from(operations).where(eq(operations.id, b.opId)); expect(ob.status).toBe("prepared");
    // listagens não vazam
    const list = (await listCampaigns(a.admin, { ...P })).rows.map((r) => r.id);
    expect(list).not.toContain(b.camp.id);
  }, 120_000);
});

describe("injeção", () => {
  it("SQL injection em campos de texto e busca é tratado como texto literal", async () => {
    const a = await world("Inj");
    const evil = "'; DROP TABLE clients; --";
    const id = await createClient(a.admin, { name: evil });
    expect((await getClient(a.admin, id)).name).toBe(evil);
    for (const q of [evil, "%' OR '1'='1", "\\", "\u0000"]) {
      const r = await listCampaigns(a.admin, { ...resolvePeriod(30), q });
      expect(r.total).toBe(0);
    }
    expect((await db.select().from(clients).where(eq(clients.organizationId, a.organizationId))).length).toBeGreaterThan(0); // tabela intacta
    await expect(getClient(a.admin, "' OR 1=1 --")).rejects.toMatchObject({ code: "not_found" });
  });

  it("nomes com HTML/script ficam como dados e são limitados em tamanho", async () => {
    const a = await world("Xss");
    const xss = '<img src=x onerror=alert(1)><script>alert(2)</script>';
    const id = await createClient(a.admin, { name: xss });
    expect((await getClient(a.admin, id)).name).toBe(xss); // armazenado como texto; a UI escapa (ver E2E de segurança)
    await expect(createClient(a.admin, { name: "x".repeat(500) })).rejects.toMatchObject({ code: "validation" });
  });
});
