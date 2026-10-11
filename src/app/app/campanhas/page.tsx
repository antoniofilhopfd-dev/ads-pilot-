import Link from "next/link";
import { DemoBanner } from "@/components/data-status";
import { FilterBar } from "@/components/filters";
import { Badge, Card, EmptyState, PageHeader, Td, btnCls, inputCls } from "@/components/ui";
import { objectiveLabel, statusInfo } from "@/lib/labels";
import { brl, int, pct, ratio } from "@/lib/metrics";
import { getConnection } from "@/server/meta/connection";
import { listCampaigns } from "@/server/insights";
import { filterOptions, one, parseFilters, type SP } from "@/server/params";
import { requireActor } from "@/server/session";

export const metadata = { title: "Campanhas — AdsPilot" };

const COLS: { key: string; label: string; right?: boolean }[] = [
  { key: "name", label: "Campanha" }, { key: "status", label: "Status" }, { key: "spend", label: "Gasto", right: true },
  { key: "results", label: "Resultados", right: true }, { key: "costPerResult", label: "Custo/result.", right: true }, { key: "ctr", label: "CTR", right: true },
];

export default async function Campanhas({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor } = await requireActor();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const sort = one(sp.ordem) ?? "spend";
  const dir = one(sp.dir) === "asc" ? "asc" : "desc";
  const [res, options, conn] = await Promise.all([
    listCampaigns(actor, { ...f, q: one(sp.q), status: one(sp.status), objective: one(sp.objetivo), sort, dir, page: Number(one(sp.pagina) ?? 1) }),
    filterOptions(actor), getConnection(actor),
  ]);
  const base = { ...(f.clientId ? { cliente: f.clientId } : {}), ...(f.accountId ? { conta: f.accountId } : {}), dias: f.dias, ...(one(sp.q) ? { q: one(sp.q)! } : {}), ...(one(sp.status) ? { status: one(sp.status)! } : {}), ...(one(sp.objetivo) ? { objetivo: one(sp.objetivo)! } : {}) };
  const link = (extra: Record<string, string>) => `/app/campanhas?${new URLSearchParams({ ...base, ordem: sort, dir, ...extra }).toString()}`;
  const ctxQuery = new URLSearchParams({ ...(f.clientId ? { cliente: f.clientId } : {}), ...(f.accountId ? { conta: f.accountId } : {}), dias: f.dias }).toString();

  return (
    <>
      <PageHeader title="Campanhas" subtitle={`${res.total} campanha(s) · período de ${f.dias} dias · somente leitura`} />
      {conn?.mode === "demo" && <DemoBanner />}
      <FilterBar action="/app/campanhas" options={options} current={{ cliente: f.clientId, conta: f.accountId, dias: f.dias }} extra={
        <>
          <label className="text-xs text-muted">Buscar<input name="q" defaultValue={one(sp.q) ?? ""} placeholder="Nome da campanha" className={`${inputCls} mt-1 block !w-48`} /></label>
          <label className="text-xs text-muted">Status
            <select name="status" defaultValue={one(sp.status) ?? ""} className={`${inputCls} mt-1 block !w-auto`}><option value="">Todos</option>{res.statuses.map((s) => <option key={s} value={s}>{statusInfo(s).label}</option>)}</select>
          </label>
          <label className="text-xs text-muted">Objetivo
            <select name="objetivo" defaultValue={one(sp.objetivo) ?? ""} className={`${inputCls} mt-1 block !w-auto`}><option value="">Todos</option>{res.objectives.map((o) => <option key={o} value={o}>{objectiveLabel(o)}</option>)}</select>
          </label>
        </>
      } />
      {res.total === 0 ? (
        <EmptyState title="Nenhuma campanha encontrada" action={<Link href="/app/integracoes" className={btnCls.secondary}>Ver Integrações</Link>}>Ajuste os filtros, ou sincronize as contas selecionadas em Integrações.</EmptyState>
      ) : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>{COLS.map((c) => (
                <th key={c.key} scope="col" aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`border-b border-line px-3 py-2 text-xs font-medium text-muted ${c.right ? "text-right" : "text-left"}`}>
                  <Link className="hover:text-ink" href={link({ ordem: c.key, dir: sort === c.key && dir === "desc" ? "asc" : "desc" })}>{c.label}{sort === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}</Link>
                </th>))}
                <th className="border-b border-line px-3 py-2 text-left text-xs font-medium text-muted">Objetivo</th>
                <th className="border-b border-line px-3 py-2 text-right text-xs font-medium text-muted">ROAS</th>
              </tr>
            </thead>
            <tbody>
              {res.rows.map((c) => {
                const s = statusInfo(c.effectiveStatus);
                return (
                  <tr key={c.id}>
                    <Td><Link className="font-medium hover:underline" href={`/app/campanhas/${c.id}?${ctxQuery}`}>{c.name}</Link><p className="text-xs text-muted">{c.accountName}</p></Td>
                    <Td><Badge tone={s.tone}>{s.label}</Badge></Td>
                    <Td right>{brl(c.totals.spend, c.currency)}</Td><Td right>{int(c.totals.results)}</Td><Td right>{brl(c.totals.costPerResult, c.currency)}</Td><Td right>{pct(c.totals.ctr)}</Td>
                    <Td>{objectiveLabel(c.objective)}</Td><Td right>{ratio(c.totals.roas)}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
            <span>Página {res.page} de {res.pages} · “—” = a Meta não informou o dado</span>
            <span className="flex gap-2">
              {res.page > 1 && <Link className={btnCls.secondary} href={link({ pagina: String(res.page - 1) })}>Anterior</Link>}
              {res.page < res.pages && <Link className={btnCls.secondary} href={link({ pagina: String(res.page + 1) })}>Próxima</Link>}
            </span>
          </div>
        </Card>
      )}
    </>
  );
}
