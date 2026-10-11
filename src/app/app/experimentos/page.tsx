import { Form } from "@/components/form";
import { Alert, Badge, Card, EmptyState, PageHeader, inputCls } from "@/components/ui";
import { brl, int, pct } from "@/lib/metrics";
import { canActor } from "@/server/context";
import { experimentResults, listExperiments } from "@/server/library";
import { filterOptions, targetOptions } from "@/server/params";
import { requireActor } from "@/server/session";
import { experimentStatusAction, saveExperimentAction } from "../../actions";

export const metadata = { title: "Experimentos — AdsPilot" };
const STATUS = { planned: "Planejado", running: "Em andamento", concluded: "Concluído", cancelled: "Cancelado" } as const;
const METRIC = { ctr: "CTR", cpa: "CPA", cpl: "CPL", roas: "ROAS", cpc: "CPC", conversion_rate: "Taxa de conversão" } as const;
const VERDICT: Record<string, { label: string; tone: "ok" | "warn" | "neutral" }> = { sem_dados: { label: "Sem dados", tone: "neutral" }, amostra_insuficiente: { label: "Amostra insuficiente", tone: "warn" }, inconclusivo: { label: "Inconclusivo", tone: "neutral" }, diferenca_significativa: { label: "Diferença significativa", tone: "ok" }, descritivo: { label: "Comparação descritiva", tone: "neutral" } };

export default async function Experimentos() {
  const { actor } = await requireActor();
  const [list, opts, base] = await Promise.all([listExperiments(actor), targetOptions(actor), filterOptions(actor)]);
  const write = canActor(actor, "library.write");
  const results = await Promise.all(list.map((e) => experimentResults(actor, e)));
  return (
    <>
      <PageHeader title="Experimentos" subtitle="Testes A/B com hipótese, variável e métrica definidas antes. O AdsPilot só declara diferença quando há amostra suficiente." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {list.length === 0 ? <EmptyState title="Nenhum experimento">{write ? "Planeje o primeiro ao lado." : ""}</EmptyState> : list.map((e, i) => {
            const r = results[i], v = VERDICT[r.verdict.status];
            return (
              <Card key={e.id}>
                <div className="flex flex-wrap items-start justify-between gap-2"><div><h2 className="font-semibold">{e.name}</h2><p className="text-xs text-muted">Variável: {e.variable} · métrica primária: {METRIC[e.primaryMetric]}</p></div><Badge>{STATUS[e.status]}</Badge></div>
                <p className="mt-2 text-sm"><span className="text-muted">Hipótese ({"não comprovada"}): </span>{e.hypothesis}</p>
                <div className="mt-3 overflow-x-auto"><table className="w-full text-sm"><thead><tr>{["Variante", "Impressões", "Cliques", "CTR", "Resultados", "Gasto"].map((h) => <th key={h} className="p-2 text-left text-xs text-muted">{h}</th>)}</tr></thead>
                  <tbody>{r.variants.map((x) => <tr key={x.name}><td className="border-t border-line p-2 font-medium">{x.name}</td><td className="num border-t border-line p-2">{int(x.totals?.impressions ?? null)}</td><td className="num border-t border-line p-2">{int(x.totals?.clicks ?? null)}</td><td className="num border-t border-line p-2">{pct(x.totals?.ctr ?? null)}</td><td className="num border-t border-line p-2">{int(x.totals?.results ?? null)}</td><td className="num border-t border-line p-2">{brl(x.totals?.spend ?? null)}</td></tr>)}</tbody></table></div>
                <p className="mt-1 text-xs text-muted">Janela: {r.since} a {r.until} · dados sincronizados.</p>
                <div className="mt-2 space-y-1"><Badge tone={v.tone}>{v.label}{r.verdict.leader ? ` — à frente: ${r.verdict.leader}` : ""}</Badge><ul className="list-disc pl-5 text-xs text-muted">{r.verdict.notes.map((n) => <li key={n}>{n}</li>)}</ul></div>
                {e.conclusion && <p className="mt-2 text-sm"><strong>Conclusão registrada:</strong> {e.conclusion}{e.nextAction ? ` — Próxima ação: ${e.nextAction}` : ""}</p>}
                {write && e.status !== "concluded" && e.status !== "cancelled" && (
                  <Form action={experimentStatusAction} submit="Atualizar" variant="secondary" className="mt-3 space-y-2">
                    <input type="hidden" name="experimentId" value={e.id} />
                    <label className="block text-sm font-medium">Status<select name="status" defaultValue={e.status} className={`${inputCls} mt-1`}>{Object.entries(STATUS).map(([k, s]) => <option key={k} value={k}>{s}</option>)}</select></label>
                    <label className="block text-sm font-medium">Conclusão (obrigatória para concluir)<textarea name="conclusao" rows={2} className={`${inputCls} mt-1`} /></label>
                    <label className="block text-sm font-medium">Próxima ação<input name="proxima" className={`${inputCls} mt-1`} /></label>
                  </Form>)}
              </Card>);
          })}
        </div>
        {write && (
          <Card className="h-fit">
            <h2 className="mb-3 text-sm font-semibold">Planejar experimento</h2>
            <Form action={saveExperimentAction} submit="Criar experimento">
              <label className="block text-sm font-medium">Nome<input name="name" required className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Hipótese<textarea name="hipotese" required rows={2} placeholder="Se… então… porque…" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Objetivo<input name="objetivo" required className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Variável testada<input name="variavel" required placeholder="ex.: título do anúncio" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Métrica primária<select name="metrica" className={`${inputCls} mt-1`}>{Object.entries(METRIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              {[1, 2, 3].map((n) => <div key={n} className="grid grid-cols-2 gap-2"><label className="block text-sm font-medium">Variante {n}{n < 3 ? "" : " (opcional)"}<input name={`v${n}`} required={n < 3} className={`${inputCls} mt-1`} /></label>
                <label className="block text-sm font-medium">Campanha<select name={`c${n}`} className={`${inputCls} mt-1`}><option value="">—</option>{opts.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label></div>)}
              <div className="grid grid-cols-2 gap-2"><label className="block text-sm font-medium">Início<input name="inicio" type="date" className={`${inputCls} mt-1`} /></label><label className="block text-sm font-medium">Fim<input name="fim" type="date" className={`${inputCls} mt-1`} /></label></div>
              <label className="block text-sm font-medium">Orçamento (opcional)<input name="orcamento" inputMode="decimal" className={`${inputCls} mt-1`} /></label>
              {base.clients.length > 0 && actor.allowedAccountIds === null && <label className="block text-sm font-medium">Cliente<select name="cliente" className={`${inputCls} mt-1`}><option value="">Nenhum</option>{base.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>}
            </Form>
            <div className="mt-3"><Alert tone="info">Hipóteses são apostas, não fatos. Só considere um resultado quando a amostra mínima for atingida.</Alert></div>
          </Card>)}
      </div>
    </>
  );
}
