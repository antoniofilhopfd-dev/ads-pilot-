import { describe, expect, it } from "vitest";
import { aggregate, pctChange } from "@/lib/metrics";

const r = (o: Partial<Parameters<typeof aggregate>[0][number]> = {}) => ({ date: "2026-10-01", spend: null, impressions: null, reach: null, clicks: null, results: null, purchaseValue: null, ...o });

describe("métricas", () => {
  it("sem linhas: tudo nulo (não zero)", () => {
    const t = aggregate([]);
    expect(t.spend).toBeNull(); expect(t.ctr).toBeNull(); expect(t.roas).toBeNull(); expect(t.days).toBe(0);
  });

  it("valor ausente não vira zero e não entra na soma", () => {
    const t = aggregate([r({ spend: 100, results: 10 }), r({ date: "2026-10-02", spend: 50, results: null })]);
    expect(t.spend).toBe(150);
    expect(t.results).toBe(10);
    // custo/resultado só considera linhas com gasto E resultado informados
    expect(t.costPerResult).toBe(10);
  });

  it("razões são recalculadas dos totais, não médias de razões", () => {
    const t = aggregate([r({ impressions: 1000, clicks: 10, spend: 10 }), r({ date: "2026-10-02", impressions: 9000, clicks: 900, spend: 90 })]);
    expect(t.ctr).toBeCloseTo(9.1, 5); // 910/10000, e não a média de 1% e 10%
    expect(t.cpc).toBeCloseTo(100 / 910, 6);
    expect(t.cpm).toBeCloseTo(10, 6);
  });

  it("denominador zero ou nulo dá nulo", () => {
    expect(aggregate([r({ impressions: 0, clicks: 0, spend: 5 })]).ctr).toBeNull();
    expect(aggregate([r({ spend: 5 })]).cpc).toBeNull();
  });

  it("alcance e frequência só existem em recorte de 1 dia", () => {
    const um = aggregate([r({ reach: 800, impressions: 1000 })]);
    expect(um.reach).toBe(800); expect(um.frequency).toBeCloseTo(1.25);
    const dois = aggregate([r({ reach: 800, impressions: 1000 }), r({ date: "2026-10-02", reach: 700, impressions: 900 })]);
    expect(dois.reach).toBeNull(); expect(dois.frequency).toBeNull();
  });

  it("ROAS exige valor de compra informado", () => {
    expect(aggregate([r({ spend: 100, results: 5 })]).roas).toBeNull();
    expect(aggregate([r({ spend: 100, purchaseValue: 420 })]).roas).toBeCloseTo(4.2);
  });

  it("variação percentual", () => {
    expect(pctChange(110, 100)).toBeCloseTo(10);
    expect(pctChange(null, 100)).toBeNull();
    expect(pctChange(10, 0)).toBeNull();
    expect(pctChange(10, null)).toBeNull();
  });
});
