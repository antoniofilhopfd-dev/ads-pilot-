import { describe, expect, it } from "vitest";
import { POST } from "@/app/api/cron/sync/route";
import { cronAuthorized } from "@/server/jobs/cron-auth";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { runScheduledSync } from "@/server/jobs/sync-all";
import { newOrg } from "./helpers";

const SECRET = "segredo-de-teste-com-mais-de-24-caracteres";

describe("rotas de cron", () => {
  it("autoriza só com o segredo exato (tempo constante) e fica DESATIVADA sem segredo ou com segredo curto", () => {
    expect(cronAuthorized(SECRET, SECRET)).toBe(true);
    expect(cronAuthorized("errado", SECRET)).toBe(false);
    expect(cronAuthorized(SECRET + "x", SECRET)).toBe(false);
    expect(cronAuthorized(null, SECRET)).toBe(false);
    expect(cronAuthorized("", "")).toBe(false);          // sem segredo configurado
    expect(cronAuthorized("curto", "curto")).toBe(false); // segredo fraco é recusado
    expect(cronAuthorized(undefined as unknown as string, undefined)).toBe(false);
  });

  it("POST /api/cron/sync: 401 sem/errado, 200 com segredo e sincroniza as contas selecionadas", async () => {
    process.env.CRON_SECRET = SECRET;
    const org = await newOrg("Cron");
    await connectDemo(org.admin);
    for (const a of await listAccounts(org.admin)) await configureAccount(org.admin, a.id, { selected: true, clientId: null });
    const call = (h: Record<string, string>) => POST(new Request("http://localhost/api/cron/sync", { method: "POST", headers: h }));
    expect((await call({})).status).toBe(401);
    expect((await call({ "x-cron-secret": "errado" })).status).toBe(401);
    const ok = await call({ "x-cron-secret": SECRET });
    expect(ok.status).toBe(200);
    const body = (await ok.json()) as { ok: boolean; results: { organizationId: string; synced: number; failed: number }[] };
    const mine = body.results.find((r) => r.organizationId === org.organizationId)!;
    expect(mine).toMatchObject({ synced: 2, failed: 0 });
    // segunda execução: idempotente (sem duplicar dados, sem erro)
    const again = await runScheduledSync();
    expect(again.find((r) => r.organizationId === org.organizationId)).toMatchObject({ failed: 0 });
    delete process.env.CRON_SECRET;
    expect((await call({ "x-cron-secret": SECRET })).status).toBe(401); // sem segredo no ambiente: desativada
  }, 120_000); // a rota sincroniza TODAS as organizações do banco (aqui, as de outros testes)
});
