import { Card, EmptyState, PageHeader, btnCls, inputCls } from "@/components/ui";
import { brl, int, pct, pctChange, ratio } from "@/lib/metrics";
import { getCampaignDetail, loadCampaigns, resolvePeriod } from "@/server/insights";
import { one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";

export const metadata = { title: "Comparar — AdsPilot" };
const ROWS: { label: string; get: (t: import("@/lib/metrics").Totals, c: string) => string; key: keyof import("@/lib/metrics").Totals; lowerBetter?: boolean }[] = [
  { label: "Gasto", get: (t, c) => brl(t.spend, c), key: "spend" }, { label: "Impressões", get: (t) => int(t.impressions), key: "impressions" }, { label: "Cliques", get: (t) => int(t.clicks), key: "clicks" },
  { label: "CTR", get: (t) => pct(t.ctr), key: "ctr" }, { label: "CPC", get: (t, c) => brl(t.cpc, c), key: "cpc", lowerBetter: true }, { label: "CPM", get: (t, c) => brl(t.cpm, c), key: "cpm", lowerBetter: true },
  { label: "Resultados", get: (t) => int(t.results), key: "results" }, { label: "Custo/resultado", get: (t, c) => brl(t.costPerResult, c), key: "costPerResult", lowerBetter: true },
  { label: "Leads", get: (t) => int(t.leads), key: "leads" }, { label: "CPL", get: (t, c) => brl(t.cpl, c), key: "cpl", lowerBetter: true }, { label: "Compras", get: (t) => int(t.purchases), key: "purchases" }, { label: "CPA", get: (t, c) => brl(t.cpa, c), key: "cpa", lowerBetter: true },
  { label: "Taxa de conversão", get: (t) => pct(t.conversionRate), key: "conversionRate" }, { label: "ROAS", get: (t) => ratio(t.roas), key: "roas" },
];

export default async function Comparar({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor } = await requireActor();
  const dias = [7, 30, 90].includes(Number(one(sp.dias))) ? Number(one(sp.dias)) : 30;
  const p = resolvePeriod(dias);
  const all = await loadCampaigns(actor, { since: p.since, until: p.until });
  const mode = one(sp.modo) === "campanhas" ? "campanhas" : "periodo";
  const sel = (one(sp.a) && [one(sp.a)!, one(sp.b), one(sp.c)].filter(Boolean)) as string[] | false;
  const picked = sel ? await Promise.all(sel.slice(0, 3).map((id) => getCampaignDetail(actor, id, p).catch(() => null))) : [];
  const cols = mode === "periodo"
    ? picked.filter(Boolean).slice(0, 1).flatMap((d) => [{ name: `${d!.campaign.name} — atual`, sub: `${p.since} a ${p.until}`, t: d!.totals, cur: d!.currency }, { name: "Período anterior", sub: `${p.prevSince} a ${p.prevUntil}`, t: d!.prevTotals, cur: d!.currency }])
    : picked.filter(Boolean).map((d) => ({ name: d!.campaign.name, sub: `${p.since} a ${p.until}`, t: d!.totals, cur: d!.currency }));
  const currencies = new Set(cols.map((c) => c.cur));
  return (
    <>
      <PageHeader title="Comparar" subtitle="Compare a mesma campanha em dois períodos, ou até 3 campanhas lado a lado. “—” = a Meta não informou." />
      <Card className="mb-4">
        <form method="get" className="flex flex-wrap items-end gap-3">
          <label className="text-sm font-medium">Modo<select name="modo" defaultValue={mode} className={`${inputCls} mt-1`}><option value="periodo">Período × período anterior</option><option value="campanhas">Campanha × campanha</option></select></label>
          <label className="text-sm font-medium">Período<select name="dias" defaultValue={dias} className={`${inputCls} mt-1`}>{[7, 30, 90].map((d) => <option key={d} value={d}>{d} dias</option>)}</select></label>
          {(["a", "b", "c"] as const).map((k, i) => <label key={k} className="text-sm font-medium">Campanha {i + 1}<select name={k} defaultValue={one(sp[k]) ?? ""} className={`${inputCls} mt-1 max-w-56`}><option value="">—</option>{all.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>)}
          <button className={btnCls.primary}>Comparar</button>
        </form>
      </Card>
      {cols.length === 0 ? <EmptyState title="Escolha ao menos uma campanha" /> : currencies.size > 1 ? <EmptyState title="Moedas diferentes">Não é possível comparar valores monetários entre moedas diferentes.</EmptyState> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><th className="p-3 text-left text-xs text-muted">Métrica</th>{cols.map((c, i) => <th key={i} className="p-3 text-right text-xs text-muted">{c.name}<br /><span className="font-normal">{c.sub}</span></th>)}{mode === "periodo" && <th className="p-3 text-right text-xs text-muted">Variação</th>}</tr></thead>
            <tbody>{ROWS.map((r) => {
              const ch = mode === "periodo" && cols.length === 2 ? pctChange(cols[0].t[r.key] as number | null, cols[1].t[r.key] as number | null) : null;
              const good = ch === null ? null : r.lowerBetter ? ch < 0 : ch > 0;
              return <tr key={r.label}><td className="border-t border-line p-3 font-medium">{r.label}</td>{cols.map((c, i) => <td key={i} className="num border-t border-line p-3 text-right">{r.get(c.t, c.cur)}</td>)}
                {mode === "periodo" && <td className={`num border-t border-line p-3 text-right ${good === null ? "text-muted" : good ? "text-ok" : "text-danger"}`}>{ch === null ? "—" : `${ch > 0 ? "+" : ""}${ch.toFixed(1).replace(".", ",")}%`}</td>}</tr>;
            })}</tbody>
          </table>
          <p className="px-3 py-2 text-xs text-muted">Variações só aparecem quando os dois períodos têm dado. Verde/vermelho indica direção (custo menor = melhor); não prova causa.</p>
        </Card>)}
    </>
  );
}
