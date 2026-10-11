import { inputCls } from "./ui";

export type FilterOptions = { clients: { id: string; name: string }[]; accounts: { id: string; name: string }[] };

// Filtros via GET: o contexto fica na URL (compartilhável e preservado entre telas).
export function FilterBar({ action, options, current, extra }: { action: string; options: FilterOptions; current: { cliente?: string; conta?: string; dias?: string }; extra?: React.ReactNode }) {
  const sel = "!w-auto min-w-36";
  return (
    <form action={action} method="get" className="mb-4 flex flex-wrap items-end gap-3">
      <label className="text-xs text-muted">Cliente
        <select name="cliente" defaultValue={current.cliente ?? ""} className={`${inputCls} ${sel} mt-1 block`}>
          <option value="">Todos</option>
          {options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">Conta
        <select name="conta" defaultValue={current.conta ?? ""} className={`${inputCls} ${sel} mt-1 block`}>
          <option value="">Todas</option>
          {options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">Período
        <select name="dias" defaultValue={current.dias ?? "30"} className={`${inputCls} ${sel} mt-1 block`}>
          <option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option>
        </select>
      </label>
      {extra}
      <button className="rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-brand hover:bg-canvas">Aplicar</button>
    </form>
  );
}
