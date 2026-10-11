import Link from "next/link";
import { ConfirmButton } from "@/components/confirm-button";
import { Form } from "@/components/form";
import { Card, EmptyState, PageHeader, btnCls, inputCls } from "@/components/ui";
import { canActor } from "@/server/context";
import { listUtmLinks, listUtmTemplates } from "@/server/library";
import { filterOptions, one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { createUtmAction, deleteUtmTemplateAction, saveUtmTemplateAction } from "../../actions";

export const metadata = { title: "Construtor de UTMs — AdsPilot" };

export default async function Utm({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor } = await requireActor();
  const [templates, links, opts] = await Promise.all([listUtmTemplates(actor), listUtmLinks(actor, 50), filterOptions(actor)]);
  const write = canActor(actor, "library.write");
  const t = templates.find((x) => x.id === one(sp.modelo));
  return (
    <>
      <PageHeader title="Construtor de UTMs" subtitle="Gere links padronizados (minúsculas, sem acentos/espaços), sem duplicar parâmetros. Variáveis nos modelos: {campanha} {cliente} {data} {criativo}."
        action={<a className={btnCls.secondary} href="/api/utm/exportar">Exportar histórico (CSV)</a>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {write && (
            <Card>
              <h2 className="mb-1 text-sm font-semibold">Gerar link</h2>
              <p className="mb-3 text-xs text-muted">Modelos: {templates.length === 0 ? "nenhum" : templates.map((m) => <Link key={m.id} href={`/app/utm?modelo=${m.id}`} className="mr-2 text-brand hover:underline">{m.name}</Link>)}</p>
              <Form key={t?.id ?? "n"} action={createUtmAction} submit="Gerar e salvar no histórico">
                <label className="block text-sm font-medium">URL de destino<input name="url" required placeholder="https://seusite.com/oferta" className={`${inputCls} mt-1`} /></label>
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block text-sm font-medium">Campanha (valor de {"{campanha}"})<input name="campanha" required className={`${inputCls} mt-1`} /></label>
                  <label className="block text-sm font-medium">Criativo ({"{criativo}"})<input name="criativo" className={`${inputCls} mt-1`} /></label>
                  <label className="block text-sm font-medium">utm_source<input name="source" required defaultValue={t?.source ?? "meta"} className={`${inputCls} mt-1`} /></label>
                  <label className="block text-sm font-medium">utm_medium<input name="medium" required defaultValue={t?.medium ?? "paid_social"} className={`${inputCls} mt-1`} /></label>
                  <label className="block text-sm font-medium">utm_campaign<input name="utmcampaign" defaultValue={t?.campaignPattern ?? "{campanha}"} className={`${inputCls} mt-1`} /></label>
                  <label className="block text-sm font-medium">utm_content<input name="content" defaultValue={t?.contentPattern ?? ""} className={`${inputCls} mt-1`} /></label>
                  <label className="block text-sm font-medium">utm_term<input name="term" defaultValue={t?.termPattern ?? ""} className={`${inputCls} mt-1`} /></label>
                  <label className="block text-sm font-medium">Cliente<select name="cliente" className={`${inputCls} mt-1`}><option value="">Nenhum</option>{opts.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                </div>
              </Form>
            </Card>)}
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Histórico</h2>
            {links.length === 0 ? <EmptyState title="Nenhum link gerado" /> : <ul className="space-y-2 text-sm">{links.map((l) => <li key={l.id} className="break-all border-b border-line pb-2"><span className="text-xs text-muted">{l.createdAt.toLocaleString("pt-BR")}</span><br />{l.finalUrl}</li>)}</ul>}
          </Card>
        </div>
        {write && (
          <Card className="h-fit">
            <h2 className="mb-3 text-sm font-semibold">Modelos</h2>
            <ul className="mb-3 space-y-1 text-sm">{templates.map((m) => <li key={m.id} className="flex items-center justify-between"><span>{m.name}</span><form action={deleteUtmTemplateAction}><input type="hidden" name="templateId" value={m.id} /><ConfirmButton message={`Excluir o modelo “${m.name}”?`} className={btnCls.danger}>Excluir</ConfirmButton></form></li>)}</ul>
            <Form action={saveUtmTemplateAction} submit="Salvar modelo" variant="secondary">
              <label className="block text-sm font-medium">Nome<input name="name" required className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">utm_source<input name="source" required defaultValue="meta" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">utm_medium<input name="medium" required defaultValue="paid_social" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Padrão de utm_campaign<input name="campaignPattern" required defaultValue="{cliente}_{campanha}_{data}" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Padrão de utm_content<input name="contentPattern" defaultValue="{criativo}" className={`${inputCls} mt-1`} /></label>
            </Form>
          </Card>)}
      </div>
    </>
  );
}
