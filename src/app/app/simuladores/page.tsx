import { Alert, Card, PageHeader, btnCls, inputCls } from "@/components/ui";
import { brl, int } from "@/lib/metrics";
import { simBreakEvenRoas, simBudgetForResults, simFunnel, simMaxCpa, simResults } from "@/lib/simulators";
import { one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";

export const metadata = { title: "Simuladores — AdsPilot" };
const n = (v: string | undefined) => (v === undefined || v === "" ? NaN : Number(v.replace(/\./g, "").replace(",", ".")));
const dec = (v: number, d = 1) => v.toFixed(d).replace(".", ",");

function Result({ r, children }: { r: { ok: true; assumptions: string[] } | { ok: false; error: string } | null; children?: React.ReactNode }) {
  if (!r) return null;
  if (!r.ok) return <Alert tone="error">{r.error}</Alert>;
  return (<div className="mt-3 space-y-1 rounded-md bg-canvas p-3 text-sm" role="status"><div>{children}</div><ul className="list-disc pl-5 text-xs text-muted">{r.assumptions.map((a) => <li key={a}>{a}</li>)}</ul></div>);
}
const F = ({ name, label, sp, hint }: { name: string; label: string; sp: SP; hint?: string }) => <label className="block text-sm font-medium">{label}<input name={name} inputMode="decimal" defaultValue={one(sp[name]) ?? ""} className={`${inputCls} mt-1`} />{hint && <span className="text-xs font-normal text-muted">{hint}</span>}</label>;

export default async function Simuladores({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams; await requireActor();
  const sim = one(sp.sim);
  const a = sim === "a" ? simResults(n(one(sp.orc)), n(one(sp.cpr))) : null;
  const b = sim === "b" ? simBudgetForResults(n(one(sp.res)), n(one(sp.cpr2))) : null;
  const c = sim === "c" ? simBreakEvenRoas(n(one(sp.margem))) : null;
  const d = sim === "d" ? simMaxCpa(n(one(sp.ticket)), n(one(sp.margem2))) : null;
  const e = sim === "e" ? simFunnel(n(one(sp.orcf)), n(one(sp.cpm)), n(one(sp.ctr)), n(one(sp.lead)), n(one(sp.fecha)), Number.isFinite(n(one(sp.ticketf))) ? n(one(sp.ticketf)) : null) : null;
  return (
    <>
      <PageHeader title="Simuladores" subtitle="Cenários com os valores que VOCÊ informa. Não usam nem alteram dados da Meta, e não são previsão ou garantia de resultado." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card><h2 className="mb-2 text-sm font-semibold">Resultados esperados por orçamento</h2>
          <form method="get" className="space-y-2"><input type="hidden" name="sim" value="a" /><F name="orc" label="Orçamento (R$)" sp={sp} /><F name="cpr" label="Custo por resultado (R$)" sp={sp} /><button className={btnCls.primary}>Calcular</button></form>
          <Result r={a}>{a?.ok && <>Resultados esperados: <strong>{dec(a.value.results)}</strong></>}</Result></Card>
        <Card><h2 className="mb-2 text-sm font-semibold">Orçamento para uma meta de resultados</h2>
          <form method="get" className="space-y-2"><input type="hidden" name="sim" value="b" /><F name="res" label="Resultados desejados" sp={sp} /><F name="cpr2" label="Custo por resultado (R$)" sp={sp} /><button className={btnCls.primary}>Calcular</button></form>
          <Result r={b}>{b?.ok && <>Orçamento necessário: <strong>{brl(b.value.budget)}</strong></>}</Result></Card>
        <Card><h2 className="mb-2 text-sm font-semibold">ROAS de equilíbrio</h2>
          <form method="get" className="space-y-2"><input type="hidden" name="sim" value="c" /><F name="margem" label="Margem de contribuição (%)" sp={sp} /><button className={btnCls.primary}>Calcular</button></form>
          <Result r={c}>{c?.ok && <>ROAS mínimo para não ter prejuízo: <strong>{dec(c.value.roas, 2)}x</strong></>}</Result></Card>
        <Card><h2 className="mb-2 text-sm font-semibold">CPA máximo</h2>
          <form method="get" className="space-y-2"><input type="hidden" name="sim" value="d" /><F name="ticket" label="Ticket médio (R$)" sp={sp} /><F name="margem2" label="Margem de contribuição (%)" sp={sp} /><button className={btnCls.primary}>Calcular</button></form>
          <Result r={d}>{d?.ok && <>CPA máximo: <strong>{brl(d.value.maxCpa)}</strong></>}</Result></Card>
        <Card className="lg:col-span-2"><h2 className="mb-2 text-sm font-semibold">Funil: impressões → cliques → leads → vendas</h2>
          <form method="get" className="grid gap-2 sm:grid-cols-3"><input type="hidden" name="sim" value="e" /><F name="orcf" label="Orçamento (R$)" sp={sp} /><F name="cpm" label="CPM (R$)" sp={sp} /><F name="ctr" label="CTR (%)" sp={sp} /><F name="lead" label="Taxa de lead (% dos cliques)" sp={sp} /><F name="fecha" label="Taxa de fechamento (% dos leads)" sp={sp} /><F name="ticketf" label="Ticket (R$, opcional)" sp={sp} /><div><button className={btnCls.primary}>Calcular</button></div></form>
          <Result r={e}>{e?.ok && <ul className="grid gap-1 sm:grid-cols-3"><li>Impressões: <strong>{int(e.value.impressions)}</strong></li><li>Cliques: <strong>{int(e.value.clicks)}</strong></li><li>Leads: <strong>{dec(e.value.leads)}</strong></li><li>Vendas: <strong>{dec(e.value.sales)}</strong></li><li>CPL: <strong>{brl(e.value.cpl)}</strong></li><li>CPA: <strong>{brl(e.value.cpa)}</strong></li>{e.value.revenue !== null && <li>Receita: <strong>{brl(e.value.revenue)}</strong></li>}</ul>}</Result></Card>
      </div>
    </>
  );
}
