import Link from "next/link";
import { DemoBanner } from "@/components/data-status";
import { FilterBar } from "@/components/filters";
import { Badge, Card, EmptyState, PageHeader, Td, btnCls, inputCls } from "@/components/ui";
import { objectiveLabel, statusInfo } from "@/lib/labels";
import { brl, int, pct, ratio } from "@/lib/metrics";
import { getConnection } from "@/server/meta/connection";
import { listCampaigns, type CampaignRow } from "@/server/insights";
import { filterOptions, parseFilters, one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { canActor } from "@/server/context";
import { prepareBatchAction } from "../../actions";

export const metadata = { title: "Campanhas — AdsPilot" };

type Col = { key: string; label: string; right?: boolean; sortable?: boolean; cell: (c: CampaignRow) => React.ReactNode };
const OPTIONAL: Col[] = [
  { key: "status", label: "Status", sortable: true, cell: (c) => { const s = statusInfo(c.effectiveStatus); return <Badge tone={s.tone}>{s.label}</Badge>; } },
  { key: "objective", label: "Objetivo", cell: (c) => objectiveLabel(c.objective) },
  { key: "spend", label: "Gasto", right: true, sortable: true, cell: (c) => brl(c.totals.spend, c.currency) },
  { key: "results", label: "Resultados", right: true, sortable: true, cell: (c) => int(c.totals.results) },
  { key: "costPerResult", label: "Custo/result.", right: true, sortable: true, cell: (c) => brl(c.totals.costPerResult, c.currency) },
  { key: "ctr", label: "CTR", right: true, sortable: true, cell: (c) => pct(c.totals.ctr) },
  { key: "roas", label: "ROAS", right: true, cell: (c) => ratio(c.totals.roas) },
];
const DEFAULT_COLS = OPTIONAL.map((c) => c.key);

export default async function Campanhas({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor } = await requireActor();
  const sp = await searchParams;
  const f = parseFilters(sp);
  const sort = one(sp.ordem) ?? "spend";
  const dir = one(sp.dir) === "asc" ? "asc" : "desc";
  const rawCols = ([] as string[]).concat(sp.colunas ?? []).flatMap((x) => x.split(","));
  const chosen = rawCols.length ? OPTIONAL.filter((c) => rawCols.includes(c.key)) : OPTIONAL;
  const colsParam = (rawCols.length ? chosen.map((c) => c.key) : DEFAULT_COLS).join(",");
  const [res, options, conn] = await Promise.all([
    listCampaigns(actor, { ...f, q: one(sp.q), status: one(sp.status), objective: one(sp.objetivo), sort, dir, page: Number(one(sp.pagina) ?? 1) }),
    filterOptions(actor), getConnection(actor),
  ]);
  const base = { colunas: colsParam, ...(f.clientId ? { cliente: f.clientId } : {}), ...(f.accountId ? { conta: f.accountId } : {}), dias: f.dias, ...(one(sp.q) ? { q: one(sp.q)! } : {}), ...(one(sp.status) ? { status: one(sp.status)! } : {}), ...(one(sp.objetivo) ? { objetivo: one(sp.objetivo)! } : {}) };
  const link = (extra: Record<string, string>) => `/app/campanhas?${new URLSearchParams({ ...base, ordem: sort, dir, ...extra }).toString()}`;
  const canWrite = canActor(actor, "campaigns.write");
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
          <details className="relative text-xs text-muted">
            <summary className="cursor-pointer rounded-md border border-line bg-surface px-3 py-2 text-sm text-brand">Colunas</summary>
            <fieldset className="absolute z-10 mt-1 w-44 rounded-md border border-line bg-surface p-3 text-sm text-ink shadow-sm">
              <legend className="sr-only">Colunas visíveis</legend>
              {OPTIONAL.map((c) => <label key={c.key} className="flex items-center gap-2 py-0.5"><input type="checkbox" name="colunas" value={c.key} defaultChecked={chosen.some((x) => x.key === c.key)} />{c.label}</label>)}
            </fieldset>
          </details>
        </>
      } />
      {res.total === 0 ? (
        <EmptyState title="Nenhuma campanha encontrada" action={<Link href="/app/integracoes" className={btnCls.secondary}>Ver Integrações</Link>}>Ajuste os filtros, ou sincronize as contas selecionadas em Integrações.</EmptyState>
      ) : (
        <form action={prepareBatchAction}>
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead>
              <tr>
                {canWrite && <th scope="col" className="w-8 border-b border-line px-3 py-2"><span className="sr-only">Selecionar</span></th>}
                <th scope="col" aria-sort={sort === "name" ? (dir === "asc" ? "ascending" : "descending") : "none"} className="border-b border-line px-3 py-2 text-left text-xs font-medium text-muted"><Link className="hover:text-ink" href={link({ ordem: "name", dir: sort === "name" && dir === "desc" ? "asc" : "desc" })}>Campanha{sort === "name" ? (dir === "asc" ? " ▲" : " ▼") : ""}</Link></th>
                {chosen.map((c) => (
                  <th key={c.key} scope="col" aria-sort={sort === c.key ? (dir === "asc" ? "ascending" : "descending") : "none"} className={`border-b border-line px-3 py-2 text-xs font-medium text-muted ${c.right ? "text-right" : "text-left"}`}>
                    {c.sortable ? <Link className="hover:text-ink" href={link({ ordem: c.key, dir: sort === c.key && dir === "desc" ? "asc" : "desc" })}>{c.label}{sort === c.key ? (dir === "asc" ? " ▲" : " ▼") : ""}</Link> : c.label}
                  </th>))}
              </tr>
            </thead>
            <tbody>
              {res.rows.map((c) => (
                <tr key={c.id}>
                  {canWrite && <Td><input type="checkbox" name="ids" value={c.id} aria-label={`Selecionar ${c.name}`} /></Td>}
                  <Td><Link className="font-medium hover:underline" href={`/app/campanhas/${c.id}?${ctxQuery}`}>{c.name}</Link><p className="text-xs text-muted">{c.accountName}</p></Td>
                  {chosen.map((col) => <Td key={col.key} right={col.right}>{col.cell(c)}</Td>)}
                </tr>
              ))}
            </tbody>
          </table>
          {canWrite && (
            <div className="flex flex-wrap items-center gap-2 border-t border-line px-4 py-3 text-sm">
              <span className="text-muted">Selecionadas:</span>
              <button name="type" value="pause" className={btnCls.secondary}>Preparar pausa</button>
              <button name="type" value="activate" className={btnCls.secondary}>Preparar reativação</button>
              <span className="text-xs text-muted">Só prepara: cada campanha precisa ser confirmada em Operações.</span>
            </div>)}
          <div className="flex items-center justify-between px-4 py-3 text-sm text-muted">
            <span>Página {res.page} de {res.pages} · “—” = a Meta não informou o dado</span>
            <span className="flex gap-2">
              {res.page > 1 && <Link className={btnCls.secondary} href={link({ pagina: String(res.page - 1) })}>Anterior</Link>}
              {res.page < res.pages && <Link className={btnCls.secondary} href={link({ pagina: String(res.page + 1) })}>Próxima</Link>}
            </span>
          </div>
        </Card>
        </form>
      )}
    </>
  );
}
