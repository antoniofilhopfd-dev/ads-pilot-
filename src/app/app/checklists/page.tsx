import { Badge, Card, EmptyState, PageHeader, btnCls, inputCls } from "@/components/ui";
import { db } from "@/db";
import { adAccounts, campaignDrafts, campaigns } from "@/db/schema";
import { and, eq } from "drizzle-orm";
import { CHECKLISTS } from "@/lib/checklists";
import { accountCond, canActor } from "@/server/context";
import { getChecklist } from "@/server/library";
import { one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { checklistItemAction } from "../../actions";

export const metadata = { title: "Checklists — AdsPilot" };

export default async function Checklists({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor } = await requireActor();
  const write = canActor(actor, "library.write");
  const key = one(sp.lista) ?? CHECKLISTS[0].key;
  const tpl = CHECKLISTS.find((c) => c.key === key) ?? CHECKLISTS[0];
  const targets = tpl.target === "account" ? await db.select({ id: adAccounts.id, name: adAccounts.name }).from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id)))
    : tpl.target === "campaign" ? await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(and(eq(campaigns.organizationId, actor.organizationId), accountCond(actor, campaigns.adAccountId))).limit(200)
    : await db.select({ id: campaignDrafts.id, name: campaignDrafts.name }).from(campaignDrafts).where(eq(campaignDrafts.organizationId, actor.organizationId)).limit(200);
  const alvo = targets.find((t) => t.id === one(sp.alvo)) ?? targets[0];
  const run = alvo ? await getChecklist(actor, tpl.key, tpl.target, alvo.id) : null;
  const done = run?.items.filter((i) => i.done).length ?? 0;
  return (
    <>
      <PageHeader title="Checklists" subtitle="Listas de conferência por rascunho, campanha ou conta. O estado é salvo por item, com quem marcou e quando." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">Lista<select name="lista" defaultValue={tpl.key} className={`${inputCls} mt-1`}>{CHECKLISTS.map((c) => <option key={c.key} value={c.key}>{c.title}</option>)}</select></label>
        <label className="text-sm font-medium">Alvo ({{ draft: "rascunho", campaign: "campanha", account: "conta", client: "cliente" }[tpl.target]})<select name="alvo" defaultValue={alvo?.id} className={`${inputCls} mt-1`}>{targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label>
        <button className={btnCls.secondary}>Abrir</button>
      </form>
      {!alvo || !run ? <EmptyState title="Nenhum alvo disponível">Crie um rascunho, ou sincronize campanhas/contas, para usar esta lista.</EmptyState> : (
        <Card className="max-w-2xl">
          <div className="mb-3 flex items-center justify-between"><h2 className="font-semibold">{tpl.title} — {alvo.name}</h2><Badge tone={run.completedAt ? "ok" : "warn"}>{done}/{run.items.length}{run.completedAt ? " · concluído" : ""}</Badge></div>
          <ul className="space-y-2">{run.items.map((i) => (
            <li key={i.id}>
              <form action={checklistItemAction} className="flex items-start gap-2 text-sm">
                <input type="hidden" name="chave" value={tpl.key} /><input type="hidden" name="tipo" value={tpl.target} /><input type="hidden" name="alvo" value={alvo.id} /><input type="hidden" name="item" value={i.id} /><input type="hidden" name="feito" value={i.done ? "0" : "1"} />
                <button disabled={!write} aria-pressed={i.done} aria-label={`${i.done ? "Desmarcar" : "Marcar"}: ${i.text}`} className={`mt-0.5 h-5 w-5 shrink-0 rounded border text-xs ${i.done ? "border-ok bg-ok text-white" : "border-line bg-surface"}`}>{i.done ? "✓" : ""}</button>
                <span className={i.done ? "text-muted line-through" : ""}>{i.text}{i.at && <span className="block text-xs text-muted">marcado em {new Date(i.at).toLocaleString("pt-BR")}</span>}</span>
              </form>
            </li>))}</ul>
        </Card>)}
    </>
  );
}
