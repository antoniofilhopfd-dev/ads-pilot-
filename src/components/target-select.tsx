import { inputCls } from "@/components/ui";

export type TargetOptions = { clients: { id: string; name: string }[]; accounts: { id: string; name: string }[]; campaigns: { id: string; name: string }[] };

export function TargetSelect({ opts, allowOrg = false }: { opts: TargetOptions; allowOrg?: boolean }) {
  return (
    <label className="block text-sm font-medium">Aplicar a
      <select name="alvo" required className={`${inputCls} mt-1`}>
        {allowOrg && <option value="org:">Organização inteira</option>}
        {opts.clients.length > 0 && <optgroup label="Clientes">{opts.clients.map((c) => <option key={c.id} value={`client:${c.id}`}>{c.name}</option>)}</optgroup>}
        {opts.accounts.length > 0 && <optgroup label="Contas">{opts.accounts.map((c) => <option key={c.id} value={`account:${c.id}`}>{c.name}</option>)}</optgroup>}
        {opts.campaigns.length > 0 && <optgroup label="Campanhas">{opts.campaigns.map((c) => <option key={c.id} value={`campaign:${c.id}`}>{c.name}</option>)}</optgroup>}
      </select>
    </label>
  );
}
