import { describe, expect, it } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { campaignDrafts, campaigns } from "@/db/schema";
import { getActor } from "@/server/context";
import { createClient } from "@/server/services/clients";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { syncAccount } from "@/server/meta/sync";
import { setMemberAccess } from "@/server/services/organizations";
import * as L from "@/server/library";
import { addUserWithRole, newOrg } from "./helpers";

// PNG 64x64 válido gerado em memória (RGB, sem entrelaçamento).
import { deflateSync } from "node:zlib";
function png(w = 64, h = 64) {
  const crc = (b: Buffer) => { let c, t = 0xffffffff; for (const x of b) { c = (t ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t = (t >>> 8) ^ c; } return (t ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const raw = Buffer.concat(Array.from({ length: h }, () => Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 200)])));
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(raw)), chunk("IEND", Buffer.alloc(0))]);
}

const aud = { locations: "Brasil", ageMin: 25, ageMax: 45, genders: "todos", interests: "moda", exclusions: "" };

describe("biblioteca", () => {
  it("pastas, etiquetas e duplicidade", async () => {
    const o = await newOrg("Lb");
    const f = await L.createFolder(o.admin, "creative", "Black Friday");
    await expect(L.createFolder(o.admin, "creative", "Black Friday")).rejects.toThrow(/já existe/i);
    await expect(L.createFolder(o.admin, "xxx", "a")).rejects.toThrow();
    const l = await L.createLabel(o.admin, "urgente");
    const cid = await L.saveCreative(o.admin, { name: "C1", format: "text", folderId: f, primaryText: "Oi" });
    await L.setEntityLabels(o.admin, "creative", cid, [l]);
    expect((await L.labelsFor(o.admin, "creative", [cid])).get(cid)?.[0].name).toBe("urgente");
    const other = await newOrg("Lb2");
    await expect(L.setEntityLabels(other.admin, "creative", cid, [l])).rejects.toThrow();
    await expect(L.saveCreative(other.admin, { name: "X", format: "text", folderId: f })).rejects.toThrow(); // pasta de outra org
    await L.deleteFolder(o.admin, f);
    expect((await L.getCreative(o.admin, cid)).folderId).toBeNull();
  });

  it("públicos: versões, comparação, validação, isolamento", async () => {
    const o = await newOrg("Au");
    const id = await L.saveAudience(o.admin, { name: "Moda 25-45", config: aud, objective: "OUTCOME_SALES" });
    await L.saveAudience(o.admin, { id, name: "Moda 25-45", config: { ...aud, ageMax: 55 }, note: "ampliou" });
    const a = await L.getAudience(o.admin, id);
    expect(a.version).toBe(2); expect(a.versions).toHaveLength(2);
    expect(await L.compareAudienceVersions(o.admin, id, 1, 2)).toEqual([{ field: "ageMax", from: 45, to: 55 }]);
    await expect(L.saveAudience(o.admin, { name: "Moda 25-45", config: aud })).rejects.toThrow(/já existe/i);
    await expect(L.saveAudience(o.admin, { name: "Ruim", config: { ...aud, ageMin: 50, ageMax: 30 } })).rejects.toThrow();
    expect(L.validateAudience({ ...aud, locations: "" })).toContain("Informe a localização.");
    const other = await newOrg("Au2");
    await expect(L.getAudience(other.admin, id)).rejects.toThrow();
    expect(await L.listAudiences(other.admin)).toHaveLength(0);
    await L.archiveAudience(o.admin, id, true);
    expect(await L.listAudiences(o.admin)).toHaveLength(0);
    expect(await L.listAudiences(o.admin, { includeArchived: true })).toHaveLength(1);
  });

  it("criativos: upload validado por conteúdo, prévia, vínculo e avisos", async () => {
    const o = await newOrg("Cr");
    await connectDemo(o.admin);
    const acc = (await listAccounts(o.admin))[0];
    await configureAccount(o.admin, acc.id, { selected: true, clientId: null });
    await syncAccount(o.admin, acc.id, { now: new Date(), sleep: async () => {} });
    const id = await L.saveCreative(o.admin, { name: "Img", format: "image", primaryText: "x".repeat(130), url: "https://x.com", image: png() });
    const img = await L.creativeImage(o.admin, id);
    expect(img?.mime).toBe("image/png");
    await expect(L.saveCreative(o.admin, { name: "Fake", format: "image", image: Buffer.from("<svg onload=alert(1)>") })).rejects.toThrow();
    await expect(L.saveCreative(o.admin, { name: "U", format: "text", url: "javascript:alert(1)" })).rejects.toThrow();
    await expect(L.saveCreative(o.admin, { name: "V", format: "video", videoUrl: "ftp://x" })).rejects.toThrow();
    expect(L.creativeWarnings({ format: "image", primaryText: "x".repeat(130), hasImage: false, url: null })).toHaveLength(3);
    const camp = (await db.select().from(campaigns).where(eq(campaigns.organizationId, o.organizationId)))[0];
    await L.linkCreative(o.admin, id, camp.id, null, "2026-01-01");
    await expect(L.linkCreative(o.admin, id, camp.id, null)).rejects.toThrow(/já está vinculado/);
    expect((await L.getCreative(o.admin, id)).links).toHaveLength(1);
    const other = await newOrg("Cr2");
    expect(await L.creativeImage(other.admin, id).catch(() => "negado")).toBe("negado");
    await expect(L.linkCreative(other.admin, id, camp.id, null)).rejects.toThrow();
    expect(await L.listCreatives(o.admin, { q: "img" })).toHaveLength(1);
    expect(await L.listCreatives(o.admin, { q: "zzz" })).toHaveLength(0);
  });

  it("rascunho: validação, nasce pausado, envio bloqueado e auditado", async () => {
    const o = await newOrg("Dr");
    await connectDemo(o.admin);
    const acc = (await listAccounts(o.admin))[0];
    const id = await L.createDraft(o.admin, "Meu rascunho");
    const r0 = await L.saveDraftStep(o.admin, id, 1, { adAccountId: acc.id });
    expect(r0.issues.length).toBeGreaterThan(3);
    let d = await L.getDraft(o.admin, id);
    expect(d.data.initialStatus).toBe("PAUSED"); expect(d.status).toBe("draft");
    const cr = await L.saveCreative(o.admin, { name: "Cr", format: "text" });
    const r = await L.saveDraftStep(o.admin, id, 9, {
      objective: "OUTCOME_SALES", campaignName: "Loja | Vendas | 2026-12", budgetMode: "abo", adSetName: "Loja | Amplo | 25-45", dailyBudget: 50, bidStrategy: "LOWEST_COST_WITHOUT_CAP",
      startDate: "2999-01-01", locations: "Brasil", placements: "automatic", creativeId: cr, destinationUrl: "https://loja.com", reviewed: true, ...({ initialStatus: "ACTIVE" } as object),
    });
    expect(r.issues).toEqual([]);
    d = await L.getDraft(o.admin, id);
    expect(d.status).toBe("ready"); expect(d.data.initialStatus).toBe("PAUSED"); // tentativa de forçar ACTIVE é ignorada
    await expect(L.sendDraft(o.admin, id)).rejects.toThrow(/bloqueado/);
    const { auditLog } = await import("@/db/schema");
    const rows = await db.select().from(auditLog).where(and(eq(auditLog.organizationId, o.organizationId), eq(auditLog.action, "draft.send_blocked")));
    expect(rows).toHaveLength(1);
    await expect(L.saveDraftStep(o.admin, id, 11, {})).rejects.toThrow();
    await expect(L.saveDraftStep(o.admin, id, 1, { adAccountId: "00000000-0000-4000-8000-000000000000" })).rejects.toThrow();
    const other = await newOrg("Dr2");
    await expect(L.getDraft(other.admin, id)).rejects.toThrow();
    await expect(L.deleteDraft(other.admin, id)).rejects.toThrow();
    await L.deleteDraft(o.admin, id);
    expect(await db.select().from(campaignDrafts).where(eq(campaignDrafts.id, id))).toHaveLength(0);
  });

  it("UTM: histórico e modelo", async () => {
    const o = await newOrg("Ut");
    const t = await L.saveUtmTemplate(o.admin, { name: "Meta padrão", source: "meta", medium: "paid_social", campaignPattern: "{campanha}" });
    await expect(L.saveUtmTemplate(o.admin, { name: "Meta padrão", source: "a", medium: "b", campaignPattern: "c" })).rejects.toThrow(/já existe/i);
    const r = await L.createUtmLink(o.admin, { baseUrl: "https://x.com", params: { utm_source: "meta", utm_medium: "paid_social", utm_campaign: "Teste Um" } });
    expect(r.url).toContain("utm_campaign=teste_um");
    await expect(L.createUtmLink(o.admin, { baseUrl: "javascript:1", params: { utm_source: "a", utm_medium: "b", utm_campaign: "c" } })).rejects.toThrow();
    expect(await L.listUtmLinks(o.admin)).toHaveLength(1);
    const other = await newOrg("Ut2");
    expect(await L.listUtmLinks(other.admin)).toHaveLength(0);
    await expect(L.deleteUtmTemplate(other.admin, t)).rejects.toThrow();
  });

  it("checklist e experimento", async () => {
    const o = await newOrg("Ck");
    await connectDemo(o.admin);
    const tid = (await listAccounts(o.admin))[0].id;
    await L.setChecklistItem(o.admin, "semanal", "account", tid, "ritmo", true, "ok");
    let c = await L.getChecklist(o.admin, "semanal", "account", tid);
    expect(c.items.find((i) => i.id === "ritmo")?.done).toBe(true); expect(c.completedAt).toBeNull();
    for (const i of c.items) await L.setChecklistItem(o.admin, "semanal", "account", tid, i.id, true);
    c = await L.getChecklist(o.admin, "semanal", "account", tid);
    expect(c.completedAt).not.toBeNull();
    await expect(L.setChecklistItem(o.admin, "semanal", "account", tid, "naoexiste", true)).rejects.toThrow();
    const other = await newOrg("Ck2");
    await expect(L.getChecklist(other.admin, "semanal", "account", tid)).rejects.toThrow();
    await expect(L.setChecklistItem(other.admin, "semanal", "account", tid, "ritmo", true)).rejects.toThrow();
    const ex = await L.saveExperiment(o.admin, { name: "Teste título", hypothesis: "Título com número aumenta o CTR", objective: "Mais cliques", variable: "Título", primaryMetric: "ctr", variants: [{ name: "A" }, { name: "B" }] });
    await expect(L.saveExperiment(o.admin, { name: "x", hypothesis: "curta", objective: "o", variable: "v", primaryMetric: "ctr", variants: [{ name: "A" }] })).rejects.toThrow();
    await expect(L.saveExperiment(o.admin, { name: "y", hypothesis: "hipótese longa o bastante", objective: "o", variable: "v", primaryMetric: "ctr", variants: [{ name: "A" }, { name: "a" }] })).rejects.toThrow(/diferentes/);
    await expect(L.setExperimentStatus(o.admin, ex, "concluded")).rejects.toThrow(/conclusão/);
    await L.setExperimentStatus(o.admin, ex, "concluded", "Sem diferença significativa", "Testar outro título");
    expect((await L.listExperiments(o.admin))[0].status).toBe("concluded");
  });

  it("permissões e acesso restrito", async () => {
    const o = await newOrg("Pm");
    await connectDemo(o.admin);
    const accts = await listAccounts(o.admin);
    const cl = await createClient(o.admin, { name: "Cli A" });
    await configureAccount(o.admin, accts[0].id, { selected: true, clientId: cl });
    await configureAccount(o.admin, accts[1].id, { selected: true, clientId: null });
    const cReg = await L.saveCreative(o.admin, { name: "Do cliente A", format: "text", clientId: cl });
    const cOrg = await L.saveCreative(o.admin, { name: "Da organização", format: "text" });
    const an = await addUserWithRole(o, "analyst");
    await expect(L.saveCreative(an.actor, { name: "n", format: "text" })).rejects.toThrow();
    await expect(L.createDraft(an.actor)).rejects.toThrow();
    expect(await L.listCreatives(an.actor)).toHaveLength(2); // analista (irrestrito) lê
    const mgr = await addUserWithRole(o, "manager");
    await setMemberAccess(o.admin, mgr.userId, { scope: "restricted", accountIds: [accts[1].id] });
    const act = await getActor(mgr.userId, o.organizationId);
    const seen = (await L.listCreatives(act)).map((c) => c.id);
    expect(seen).toEqual([cOrg]);
    await expect(L.getCreative(act, cReg)).rejects.toThrow();
    await expect(L.saveCreative(act, { name: "novo", format: "text" })).rejects.toThrow(); // library.write é da organização inteira
  });
});
