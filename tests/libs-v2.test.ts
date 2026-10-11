import { describe, expect, it } from "vitest";
import { buildName, validateName } from "@/lib/naming";
import { applyPattern, buildUtmUrl, slug, utmCsv } from "@/lib/utm";
import { evaluateExperiment, normalCdf, twoProportionP } from "@/lib/experiments";
import { simBreakEvenRoas, simFunnel, simMaxCpa, simResults } from "@/lib/simulators";

describe("nomes", () => {
  it("monta e sanitiza", () => {
    expect(buildName({ cliente: "Loja X", objetivo: "Vendas", publico: "Lookalike | 1%", periodo: "2026-03" })).toBe("Loja X | Vendas | Lookalike 1% | 2026-03");
  });
  it("valida", () => {
    expect(validateName("")).toBeTruthy(); expect(validateName("a".repeat(201))).toBeTruthy();
    expect(validateName("A | B", { minParts: 3 })).toBeTruthy(); expect(validateName("A | B | C", { minParts: 3 })).toBeNull();
  });
});

describe("UTM", () => {
  it("slug sem acentos", () => expect(slug(" Promoção Verão! ")).toBe("promocao_verao"));
  it("constrói, preserva query e substitui duplicados", () => {
    const r = buildUtmUrl("https://x.com/p?a=1&utm_source=velho", { utm_source: "Meta", utm_medium: "CPC", utm_campaign: "Black Friday", utm_content: "{criativo}" });
    const u = new URL(r.url);
    expect(u.searchParams.get("a")).toBe("1"); expect(u.searchParams.getAll("utm_source")).toEqual(["meta"]);
    expect(u.searchParams.get("utm_campaign")).toBe("black_friday"); expect(r.warnings.join()).toContain("substituído");
  });
  it("recusa javascript:, obrigatórios ausentes e URL inválida", () => {
    expect(() => buildUtmUrl("javascript:alert(1)", { utm_source: "a", utm_medium: "b", utm_campaign: "c" })).toThrow();
    expect(() => buildUtmUrl("https://x.com", { utm_source: "a" })).toThrow();
    expect(() => buildUtmUrl("nada", { utm_source: "a", utm_medium: "b", utm_campaign: "c" })).toThrow();
  });
  it("padrões e CSV com neutralização de fórmula", () => {
    expect(applyPattern("{cliente}_{data}", { cliente: "loja", data: "2026" })).toBe("loja_2026");
    const csv = utmCsv([{ createdAt: new Date("2026-03-01"), baseUrl: "https://x.com", params: { utm_source: "=cmd" }, finalUrl: "https://x.com?utm_source=a;b" }]);
    expect(csv.startsWith("﻿")).toBe(true); expect(csv).toContain("'=cmd"); expect(csv).toContain('"https://x.com?utm_source=a;b"');
  });
});

describe("experimentos", () => {
  it("normalCdf", () => { expect(normalCdf(0)).toBeCloseTo(0.5, 5); expect(normalCdf(1.96)).toBeCloseTo(0.975, 3); });
  it("p-valor conhecido", () => { expect(twoProportionP(100, 1000, 150, 1000)!).toBeLessThan(0.01); expect(twoProportionP(100, 1000, 102, 1000)!).toBeGreaterThan(0.5); });
  it("amostra insuficiente não declara vencedor", () => {
    const v = evaluateExperiment("ctr", [{ name: "A", impressions: 500, clicks: 10, results: 1, spend: 5 }, { name: "B", impressions: 500, clicks: 30, results: 2, spend: 5 }]);
    expect(v.status).toBe("amostra_insuficiente"); expect(v.leader).toBeNull();
  });
  it("diferença significativa e inconclusivo", () => {
    const a = { name: "A", impressions: 10000, clicks: 100, results: 5, spend: 100 };
    expect(evaluateExperiment("ctr", [a, { ...a, name: "B", clicks: 200 }])).toMatchObject({ status: "diferenca_significativa", leader: "B" });
    expect(evaluateExperiment("ctr", [a, { ...a, name: "B", clicks: 105 }]).status).toBe("inconclusivo");
  });
  it("nulo não é zero; custo é descritivo", () => {
    expect(evaluateExperiment("ctr", [{ name: "A", impressions: 5000, clicks: null, results: null, spend: 1 }, { name: "B", impressions: 5000, clicks: 50, results: 1, spend: 1 }]).status).toBe("sem_dados");
    expect(evaluateExperiment("cpa", [{ name: "A", impressions: 1, clicks: 1, results: 1, spend: 1 }, { name: "B", impressions: 1, clicks: 1, results: 1, spend: 1 }])).toMatchObject({ status: "descritivo", leader: null });
  });
});

describe("simuladores", () => {
  it("resultados", () => { const r = simResults(1000, 20); expect(r.ok && r.value.results).toBe(50); expect(simResults(0, 1).ok).toBe(false); });
  it("equilíbrio", () => { const r = simBreakEvenRoas(25); expect(r.ok && r.value.roas).toBe(4); expect(simBreakEvenRoas(0).ok).toBe(false); });
  it("CPA máximo", () => { const r = simMaxCpa(200, 30); expect(r.ok && r.value.maxCpa).toBe(60); });
  it("funil", () => {
    const r = simFunnel(1000, 20, 2, 10, 20, 500);
    expect(r.ok && Math.round(r.value.impressions)).toBe(50000);
    if (r.ok) { expect(r.value.clicks).toBe(1000); expect(r.value.leads).toBe(100); expect(r.value.sales).toBe(20); expect(r.value.revenue).toBe(10000); expect(r.value.cpa).toBe(50); }
  });
});
