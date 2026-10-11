import { describe, expect, it, vi } from "vitest";
import { decryptSecret, encryptSecret } from "@/lib/crypto";
import { GraphApiProvider, mapGraphError } from "@/server/meta/graph-provider";
import { MetaApiError } from "@/server/meta/types";

// Respostas SIMULADAS no formato documentado da Graph API. Não prova compatibilidade com a Meta real.
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("GraphApiProvider (respostas simuladas)", () => {
  it("segue a paginação por cursor e converte orçamentos de centavos", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "1", name: "A", objective: "OUTCOME_SALES", status: "ACTIVE", effective_status: "ACTIVE", daily_budget: "20000" }], paging: { next: "https://graph.facebook.com/v25.0/act_1/campaigns?after=XYZ" } }))
      .mockResolvedValueOnce(json({ data: [{ id: "2", name: "B", status: "PAUSED", effective_status: "PAUSED" }] }));
    const p = new GraphApiProvider("TOKEN", f as unknown as typeof fetch);
    const camps = await p.listCampaigns("act_1");
    expect(camps.map((c) => c.externalId)).toEqual(["1", "2"]);
    expect(camps[0].dailyBudget).toBe(200);
    expect(camps[1].dailyBudget).toBeNull(); // ausente ≠ zero
    expect(f).toHaveBeenCalledTimes(2);
  });

  it("envia o token no cabeçalho e nunca na URL", async () => {
    const f = vi.fn().mockResolvedValue(json({ data: [] }));
    await new GraphApiProvider("SEGREDO", f as unknown as typeof fetch).listAdAccounts();
    const [url, init] = f.mock.calls[0];
    expect(String(url)).not.toContain("SEGREDO");
    expect((init as RequestInit).headers).toMatchObject({ Authorization: "Bearer SEGREDO" });
  });

  it("recusa URL de paginação fora da Meta (anti-SSRF / vazamento de token)", async () => {
    const f = vi.fn().mockResolvedValue(json({ data: [], paging: { next: "https://evil.example.com/steal" } }));
    await expect(new GraphApiProvider("T", f as unknown as typeof fetch).listAdAccounts()).rejects.toThrow(/paginação/);
    expect(f).toHaveBeenCalledTimes(1);
  });

  it("insights: resultado vem da ação do objetivo; ausência de ações = null, não zero", async () => {
    const f = vi.fn()
      .mockResolvedValueOnce(json({ data: [{ id: "1", name: "Vendas", objective: "OUTCOME_SALES" }, { id: "2", name: "Marca", objective: "OUTCOME_AWARENESS" }] }))
      .mockResolvedValueOnce(json({ data: [
        { campaign_id: "1", date_start: "2026-10-01", spend: "100.50", impressions: "5000", reach: "4000", clicks: "100", actions: [{ action_type: "link_click", value: "100" }, { action_type: "omni_purchase", value: "7" }], action_values: [{ action_type: "omni_purchase", value: "420.00" }] },
        { campaign_id: "2", date_start: "2026-10-01", spend: "30", impressions: "9000", clicks: "50" },
      ] }));
    const out = await new GraphApiProvider("T", f as unknown as typeof fetch).getDailyInsights("act_1", "2026-10-01", "2026-10-01");
    expect(out[0]).toMatchObject({ results: 7, resultType: "purchase", purchaseValue: 420, spend: 100.5 });
    expect(out[1]).toMatchObject({ results: null, resultType: null, purchaseValue: null, reach: null });
  });

  it("classifica erros da Graph API", () => {
    expect(mapGraphError(400, { error: { code: 190, message: "token" } }).kind).toBe("token_expired");
    expect(mapGraphError(400, { error: { code: 200, message: "perm" } }).kind).toBe("permission");
    expect(mapGraphError(400, { error: { code: 17, message: "rate" } }).kind).toBe("rate_limit");
    expect(mapGraphError(500, undefined).kind).toBe("transient");
    expect(mapGraphError(400, { error: { code: 100, message: "x" } }).kind).toBe("unknown");
    expect(mapGraphError(400, { error: { code: 17, message: "x" } }).retryable).toBe(true);
    expect(mapGraphError(400, { error: { code: 190, message: "x" } }).retryable).toBe(false);
  });

  it("falha de rede vira erro temporário", async () => {
    const f = vi.fn().mockRejectedValue(new TypeError("fetch failed"));
    await expect(new GraphApiProvider("T", f as unknown as typeof fetch).listAdAccounts()).rejects.toMatchObject({ kind: "transient" });
  });
});

describe("criptografia de segredos", () => {
  it("cifra e decifra; texto cifrado não contém o segredo; adulteração é detectada", () => {
    const blob = encryptSecret("EAAB-token-secreto");
    expect(blob).not.toContain("EAAB");
    expect(decryptSecret(blob)).toBe("EAAB-token-secreto");
    expect(encryptSecret("x")).not.toBe(encryptSecret("x")); // IV aleatório
    const parts = blob.split(".");
    parts[3] = Buffer.from("adulterado").toString("base64");
    expect(() => decryptSecret(parts.join("."))).toThrow();
  });
});

void MetaApiError;
