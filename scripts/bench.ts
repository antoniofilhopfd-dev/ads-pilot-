// Benchmark com volume sintético (organização descartável no banco de DEV; removida ao final).
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { adAccounts, campaigns, insightsDaily, organizations, users } from "../src/db/schema";
import { register } from "../src/server/services/auth";
import { getActor } from "../src/server/context";
import { configureAccount, connectDemo, listAccounts } from "../src/server/meta/connection";
import { getOverview, listCampaigns, resolvePeriod } from "../src/server/insights";
import { buildReport } from "../src/server/reports/builder";
import { exportReport } from "../src/server/reports/service";
import { DEFAULT_SECTIONS } from "../src/server/reports/types";

const N_CAMP = Number(process.env.N_CAMP ?? 300), DAYS = 90;
const time = async <T,>(label: string, fn: () => Promise<T>, reps = 3) => {
  const ts: number[] = []; let out!: T;
  for (let i = 0; i < reps; i++) { const t = performance.now(); out = await fn(); ts.push(performance.now() - t); }
  ts.sort((a, b) => a - b); console.log(`${label.padEnd(46)} mediana ${ts[Math.floor(ts.length / 2)].toFixed(0).padStart(5)} ms   (máx ${ts.at(-1)!.toFixed(0)} ms)`); return out;
};

(async () => {
  const { userId, organizationId } = await register({ name: "Bench", email: `bench-${Date.now()}@exemplo.com`, password: "SenhaBench2026", organizationName: "Org Bench" });
  const actor = await getActor(userId, organizationId);
  await connectDemo(actor);
  const [acct] = await listAccounts(actor); await configureAccount(actor, acct.id, { selected: true, clientId: null });
  const now = new Date(); const ids: string[] = [];
  const camps = Array.from({ length: N_CAMP }, (_, i) => { const id = randomUUID(); ids.push(id); return { id, organizationId, adAccountId: acct.id, externalId: `bench_${i}`, name: `Campanha benchmark ${i + 1}`, objective: "OUTCOME_SALES", status: "ACTIVE", effectiveStatus: i % 17 === 0 ? "PAUSED" : "ACTIVE", dailyBudget: "100.00", lifetimeBudget: null, startTime: null, stopTime: null, syncedAt: now }; });
  for (let i = 0; i < camps.length; i += 500) await db.insert(campaigns).values(camps.slice(i, i + 500));
  const rows = [];
  for (const id of ids) for (let d = 0; d < DAYS; d++) { const date = new Date(now.getTime() - d * 86_400_000).toISOString().slice(0, 10); rows.push({ campaignId: id, date, organizationId, adAccountId: acct.id, spend: (50 + Math.random() * 100).toFixed(2), impressions: 5000, reach: 4000, clicks: 100, results: 5, resultType: "purchase", purchaseValue: "300.00", syncedAt: now }); }
  for (let i = 0; i < rows.length; i += 2000) await db.insert(insightsDaily).values(rows.slice(i, i + 2000));
  await db.update(adAccounts).set({ lastSyncedAt: now }).where(eq(adAccounts.id, acct.id));
  console.log(`Volume: ${N_CAMP} campanhas × ${DAYS} dias = ${rows.length.toLocaleString("pt-BR")} linhas de métricas\n`);

  const P = resolvePeriod(30), P90 = resolvePeriod(90);
  await time("Painel (overview 30 dias)", () => getOverview(actor, P));
  await time("Painel (overview 90 dias)", () => getOverview(actor, P90));
  await time("Lista de campanhas (página 1, 20 itens)", () => listCampaigns(actor, { ...P, pageSize: 20 }));
  const cfg = { type: "executive" as const, days: 30 as const, sections: DEFAULT_SECTIONS.executive };
  const report = await time("Construção do relatório executivo", () => buildReport(actor, cfg));
  for (const f of ["csv", "xlsx", "pdf"] as const) await time(`Exportação ${f.toUpperCase()} (gerar + verificar)`, async () => { const r = await exportReport(actor, cfg, f, { report }); return r.buffer.length; }, 2);
  const big = await exportReport(actor, cfg, "pdf", { report });
  console.log(`\nTamanho do PDF com ${N_CAMP} campanhas: ${(big.buffer.length / 1024).toFixed(0)} KB`);
  await db.delete(organizations).where(eq(organizations.id, organizationId)); await db.delete(users).where(eq(users.id, userId)); await closeDb();
})();
