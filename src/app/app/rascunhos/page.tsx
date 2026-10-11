import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Card, EmptyState, PageHeader, btnCls } from "@/components/ui";
import { WIZARD_STEPS } from "@/lib/draft";
import { canActor } from "@/server/context";
import { labelsFor, listDrafts } from "@/server/library";
import { LabelChips } from "@/components/label-chips";
import { requireActor } from "@/server/session";
import { createDraftAction, deleteDraftAction } from "../../actions";

export const metadata = { title: "Rascunhos de campanha — AdsPilot" };

export default async function Rascunhos() {
  const { actor } = await requireActor();
  const list = await listDrafts(actor);
  const lab = await labelsFor(actor, "draft", list.map((d) => d.id));
  const write = canActor(actor, "library.write");
  return (
    <>
      <PageHeader title="Rascunhos de campanha" subtitle="Assistente em 10 etapas. Rascunhos ficam só no AdsPilot: nada é criado na Meta, e toda campanha nasce PAUSADA."
        action={write ? <form action={createDraftAction}><button className={btnCls.primary}>Novo rascunho</button></form> : undefined} />
      {list.length === 0 ? <EmptyState title="Nenhum rascunho">{write ? "Clique em “Novo rascunho” para começar." : ""}</EmptyState> : (
        <ul className="space-y-3">{list.map((d) => (
          <li key={d.id}><Card>
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div><Link href={`/app/rascunhos/${d.id}?etapa=${Math.min(d.step, 10)}`} className="font-semibold text-brand hover:underline">{d.name}</Link>
                <p className="text-xs text-muted">Etapa {d.step}/10 — {WIZARD_STEPS[Math.min(d.step, 10) - 1].title} · atualizado em {d.updatedAt.toLocaleString("pt-BR")}</p></div>
              <Badge tone={d.status === "ready" ? "ok" : "warn"}>{d.status === "ready" ? "Pronto para revisão final" : `${d.issues.length} pendência(s)`}</Badge>
            </div>
            <div className="mt-2 flex items-center gap-3"><LabelChips items={lab.get(d.id) ?? []} />
              {write && <form action={deleteDraftAction}><input type="hidden" name="draftId" value={d.id} /><ConfirmButton message="Excluir este rascunho?" className={btnCls.danger}>Excluir</ConfirmButton></form>}</div>
          </Card></li>))}</ul>)}
    </>
  );
}
