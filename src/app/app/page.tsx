import Link from "next/link";
import { LineChart } from "@/components/charts";
import { DemoBanner, SyncBadge } from "@/components/data-status";
import { FilterBar } from "@/components/filters";
import { Alert, Badge, Card, EmptyState, PageHeader, Td, Th, btnCls } from "@/components/ui";
import { statusInfo } from "@/lib/labels";
import { brl, brl0, int, pct, pctChange, ratio } from "@/lib/metrics";
import { getOverview } from "@/server/insights";
import { filterOptions, parseFilters, type SP } from "@/server/params";
import { requireActor } from "@/server/session";

export const metadata = { title: "Painel — AdsPilot" };

function Kpi({ label, value, change, note, invert, neutral }: { label: string; value: string; change?: number | null; note?: string; invert?: boolean; neutral?: boolean }) {
  // Gasto não é "bom" nem "ruim" por si só: variação em cor neutra. Variações < 0,05% são tratadas como estáveis.
  if (change !== null && change !== undefined && Math.abs(change) < 0.05) { change = null; note = "Estável vs. período anterior"; }
  const good = change === null || change === undefined ? null : invert ? change <= 0 : change >= 0;
  return (
    <Card>
      <p className="text-xs text-muted">{label}</p>
      <p className="num mt-1 text-2xl font-semibold">{value}</p>
      <p className={`num mt-1 text-xs ${change === null || change === undefined || neutral ? "text-muted" : good ? "text-ok" : "text-danger"}`}>
        {change === null || change === undefined ? note ?? "Sem base de comparação" : `${change >= 0 ? "▲" : "▼"} ${Math.abs(change).toFixed(1).replace(".", ",")}% vs. período anterior`}
      </p>
    </Card>
  );
}

export default async function Painel({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor } = await requireActor();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const [ov, options] = await Promise.all([getOverview(actor, f), filterOptions(actor)]);
  const cur = ov.currency;
  const t = ov.totals, p = ov.prevTotals;
  const q = new URLSearchParams({ ...(f.clientId ? { cliente: f.clientId } : {}), ...(f.accountId ? { conta: f.accountId } : {}), dias: f.dias }).toString();

  if (!ov.hasConnection || !ov.hasSelectedAccounts) {
    return (
      <>
        <PageHeader title="Painel" />
        <EmptyState title={!ov.hasConnection ? "Nenhuma conta de anúncios conectada" : "Nenhuma conta de anúncios selecionada"} action={<Link href="/app/integracoes" className={btnCls.primary}>Ir para Integrações</Link>}>
          {!ov.hasConnection ? "Conecte a Meta Ads (ou ative o modo demonstração) para ver gastos, resultados e campanhas." : "Selecione as contas que o AdsPilot deve acompanhar."}
        </EmptyState>
      </>
    );
  }

  return (
    <>
      <PageHeader title="Painel" subtitle={`${f.since.split("-").reverse().join("/")} a ${f.until.split("-").reverse().join("/")} · comparado a ${f.prevSince.split("-").reverse().join("/")} – ${f.prevUntil.split("-").reverse().join("/")}`} action={<SyncBadge lastSyncedAt={ov.lastSyncedAt} stale={ov.stale} hasConnection />} />
      {ov.isDemo && <DemoBanner />}
      {ov.partialCurrent && ov.coverageSince && <div className="mb-4"><Alert tone="info">Os dados sincronizados começam em {ov.coverageSince.split("-").reverse().join("/")}; o início do período selecionado não está coberto, então os totais podem estar incompletos.</Alert></div>}
      <FilterBar action="/app" options={options} current={{ cliente: f.clientId, conta: f.accountId, dias: f.dias }} />
      {ov.mixedCurrency ? (
        <EmptyState title="Contas com moedas diferentes">Os totais não são somados entre moedas. Filtre por uma conta para ver os valores.</EmptyState>
      ) : (
        <>
          <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <Kpi label="Gasto (informado pela Meta)" value={brl(t.spend, cur)} change={pctChange(t.spend, p.spend)} neutral />
            <Kpi label="Resultados" value={int(t.results)} change={pctChange(t.results, p.results)} note={t.results === null ? "Resultado não informado pela Meta" : !ov.prevComparable ? "Período anterior não sincronizado" : undefined} />
            <Kpi label="Custo por resultado" value={brl(t.costPerResult, cur)} change={pctChange(t.costPerResult, p.costPerResult)} invert />
            <Kpi label="CTR" value={pct(t.ctr)} change={pctChange(t.ctr, p.ctr)} />
            <Kpi label="ROAS" value={ratio(t.roas)} change={pctChange(t.roas, p.roas)} note={t.roas === null ? "Sem receita atribuída (não é zero)" : undefined} />
          </div>
          <div className="mb-4 grid gap-3 lg:grid-cols-[1fr_1fr_340px]">
            <Card><h2 className="mb-2 text-sm font-semibold">Gasto por dia</h2><LineChart data={ov.daily.map((d) => ({ date: d.date, value: d.spend }))} label="Gasto por dia" format={(v) => brl0(v, cur)} /></Card>
            <Card><h2 className="mb-2 text-sm font-semibold">Resultados por dia</h2><LineChart data={ov.daily.map((d) => ({ date: d.date, value: d.results }))} label="Resultados por dia" format={(v) => int(v)} color="#7557D9" /></Card>
            <Card>
              <h2 className="mb-2 text-sm font-semibold">Precisa de atenção</h2>
              {ov.attention.length === 0 ? <p className="text-sm text-muted">Nada a sinalizar com base nos dados sincronizados.</p> : (
                <ul className="divide-y divide-line">
                  {ov.attention.map((a, i) => (
                    <li key={i} className="flex gap-2 py-2">
                      <span className={`mt-1.5 h-2 w-2 flex-none rounded-full ${a.tone === "danger" ? "bg-danger" : "bg-warn"}`} aria-hidden />
                      <div className="text-sm">{a.href ? <Link className="font-medium hover:underline" href={a.href}>{a.title}</Link> : <b>{a.title}</b>}<p className="text-xs text-muted">{a.detail}</p></div>
                    </li>
                  ))}
                </ul>
              )}
            </Card>
          </div>
          <Card className="overflow-x-auto p-0">
            <div className="flex items-center justify-between px-5 pt-4"><h2 className="text-sm font-semibold">Campanhas com maior gasto</h2><Link className="text-sm text-brand underline" href={`/app/campanhas?${q}`}>Ver todas</Link></div>
            <table className="mt-2 w-full text-sm">
              <thead><tr><Th>Campanha</Th><Th>Status</Th><Th right>Gasto</Th><Th right>Resultados</Th><Th right>Custo/result.</Th><Th right>ROAS</Th></tr></thead>
              <tbody>
                {[...ov.campaigns].sort((a, b) => (b.totals.spend ?? -1) - (a.totals.spend ?? -1)).slice(0, 5).map((c) => {
                  const s = statusInfo(c.effectiveStatus);
                  return (
                    <tr key={c.id}>
                      <Td className="font-medium"><Link className="hover:underline" href={`/app/campanhas/${c.id}?${q}`}>{c.name}</Link></Td>
                      <Td><Badge tone={s.tone}>{s.label}</Badge></Td>
                      <Td right>{brl(c.totals.spend, c.currency)}</Td><Td right>{int(c.totals.results)}</Td><Td right>{brl(c.totals.costPerResult, c.currency)}</Td><Td right>{ratio(c.totals.roas)}</Td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="px-5 pb-4 pt-2 text-xs text-muted">“—” significa que a Meta não informou o dado. Gasto e orçamento são os valores informados pela Meta; fórmulas em Integrações › Metodologia.</p>
          </Card>
        </>
      )}
    </>
  );
}
