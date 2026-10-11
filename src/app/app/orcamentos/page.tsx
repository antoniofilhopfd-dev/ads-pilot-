import { Form } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { TargetSelect } from "@/components/target-select";
import { Badge, Card, EmptyState, PageHeader, btnCls, inputCls } from "@/components/ui";
import { brl, pct } from "@/lib/metrics";
import { PACING_LABEL, type PacingStatus } from "@/lib/pacing";
import { listBudgets, simulationBase, simulateRedistribution } from "@/server/budget";
import { canActor } from "@/server/context";
import { one, targetOptions, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { deleteBudgetAction, saveBudgetAction } from "../../actions";

export const metadata = { title: "Orçamentos — AdsPilot" };
const TONE: Record<PacingStatus, "ok" | "warn" | "danger" | "neutral"> = { sem_dados: "neutral", periodo_futuro: "neutral", no_ritmo: "ok", abaixo_do_ritmo: "warn", acima_do_ritmo: "warn", projecao_excede: "danger", excedido: "danger" };
const SCOPE = { client: "Cliente", account: "Conta", campaign: "Campanha" } as const;

export default async function Orcamentos({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor } = await requireActor();
  const now = new Date();
  const periodo = /^\d{4}-(0[1-9]|1[0-2])$/.test(one(sp.periodo) ?? "") ? one(sp.periodo)! : now.toISOString().slice(0, 7);
  const [rows, opts] = await Promise.all([listBudgets(actor, periodo, now), targetOptions(actor)]);
  const manage = canActor(actor, "budgets.manage");
  const simId = one(sp.simular);
  const simRow = rows.find((r) => r.id === simId);
  let sim = null as null | { label: string; result: ReturnType<typeof simulateRedistribution>; remainingDays: number };
  if (simRow) {
    const base = await simulationBase(actor, simRow.scope, simRow.scopeId, now);
    const changes = base.campaigns.map((c) => ({ id: c.id, newDaily: Number(one(sp[`d_${c.id}`]) ?? c.dailySpend) })).filter((c) => Number.isFinite(c.newDaily) && c.newDaily >= 0);
    sim = { label: base.label, remainingDays: base.remainingDays, result: simulateRedistribution(base.campaigns, changes, base.remainingDays) };
  }
  return (
    <>
      <PageHeader title="Orçamentos" subtitle="Orçamento PLANEJADO por período × gasto REPORTADO pela Meta. É um controle interno: não limita nem bloqueia gasto na Meta." />
      <form className="mb-4 flex items-end gap-2" method="get">
        <label className="text-sm font-medium">Período (mês)<input type="month" name="periodo" defaultValue={periodo} className={`${inputCls} mt-1`} /></label>
        <button className={btnCls.secondary}>Ver</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          {rows.length === 0 ? <EmptyState title="Nenhum orçamento planejado neste mês">{manage ? "Defina um orçamento no formulário ao lado." : "Peça a um gestor para definir."}</EmptyState> : rows.map((r) => {
            const p = r.pacing;
            return (
              <Card key={r.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><p className="text-xs text-muted">{SCOPE[r.scope]}</p><h2 className="font-semibold">{r.scopeLabel}</h2></div>
                  <Badge tone={TONE[p.status]}>{PACING_LABEL[p.status]}</Badge>
                </div>
                <div className="mt-3" role="img" aria-label={`Consumo: ${p.consumptionPct === null ? "sem dados" : pct(p.consumptionPct, 1)} do orçamento; esperado ${pct((p.expectedSpent / r.amount) * 100, 1)}`}>
                  <div className="relative h-3 rounded-full bg-[#eef0f5]">
                    <div className="h-3 rounded-full bg-brand" style={{ width: `${Math.min(p.consumptionPct ?? 0, 100)}%` }} />
                    <div className="absolute top-[-3px] h-[18px] w-0.5 bg-violet" style={{ left: `${Math.min((p.expectedSpent / r.amount) * 100, 100)}%` }} title="Ritmo esperado" />
                  </div>
                  <p className="mt-1 text-xs text-muted">Barra = gasto reportado · traço = ritmo esperado hoje (linear)</p>
                </div>
                <dl className="mt-3 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                  <div><dt className="text-xs text-muted">Planejado</dt><dd className="num font-medium">{brl(r.amount, r.currency)}</dd></div>
                  <div><dt className="text-xs text-muted">Gasto reportado</dt><dd className="num font-medium">{brl(p.spent, r.currency)}</dd></div>
                  <div><dt className="text-xs text-muted">Projeção de fechamento</dt><dd className="num font-medium">{p.projectedClose === null ? "— (poucos dados)" : brl(p.projectedClose, r.currency)}</dd></div>
                  <div><dt className="text-xs text-muted">Diária p/ fechar no orçamento</dt><dd className="num font-medium">{brl(p.suggestedDaily, r.currency)}</dd></div>
                </dl>
                <p className="mt-2 text-xs text-muted">Marcos atingidos: {p.milestonesReached.length ? p.milestonesReached.map((m) => `${m}%`).join(", ") : "nenhum"} (configurados: {r.milestones.join("%, ")}%) · {p.daysWithData} dia(s) com dado.</p>
                <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Premissas do cálculo</summary><ul className="ml-4 list-disc">{p.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></details>
                <div className="mt-3 flex gap-2">
                  <a className={btnCls.secondary} href={`/app/orcamentos?periodo=${periodo}&simular=${r.id}#simulacao`}>Simular redistribuição</a>
                  {manage && <form action={deleteBudgetAction}><input type="hidden" name="planId" value={r.id} /><ConfirmButton message="Excluir este orçamento planejado?" className={btnCls.danger}>Excluir</ConfirmButton></form>}
                </div>
              </Card>
            );
          })}
          {sim && simRow && (
            <Card className="scroll-mt-4">
              <h2 id="simulacao" className="font-semibold">Simulação — {sim.label}</h2>
              <p className="text-sm text-muted">Altere o gasto diário de cada campanha e veja o efeito estimado nos {sim.remainingDays} dias restantes. Nada é aplicado na Meta.</p>
              {sim.result.rows.length === 0 ? <p className="mt-2 text-sm text-muted">Sem campanhas com gasto nos últimos 7 dias.</p> : (
                <form method="get" className="mt-3 space-y-3">
                  <input type="hidden" name="periodo" value={periodo} /><input type="hidden" name="simular" value={simRow.id} />
                  <div className="overflow-x-auto"><table className="w-full text-sm"><thead><tr><th className="p-2 text-left text-xs text-muted">Campanha</th><th className="p-2 text-right text-xs text-muted">Diária atual</th><th className="p-2 text-right text-xs text-muted">Nova diária</th><th className="p-2 text-right text-xs text-muted">Resultados (atual → novo)</th></tr></thead>
                    <tbody>{sim.result.rows.map((c) => (
                      <tr key={c.id}><td className="p-2">{c.name}</td><td className="num p-2 text-right">{brl(c.currentDaily, simRow.currency)}</td>
                        <td className="p-2 text-right"><input aria-label={`Nova diária de ${c.name}`} name={`d_${c.id}`} type="number" step="0.01" min="0" defaultValue={c.newDaily.toFixed(2)} className={`${inputCls} w-28 text-right`} /></td>
                        <td className="num p-2 text-right">{c.projectedResultsCurrent === null ? "—" : c.projectedResultsCurrent.toFixed(1)} → {c.projectedResultsNew === null ? "—" : c.projectedResultsNew.toFixed(1)}</td></tr>))}</tbody></table></div>
                  <p className="text-sm">Gasto projetado: {brl(sim.result.totals.spendCurrent, simRow.currency)} → <strong>{brl(sim.result.totals.spendNew, simRow.currency)}</strong> · Resultados: {sim.result.totals.resultsCurrent === null ? "—" : sim.result.totals.resultsCurrent.toFixed(1)} → <strong>{sim.result.totals.resultsNew === null ? "— (alguma campanha sem custo por resultado)" : sim.result.totals.resultsNew.toFixed(1)}</strong></p>
                  <button className={btnCls.primary}>Recalcular</button>
                  <ul className="ml-4 list-disc text-xs text-muted">{sim.result.assumptions.map((a) => <li key={a}>{a}</li>)}</ul>
                </form>)}
            </Card>)}
        </div>
        {manage && (
          <Card className="h-fit">
            <h2 className="mb-3 text-sm font-semibold">Definir orçamento planejado</h2>
            <Form action={saveBudgetAction} submit="Salvar orçamento">
              <TargetSelect opts={opts} />
              <label className="block text-sm font-medium">Mês<input name="periodo" type="month" defaultValue={periodo} required className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Valor do mês<input name="valor" inputMode="decimal" required placeholder="5000,00" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Marcos de alerta (%)<input name="marcos" placeholder="50, 80, 100" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Observação<input name="nota" maxLength={300} className={`${inputCls} mt-1`} /></label>
            </Form>
          </Card>)}
      </div>
    </>
  );
}
