import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { metaConnections, outbox } from "@/db/schema";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { dispatchOutbox, enqueueAlertMessages, enqueueTest, evolutionConfig, normalizePhone, sendText } from "@/server/notify/evolution";
import { addRecipient, listRecipients, removeRecipient } from "@/server/notify/recipients";
import { exchangeLongLived, renewExpiringTokens } from "@/server/meta/oauth";
import { GraphApiProvider, THROTTLE_AT, usagePercent } from "@/server/meta/graph-provider";
import { addUserWithRole, newOrg } from "./helpers";

type Handler = (req: IncomingMessage, body: string) => { status: number; json?: unknown; hang?: boolean };
let server: Server, base = "", handler: Handler = () => ({ status: 200, json: {} });
const hits: { url: string; headers: IncomingMessage["headers"]; body: string }[] = [];
beforeAll(async () => {
  server = createServer((req, res) => {
    let body = ""; req.on("data", (c) => (body += c));
    req.on("end", () => { hits.push({ url: req.url ?? "", headers: req.headers, body }); const r = handler(req, body); if (r.hang) return; res.writeHead(r.status, { "Content-Type": "application/json" }); res.end(JSON.stringify(r.json ?? {})); });
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => { server.closeAllConnections(); server.close(); });
const env = (extra = {}) => ({ EVOLUTION_API_URL: base, EVOLUTION_API_KEY: "chave-secreta-teste", EVOLUTION_INSTANCE: "adspilot", ...extra });

describe("Evolution API (servidor SIMULADO local)", () => {
  it("configuração e telefones", () => {
    expect(evolutionConfig({})).toBeNull();
    expect(evolutionConfig({ EVOLUTION_API_URL: "http://servidor-externo.com", EVOLUTION_API_KEY: "k", EVOLUTION_INSTANCE: "i" })).toBeNull(); // http fora do localhost: recusado
    expect(evolutionConfig({ EVOLUTION_API_URL: "https://evo.exemplo.com/", EVOLUTION_API_KEY: "k", EVOLUTION_INSTANCE: "i" })?.url).toBe("https://evo.exemplo.com");
    expect(normalizePhone("+55 (11) 91234-5678")).toBe("5511912345678");
    expect(() => normalizePhone("123")).toThrow(); expect(() => normalizePhone("5511123")).toThrow(); expect(() => normalizePhone("abc")).toThrow();
  });
  it("envia com apikey no cabeçalho e número/texto no corpo", async () => {
    hits.length = 0; handler = () => ({ status: 201, json: { key: { id: "MSG1" } } });
    const r = await sendText(evolutionConfig(env())!, "5511912345678", "olá");
    expect(r).toEqual({ ok: true, messageId: "MSG1" });
    expect(hits[0].url).toBe("/message/sendText/adspilot"); expect(hits[0].headers.apikey).toBe("chave-secreta-teste");
    expect(JSON.parse(hits[0].body)).toEqual({ number: "5511912345678", text: "olá" }); expect(hits[0].url).not.toContain("chave");
  });
  it("classifica erros: permanente, transitório, incerto, recusado", async () => {
    const cfg = evolutionConfig(env())!;
    handler = () => ({ status: 401 }); expect(await sendText(cfg, "5511912345678", "x")).toMatchObject({ ok: false, permanent: true, uncertain: false });
    handler = () => ({ status: 400 }); expect(await sendText(cfg, "5511912345678", "x")).toMatchObject({ permanent: true });
    handler = () => ({ status: 429 }); expect(await sendText(cfg, "5511912345678", "x")).toMatchObject({ permanent: false, uncertain: false });
    handler = () => ({ status: 500 }); expect(await sendText(cfg, "5511912345678", "x")).toMatchObject({ uncertain: true });
    handler = () => ({ status: 200, hang: true }); expect(await sendText(cfg, "5511912345678", "x", fetch, 150)).toMatchObject({ ok: false, uncertain: true });
    expect(await sendText({ ...cfg, url: "http://127.0.0.1:59999" }, "5511912345678", "x")).toMatchObject({ ok: false, uncertain: false });
  });
});

async function recipientWorld(sev: "info" | "warning" | "critical" = "critical") {
  const o = await newOrg("Wp");
  const rid = await addRecipient(o.admin, { name: "Plantão", phone: "+55 11 91234-5678", minSeverity: sev });
  return { o, rid };
}
const item = (alertId: string, severity: "info" | "warning" | "critical" = "critical") => ({ alertId, severity, title: "Orçamento excedido", entityName: "Conta X", message: "Passou do planejado.", adAccountId: null });

describe("caixa de saída (idempotente)", () => {
  it("destinatários: validação, duplicidade, máscara, permissão, isolamento", async () => {
    const { o, rid } = await recipientWorld();
    await expect(addRecipient(o.admin, { name: "Outro", phone: "5511912345678" })).rejects.toThrow(/já está cadastrado/);
    await expect(addRecipient(o.admin, { name: "x", phone: "123" })).rejects.toThrow();
    const list = await listRecipients(o.admin);
    expect(list[0].phoneMasked).not.toContain("91234"); expect(list[0].phoneMasked.endsWith("78")).toBe(true);
    const an = await addUserWithRole(o, "analyst");
    await expect(addRecipient(an.actor, { name: "Zé", phone: "5511999999999" })).rejects.toThrow();
    const other = await newOrg("Wp2");
    await expect(removeRecipient(other.admin, rid)).rejects.toThrow();
    expect(await listRecipients(other.admin)).toHaveLength(0);
  });
  it("enfileira uma vez por alerta/destinatário/dia e respeita a severidade mínima", async () => {
    const { o } = await recipientWorld("critical");
    const now = new Date();
    expect(await enqueueAlertMessages(o.organizationId, [item("a1"), item("a2", "warning")], now)).toBe(1); // warning < critical
    expect(await enqueueAlertMessages(o.organizationId, [item("a1")], now)).toBe(0); // mesma chave no mesmo dia
    expect(await enqueueAlertMessages(o.organizationId, [item("a1")], new Date(now.getTime() + 86_400_000))).toBe(1); // dia seguinte: novo aviso
  });
  it("sem configuração: bloqueia (não finge envio) e envia depois de configurar", async () => {
    const { o } = await recipientWorld();
    await enqueueAlertMessages(o.organizationId, [item("b1")]);
    const r1 = await dispatchOutbox({ organizationId: o.organizationId, env: {} });
    expect(r1).toMatchObject({ blocked: 1, sent: 0 });
    expect((await db.select().from(outbox).where(eq(outbox.organizationId, o.organizationId)))[0].status).toBe("blocked");
    hits.length = 0; handler = () => ({ status: 201, json: { key: { id: "OK9" } } });
    const r2 = await dispatchOutbox({ organizationId: o.organizationId, env: env() });
    expect(r2.sent).toBe(1);
    const row = (await db.select().from(outbox).where(eq(outbox.organizationId, o.organizationId)))[0];
    expect(row.status).toBe("sent"); expect(row.providerMessageId).toBe("OK9"); expect(row.attempts).toBe(1);
    expect(await dispatchOutbox({ organizationId: o.organizationId, env: env() })).toMatchObject({ sent: 0 }); // não reenvia
    expect(hits).toHaveLength(1);
  });
  it("dois despachos simultâneos enviam UMA vez (reserva atômica)", async () => {
    const { o } = await recipientWorld();
    await enqueueAlertMessages(o.organizationId, [item("c1")]);
    hits.length = 0; handler = () => ({ status: 201, json: { key: { id: "X" } } });
    await Promise.all([dispatchOutbox({ organizationId: o.organizationId, env: env() }), dispatchOutbox({ organizationId: o.organizationId, env: env() })]);
    expect(hits).toHaveLength(1);
  });
  it("falha transitória tenta de novo com espera; permanente desiste; incerta não reenvia", async () => {
    const { o } = await recipientWorld();
    const now = new Date();
    await enqueueAlertMessages(o.organizationId, [item("d1")], now);
    handler = () => ({ status: 429 });
    expect(await dispatchOutbox({ organizationId: o.organizationId, env: env(), now })).toMatchObject({ failed: 1 });
    let row = (await db.select().from(outbox).where(eq(outbox.organizationId, o.organizationId)))[0];
    expect(row.status).toBe("failed"); expect(row.nextAttemptAt!.getTime()).toBeGreaterThan(now.getTime());
    expect(await dispatchOutbox({ organizationId: o.organizationId, env: env(), now })).toMatchObject({ sent: 0, failed: 0 }); // ainda não venceu a espera
    handler = () => ({ status: 201, json: { key: { id: "R" } } });
    expect((await dispatchOutbox({ organizationId: o.organizationId, env: env(), now: new Date(now.getTime() + 10 * 60_000) })).sent).toBe(1);
    const w2 = await recipientWorld();
    await enqueueAlertMessages(w2.o.organizationId, [item("e1")]); handler = () => ({ status: 401 });
    await dispatchOutbox({ organizationId: w2.o.organizationId, env: env() });
    row = (await db.select().from(outbox).where(eq(outbox.organizationId, w2.o.organizationId)))[0];
    expect(row.status).toBe("failed"); expect(row.nextAttemptAt).toBeNull(); expect(row.lastError).toMatch(/chave/);
    const w3 = await recipientWorld();
    await enqueueAlertMessages(w3.o.organizationId, [item("f1")]); handler = () => ({ status: 500 });
    await dispatchOutbox({ organizationId: w3.o.organizationId, env: env() });
    row = (await db.select().from(outbox).where(eq(outbox.organizationId, w3.o.organizationId)))[0];
    expect(row.status).toBe("uncertain");
    hits.length = 0; await dispatchOutbox({ organizationId: w3.o.organizationId, env: env() }); expect(hits).toHaveLength(0); // incerta: não reenvia sozinha
  });
  it("mensagem de teste", async () => {
    const { o, rid } = await recipientWorld();
    await enqueueTest(o.organizationId, rid); handler = () => ({ status: 201, json: { key: { id: "T" } } });
    expect((await dispatchOutbox({ organizationId: o.organizationId, env: env() })).sent).toBe(1);
    const other = await newOrg("Wp3");
    await expect(enqueueTest(other.organizationId, rid)).rejects.toThrow();
  });
});

describe("renovação de token (servidor SIMULADO)", () => {
  async function connWorld(daysLeft: number) {
    const o = await newOrg("Tk");
    await db.insert(metaConnections).values({ id: crypto.randomUUID(), organizationId: o.organizationId, mode: "meta", status: "active", tokenEnc: encryptSecret("TOKEN-ANTIGO"), tokenExpiresAt: new Date(Date.now() + daysLeft * 86_400_000), grantedScopes: ["ads_read"], connectedBy: o.userId });
    return o;
  }
  const get = async (orgId: string) => (await db.select().from(metaConnections).where(eq(metaConnections.organizationId, orgId)))[0];
  const creds = { appId: "123", appSecret: "segredo-do-app" };

  it("troca o token com os segredos no CORPO (não na URL)", async () => {
    hits.length = 0; handler = () => ({ status: 200, json: { access_token: "NOVO", expires_in: 5_184_000 } });
    const r = await exchangeLongLived("TOKEN-X", creds, fetch, base);
    expect(r).toEqual({ token: "NOVO", expiresIn: 5_184_000 });
    expect(hits[0].url).toBe("/oauth/access_token"); expect(hits[0].body).toContain("fb_exchange_token=TOKEN-X"); expect(hits[0].url).not.toMatch(/TOKEN|segredo/);
  });
  it("renova só o que expira em breve e atualiza validade e token (criptografado)", async () => {
    const soon = await connWorld(3), later = await connWorld(40);
    handler = () => ({ status: 200, json: { access_token: "TOKEN-NOVO", expires_in: 5_184_000 } });
    const out = await renewExpiringTokens({ creds, fetchImpl: fetch, base });
    expect(out.renewed).toBeGreaterThanOrEqual(1);
    const a = await get(soon.organizationId), b = await get(later.organizationId);
    expect(decryptSecret(a.tokenEnc!)).toBe("TOKEN-NOVO"); expect(a.tokenEnc).not.toContain("TOKEN-NOVO");
    expect(a.tokenExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 50 * 86_400_000);
    expect(decryptSecret(b.tokenEnc!)).toBe("TOKEN-ANTIGO"); // fora da janela: intocado
  });
  it("token inválido (190) exige reconexão; falha transitória mantém a conexão; sem credenciais pula", async () => {
    const bad = await connWorld(2); handler = () => ({ status: 400, json: { error: { code: 190, message: "Invalid OAuth access token" } } });
    await renewExpiringTokens({ creds, fetchImpl: fetch, base });
    expect((await get(bad.organizationId)).status).toBe("needs_reconnect");
    const flaky = await connWorld(2); handler = () => ({ status: 500, json: { error: { code: 2, message: "temporário" } } });
    await renewExpiringTokens({ creds, fetchImpl: fetch, base });
    const f = await get(flaky.organizationId); expect(f.status).toBe("active"); expect(f.lastError).toMatch(/Renovação do token falhou/); expect(decryptSecret(f.tokenEnc!)).toBe("TOKEN-ANTIGO");
    const none = await connWorld(2); const r = await renewExpiringTokens({ creds: null });
    expect(r.skipped).toBeGreaterThanOrEqual(1); expect((await get(none.organizationId)).status).toBe("active");
  });
});

describe("Graph: limite de taxa e leituras auxiliares (respostas SIMULADAS)", () => {
  const h = (o: Record<string, string>) => ({ get: (k: string) => o[k] ?? null });
  it("lê uso dos cabeçalhos", () => {
    expect(usagePercent(h({ "x-app-usage": JSON.stringify({ call_count: 12, total_time: 40, total_cputime: 7 }) }))).toBe(40);
    expect(usagePercent(h({ "x-business-use-case-usage": JSON.stringify({ "123": [{ call_count: 90, total_time: 10 }] }) }))).toBe(90);
    expect(usagePercent(h({ "x-app-usage": "isto não é json" }))).toBeNull(); expect(usagePercent(h({}))).toBeNull();
  });
  const resp = (data: unknown, usage?: number) => async () => new Response(JSON.stringify(data), { status: 200, headers: usage ? { "x-app-usage": JSON.stringify({ call_count: usage }) } : {} });
  it("desacelera perto do limite e não desacelera longe dele", async () => {
    const waits: number[] = [];
    await new GraphApiProvider("t", resp({ data: [] }, THROTTLE_AT + 4) as typeof fetch, "https://graph.facebook.com/v25.0", async (ms) => { waits.push(ms); }).listPixels("act_1");
    expect(waits).toEqual([5000]);
    await new GraphApiProvider("t", resp({ data: [] }, 10) as typeof fetch, "https://graph.facebook.com/v25.0", async (ms) => { waits.push(ms); }).listPixels("act_1");
    expect(waits).toEqual([5000]);
  });
  it("pixels, eventos, busca de segmentação e públicos", async () => {
    const calls: string[] = [];
    const f = (async (u: URL | string) => { const url = new URL(String(u)); calls.push(url.pathname + url.search);
      if (url.pathname.endsWith("/adspixels")) return new Response(JSON.stringify({ data: [{ id: "9", name: "Pixel loja", last_fired_time: "2026-03-01T10:00:00+0000" }, { id: "10" }] }));
      if (url.pathname.endsWith("/stats")) return new Response(JSON.stringify({ data: [{ data: [{ value: "Purchase", count: 3 }, { value: "PageView", count: 10 }] }, { data: [{ value: "Purchase", count: 2 }] }] }));
      if (url.pathname.endsWith("/search")) return new Response(JSON.stringify({ data: [{ id: "6003", name: "Moda", audience_size_upper_bound: 1000000 }] }));
      if (url.pathname.endsWith("/customaudiences")) return new Response(JSON.stringify({ data: [{ id: "77", name: "Compradores", subtype: "CUSTOM", approximate_count_lower_bound: 1200 }, { id: "78", name: "Sem contagem" }] }));
      return new Response("{}", { status: 404 }); }) as typeof fetch;
    const g = new GraphApiProvider("segredo-token", f);
    const px = await g.listPixels("act_1"); expect(px[0]).toMatchObject({ id: "9", name: "Pixel loja" }); expect(px[0].lastFiredAt).toBeInstanceOf(Date); expect(px[1].lastFiredAt).toBeNull(); expect(px[1].name).toBe("10");
    expect(await g.getPixelEvents("9", "2026-03-01")).toEqual([{ event: "PageView", count: 10 }, { event: "Purchase", count: 5 }]);
    expect((await g.searchTargeting("moda"))[0]).toEqual({ id: "6003", name: "Moda", audienceSize: 1000000 });
    await expect(g.searchTargeting("  ")).rejects.toThrow(); await expect(g.searchTargeting("x".repeat(101))).rejects.toThrow();
    const au = await g.listCustomAudiences("act_1"); expect(au[0].approximateCount).toBe(1200); expect(au[1].approximateCount).toBeNull();
    expect(calls.every((c) => !c.includes("segredo-token"))).toBe(true); // token nunca na URL
  });
});
