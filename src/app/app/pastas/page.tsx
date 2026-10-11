import { ConfirmButton } from "@/components/confirm-button";
import { Form } from "@/components/form";
import { Card, PageHeader, btnCls, inputCls } from "@/components/ui";
import { FOLDER_KINDS } from "@/db/schema";
import { canActor } from "@/server/context";
import { listFolders, listLabels } from "@/server/library";
import { requireActor } from "@/server/session";
import { createFolderAction, createLabelAction, deleteFolderAction, deleteLabelAction } from "../../actions";

export const metadata = { title: "Pastas e etiquetas — AdsPilot" };
const KIND: Record<string, string> = { creative: "Criativos", audience: "Públicos", draft: "Rascunhos", campaign: "Campanhas", experiment: "Experimentos" };

export default async function Pastas() {
  const { actor } = await requireActor();
  const [labels, ...folders] = await Promise.all([listLabels(actor), ...FOLDER_KINDS.map((k) => listFolders(actor, k))]);
  const write = canActor(actor, "library.write");
  return (
    <>
      <PageHeader title="Pastas e etiquetas" subtitle="Organização interna do AdsPilot. Pastas e etiquetas não existem na Meta e não alteram nada nela." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Etiquetas</h2>
          <ul className="mb-3 flex flex-wrap gap-2">{labels.length === 0 && <li className="text-sm text-muted">Nenhuma etiqueta.</li>}{labels.map((l) => (
            <li key={l.id} className="flex items-center gap-1 rounded-full bg-[#ece8fb] px-3 py-1 text-sm text-violet">{l.name}
              {write && <form action={deleteLabelAction}><input type="hidden" name="labelId" value={l.id} /><ConfirmButton message={`Excluir a etiqueta “${l.name}”?`} className="ml-1 text-xs text-danger" ariaLabel={`Excluir etiqueta ${l.name}`}>✕</ConfirmButton></form>}</li>))}</ul>
          {write && <Form action={createLabelAction} submit="Criar etiqueta" className="flex items-end gap-2"><label className="text-sm font-medium">Nome<input name="name" required maxLength={40} className={`${inputCls} mt-1`} /></label></Form>}
        </Card>
        {FOLDER_KINDS.map((k, i) => (
          <Card key={k}>
            <h2 className="mb-3 text-sm font-semibold">Pastas de {KIND[k].toLowerCase()}</h2>
            <ul className="mb-3 space-y-1 text-sm">{folders[i].length === 0 && <li className="text-muted">Nenhuma pasta.</li>}{folders[i].map((f) => (
              <li key={f.id} className="flex items-center justify-between"><span>📁 {f.name}</span>
                {write && <form action={deleteFolderAction}><input type="hidden" name="folderId" value={f.id} /><ConfirmButton message={`Excluir a pasta “${f.name}”? Os itens ficam sem pasta.`} className={btnCls.danger}>Excluir</ConfirmButton></form>}</li>))}</ul>
            {write && <Form action={createFolderAction} submit="Criar pasta" className="flex items-end gap-2"><input type="hidden" name="tipo" value={k} /><label className="text-sm font-medium">Nome<input name="name" required maxLength={80} className={`${inputCls} mt-1`} /></label></Form>}
          </Card>))}
      </div>
    </>
  );
}
