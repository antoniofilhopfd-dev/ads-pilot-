import { setLabelsAction } from "@/app/actions";
import { btnCls } from "@/components/ui";

// Seleção de etiquetas de um item (formulário simples, funciona sem JS).
export function LabelEditor({ entity, entityId, all, current }: { entity: string; entityId: string; all: { id: string; name: string }[]; current: { id: string; name: string }[] }) {
  if (all.length === 0) return null;
  const on = new Set(current.map((c) => c.id));
  return (
    <details className="text-xs">
      <summary className="cursor-pointer text-brand">Etiquetas{current.length ? ` (${current.map((c) => c.name).join(", ")})` : ""}</summary>
      <form action={setLabelsAction} className="mt-1 flex flex-wrap items-center gap-2">
        <input type="hidden" name="entidade" value={entity} /><input type="hidden" name="entityId" value={entityId} />
        {all.map((l) => <label key={l.id} className="flex items-center gap-1"><input type="checkbox" name="labels" value={l.id} defaultChecked={on.has(l.id)} />{l.name}</label>)}
        <button className={btnCls.secondary}>Aplicar</button>
      </form>
    </details>
  );
}
