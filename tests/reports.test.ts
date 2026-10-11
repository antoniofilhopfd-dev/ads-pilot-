import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { db } from "@/db";
import { reportExports } from "@/db/schema";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { syncAccount } from "@/server/meta/sync";
import { buildReport } from "@/server/reports/builder";
import { csvCell, parseCsv, toCsv } from "@/server/reports/csv";
import { narrate } from "@/server/reports/narrative";
import { generatePdf } from "@/server/reports/pdf";
import { exportReport, deleteTemplate, listExports, listTemplates, saveTemplate, generateFile } from "@/server/reports/service";
import { primaryTable } from "@/server/reports/table";
import { DEFAULT_SECTIONS, REPORT_TYPES, type Report, type ReportConfig } from "@/server/reports/types";
import { verifyCsv, verifyPdf, verifyXlsx } from "@/server/reports/verify";
import { generateXlsx } from "@/server/reports/xlsx";
import { createClient } from "@/server/services/clients";
import { addUserWithRole, newOrg } from "./helpers";

const NOW = new Date("2026-10-11T12:00:00Z");
const cfg = (type: ReportConfig["type"], extra: Partial<ReportConfig> = {}): ReportConfig => ({ type, days: 30, sections: DEFAULT_SECTIONS[type], ...extra });

async function setup(label = "R") {
  const org = await newOrg(label);
  await connectDemo(org.admin);
  const accts = await listAccounts(org.admin);
  const cli = await createClient(org.admin, { name: "Loja Exemplo" });
  for (const a of accts) { await configureAccount(org.admin, a.id, { selected: true, clientId: a.name.includes("Loja") ? cli : null }); await syncAccount(org.admin, a.id, { now: NOW, sleep: async () => {} }); }
  return { ...org, cli, accts };
}

describe("relatório: conteúdo", () => {
  it("monta o relatório com metadados, KPIs, comparação e separa fatos/hipóteses/recomendações", async () => {
    const o = await setup();
    const r = await buildReport(o.admin, cfg("executive"), NOW);
    expect(r.meta).toMatchObject({ isDemo: true, prevComparable: true, hasData: true, currency: "BRL" });
    expect(r.kpis.find((k) => k.key === "spend")!.value).toBeGreaterThan(0);
    expect(r.kpis.find((k) => k.key === "spend")!.change).not.toBeNull();
    expect(r.kpis.find((k) => k.key === "roas")!.value).not.toBeNull(); // só a campanha de vendas tem receita
    expect(r.facts.length).toBeGreaterThan(0);
    expect(r.hypotheses.every((h) => h.startsWith("HIPÓTESE (não comprovada)"))).toBe(true);
    expect(r.limitations.join(" ")).toMatch(/DADOS SIMULADOS/);
    expect(r.alerts.some((a) => /reprovado/.test(a.title))).toBe(true);
    expect(r.recommendations.join(" ")).toMatch(/reprovados/);
  });

  it("não atribui causalidade: hipóteses só aparecem com evidência e sempre rotuladas", () => {
    const base = { config: cfg("executive"), title: "x", meta: { organization: "o", client: null, account: null, since: "2026-09-01", until: "2026-09-30", prevSince: "", prevUntil: "", generatedAt: NOW, lastSyncedAt: NOW, stale: false, isDemo: false, currency: "BRL", mixedCurrency: false, coverageSince: "2026-07-01", prevComparable: true, partialCurrent: false, hasData: true },
      kpis: [{ key: "spend", label: "", value: 1000, prev: 800, change: 25, format: "money" as const }, { key: "results", label: "", value: 50, prev: 55, change: -9, format: "int" as const }, { key: "impressions", label: "", value: 90000, prev: 1, change: 1, format: "int" as const }],
      daily: [], campaigns: [], variations: [], breakdown: [], budget: [], alerts: [], changes: [], health: { state: "ok", instructions: [], accounts: [] }, facts: [], hypotheses: [], recommendations: [], limitations: [], methodology: [] } as unknown as Report;
    const n = narrate(base);
    expect(n.hypotheses).toHaveLength(1); expect(n.hypotheses[0]).toMatch(/não comprovada/); expect(n.hypotheses[0]).toMatch(/não tem dados para confirmar/);
    // sem evidência, sem hipótese
    base.kpis[0].change = 5;
    expect(narrate(base).hypotheses).toHaveLength(0);
    // amostra pequena vira limitação
    base.kpis[1].value = 10;
    expect(narrate(base).limitations.join(" ")).toMatch(/Amostra pequena/);
  });

  it("sem dados: não inventa indicadores", async () => {
    const org = await newOrg("Vazio");
    const r = await buildReport(org.admin, cfg("executive"), NOW);
    expect(r.meta.hasData).toBe(false);
    expect(r.kpis.every((k) => k.value === null)).toBe(true);
    expect(r.limitations.join(" ")).toMatch(/Não há métricas/);
  });

  it("filtro por cliente restringe os dados", async () => {
    const o = await setup();
    const todos = await buildReport(o.admin, cfg("campaigns"), NOW);
    const loja = await buildReport(o.admin, cfg("campaigns", { clientId: o.cli }), NOW);
    expect(loja.campaigns.length).toBeLessThan(todos.campaigns.length);
    expect(loja.meta.client).toBe("Loja Exemplo");
    expect(loja.kpis[0].value!).toBeLessThan(todos.kpis[0].value!);
  });
});

describe("exportações: gera, reabre e verifica", () => {
  it("todos os tipos de relatório × PDF/XLSX/CSV são gerados e VERIFICADOS", async () => {
    const o = await setup();
    for (const type of REPORT_TYPES) {
      const report = await buildReport(o.admin, cfg(type), NOW);
      for (const format of ["csv", "xlsx", "pdf"] as const) {
        const res = await exportReport(o.admin, cfg(type), format, { report, now: NOW });
        expect(res.verification.ok, `${type}/${format}: ${res.verification.failures.join("; ")}`).toBe(true);
        expect(res.buffer.length).toBeGreaterThan(format === "csv" ? 20 : 200); // CSV de uma tabela vazia só tem o cabeçalho
      }
    }
    const rows = await db.select().from(reportExports).where(eq(reportExports.organizationId, o.organizationId));
    expect(rows).toHaveLength(REPORT_TYPES.length * 3);
    expect(rows.every((r) => r.verified && /^[0-9a-f]{64}$/.test(r.sha256))).toBe(true);
  }, 120_000);

  it("CSV: valor ausente fica vazio (não zero) e total confere", async () => {
    const o = await setup();
    const r = await buildReport(o.admin, cfg("campaigns"), NOW);
    const csv = (await generateFile("csv", r)).toString("utf8");
    const rows = parseCsv(csv.slice(1));
    const iSpend = rows[0].indexOf("Gasto");
    const pausada = rows.find((x) => x[0].startsWith("Reconhecimento"))!;
    expect(pausada[iSpend]).toBe("");
    const total = rows.slice(1).reduce((s, x) => s + (x[iSpend] ? Number(x[iSpend]) : 0), 0);
    expect(total).toBeCloseTo(r.kpis[0].value!, 1);
    expect(rows[1].at(-1)).toMatch(/DEMONSTRAÇÃO/);
  });

  it("CSV: neutraliza fórmulas, aspas, vírgulas e quebras de linha", () => {
    expect(csvCell("=HYPERLINK(\"http://x\")", "text")).toBe("\"'=HYPERLINK(\"\"http://x\"\")\"");
    expect(csvCell("+55 11", "text")).toBe("'+55 11");
    expect(csvCell("a,b", "text")).toBe('"a,b"');
    expect(csvCell("linha1\nlinha2", "text")).toBe('"linha1\nlinha2"');
    expect(csvCell(-5.5, "money")).toBe("-5.5"); // números negativos não são "fórmula"
    const t = { name: "t", cols: [{ header: "a", type: "text" as const }, { header: "b", type: "money" as const }], rows: [['x"y,z', 1.5], [null, null]] };
    expect(parseCsv(toCsv(t))).toEqual([["a", "b"], ['x"y,z', "1.5"], ["", ""]]);
  });

  it("XLSX: tipos numéricos, filtro, cabeçalho congelado, abas e ausentes vazios", async () => {
    const o = await setup();
    const r = await buildReport(o.admin, cfg("campaigns"), NOW);
    const v = await verifyXlsx(await generateXlsx(r), r);
    expect(v.failures).toEqual([]);
    expect(v.checks.join(" ")).toMatch(/Filtro automático/);
  });

  it("o verificador REPROVA arquivos adulterados (não é carimbo automático)", async () => {
    const o = await setup();
    const r = await buildReport(o.admin, cfg("campaigns"), NOW);
    // CSV com total alterado
    const csv = await generateFile("csv", r);
    const bad = Buffer.from(csv.toString("utf8").replace(/,(\d+\.\d\d),/, ",999999.99,"));
    expect(verifyCsv(bad, r).ok).toBe(false);
    // CSV sem BOM e truncado
    expect(verifyCsv(csv.subarray(3), r).ok).toBe(false);
    // XLSX corrompido
    const x = await generateXlsx(r);
    expect((await verifyXlsx(x.subarray(0, x.length - 200), r)).ok).toBe(false);
    // PDF truncado
    const pdf = await generatePdf(r);
    expect((await verifyPdf(pdf.subarray(0, 300), r)).ok).toBe(false);
    // PDF de OUTRO relatório não passa na verificação deste
    const outro = { ...r, meta: { ...r.meta, organization: "Organização Fantasma" } };
    expect((await verifyPdf(pdf, outro)).ok).toBe(false);
    // exportReport recusa entregar arquivo adulterado e registra a falha
    await expect(exportReport(o.admin, cfg("campaigns"), "csv", { report: r, tamper: (b) => b.subarray(3) })).rejects.toThrow(/falhou na verificação/);
    const falhas = (await listExports(o.admin)).filter((e) => !e.verified);
    expect(falhas.length).toBe(1);
  }, 60_000);

  it("PDF grande: várias páginas, cabeçalho/rodapé e numeração corretos", async () => {
    const o = await setup();
    const r = await buildReport(o.admin, cfg("campaigns"), NOW);
    const many = Array.from({ length: 130 }, (_, i) => ({ ...r.campaigns[i % r.campaigns.length], id: `x${i}`, name: `Campanha de teste número ${i + 1}` }));
    const big: Report = { ...r, campaigns: many };
    const pdf = await generatePdf(big);
    const v = await verifyPdf(pdf, big);
    expect(v.failures).toEqual([]);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
    expect(doc.numPages).toBeGreaterThanOrEqual(4);
  }, 60_000);

  it("texto com acentos e caracteres especiais não quebra o PDF", async () => {
    const o = await setup();
    const r = await buildReport(o.admin, cfg("campaigns"), NOW);
    const odd: Report = { ...r, campaigns: [{ ...r.campaigns[0], name: "Promoção “Ação” — São João → 50% ≥ metas ✔" }], meta: { ...r.meta, organization: "Agência Ótima & Cia" } };
    const v = await verifyPdf(await generatePdf(odd), odd);
    expect(v.failures).toEqual([]);
  });
});

describe("isolamento, permissões e modelos", () => {
  it("exportação da organização B nunca contém dados da A; cliente/conta de outra org é recusado", async () => {
    const a = await setup("A");
    const b = await setup("B");
    const rb = await buildReport(b.admin, cfg("campaigns"), NOW);
    expect(rb.meta.organization).not.toBe((await buildReport(a.admin, cfg("campaigns"), NOW)).meta.organization);
    await expect(buildReport(b.admin, cfg("campaigns", { clientId: a.cli }), NOW)).rejects.toMatchObject({ code: "not_found" });
    await expect(buildReport(b.admin, cfg("campaigns", { accountId: a.accts[0].id }), NOW)).rejects.toMatchObject({ code: "not_found" });
    expect((await listExports(b.admin)).every((e) => e.organizationId === b.organizationId)).toBe(true);
  });

  it("analista exporta (leitura), mas não gerencia modelos; modelos são isolados por organização", async () => {
    const a = await setup("A");
    const b = await setup("B");
    const an = await addUserWithRole(a, "analyst");
    expect((await exportReport(an.actor, cfg("executive"), "csv", { now: NOW })).verification.ok).toBe(true);
    await expect(saveTemplate(an.actor, "Meu modelo", cfg("executive"))).rejects.toMatchObject({ code: "forbidden" });
    const id = await saveTemplate(a.admin, "Mensal do cliente", cfg("executive", { clientId: a.cli }));
    await expect(saveTemplate(a.admin, "Mensal do cliente", cfg("executive"))).rejects.toMatchObject({ code: "conflict" });
    await expect(saveTemplate(a.admin, "x", { type: "hack" })).rejects.toMatchObject({ code: "validation" });
    expect((await listTemplates(a.admin)).map((t) => t.id)).toContain(id);
    expect(await listTemplates(b.admin)).toHaveLength(0);
    await expect(deleteTemplate(b.admin, id)).rejects.toMatchObject({ code: "not_found" });
    await deleteTemplate(a.admin, id);
    expect(await listTemplates(a.admin)).toHaveLength(0);
  });
});

void primaryTable;
