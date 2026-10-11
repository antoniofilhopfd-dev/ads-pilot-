import Link from "next/link";
import { Form } from "@/components/form";
import { LabelEditor } from "@/components/label-editor";
import { LabelChips } from "@/components/label-chips";
import { Badge, Card, EmptyState, PageHeader, inputCls } from "@/components/ui";
import { canActor } from "@/server/context";
import { creativeWarnings, getCreative, labelsFor, listCreatives, listFolders, listLabels } from "@/server/library";
import { filterOptions, one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { creativeStatusAction, linkCreativeAction, saveCreativeAction } from "../../actions";
import { db } from "@/db";
import { and, eq } from "drizzle-orm";
import { campaigns } from "@/db/schema";

export const metadata = { title: "Criativos — AdsPilot" };
const FORMAT = { image: "Imagem", video: "Vídeo (link)", text: "Somente texto" } as const;
const STATUS = { draft: "Rascunho", active: "Ativo", archived: "Arquivado" } as const;

/* eslint-disable @next/next/no-img-element */
export default async function Criativos({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor } = await requireActor();
  const [list, folders, labels, opts] = await Promise.all([
    listCreatives(actor, { q: one(sp.q), format: one(sp.formato), folderId: one(sp.pasta), status: one(sp.status) }), listFolders(actor, "creative"), listLabels(actor), filterOptions(actor)]);
  const lab = await labelsFor(actor, "creative", list.map((c) => c.id));
  const write = canActor(actor, "library.write");
  const detailId = one(sp.ver);
  const detail = detailId ? await getCreative(actor, detailId).catch(() => null) : null;
  const camps = detail && write ? await db.select({ id: campaigns.id, name: campaigns.name }).from(campaigns).where(and(eq(campaigns.organizationId, actor.organizationId))).orderBy(campaigns.name).limit(300) : [];
  return (
    <>
      <PageHeader title="Criativos" subtitle="Biblioteca local: imagens, textos, variações e histórico de uso. Nada aqui é enviado à Meta automaticamente." />
      <form method="get" className="mb-4 flex flex-wrap items-end gap-2">
        <label className="text-sm font-medium">Buscar<input name="q" defaultValue={one(sp.q) ?? ""} className={`${inputCls} mt-1`} placeholder="nome, título ou texto" /></label>
        <label className="text-sm font-medium">Formato<select name="formato" defaultValue={one(sp.formato) ?? ""} className={`${inputCls} mt-1`}><option value="">Todos</option>{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        <label className="text-sm font-medium">Status<select name="status" defaultValue={one(sp.status) ?? ""} className={`${inputCls} mt-1`}><option value="">Todos</option>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
        {folders.length > 0 && <label className="text-sm font-medium">Pasta<select name="pasta" defaultValue={one(sp.pasta) ?? ""} className={`${inputCls} mt-1`}><option value="">Todas</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
        <button className="rounded-md border border-line px-3 py-2 text-sm text-brand">Filtrar</button>
      </form>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          {list.length === 0 ? <EmptyState title="Nenhum criativo encontrado">{write ? "Adicione o primeiro ao lado." : ""}</EmptyState> : (
            <ul className="grid gap-3 sm:grid-cols-2">{list.map((c) => {
              const w = creativeWarnings({ format: c.format, primaryText: c.primaryText, headline: c.headline, url: c.url, hasImage: !!c.assetId, videoUrl: c.videoUrl });
              return (
                <li key={c.id}><Card className="h-full p-3">
                  <div className="mb-2 flex h-36 items-center justify-center overflow-hidden rounded-md bg-canvas">
                    {c.assetId ? <img src={`/api/criativos/${c.id}/imagem`} alt={`Prévia do criativo ${c.name}`} className="max-h-36 object-contain" /> : <span className="text-xs text-muted">{c.format === "video" ? "Vídeo (referência por link)" : c.format === "text" ? "Somente texto" : "Sem imagem"}</span>}
                  </div>
                  <div className="flex items-start justify-between gap-2"><Link href={`/app/criativos?ver=${c.id}`} className="font-medium text-brand hover:underline">{c.name}</Link><Badge tone={c.status === "active" ? "ok" : "neutral"}>{STATUS[c.status]}</Badge></div>
                  <p className="mt-1 line-clamp-2 text-xs text-muted">{c.headline ?? ""} {c.primaryText ?? ""}</p>
                  {w.length > 0 && <p className="mt-1 text-xs text-[#7a5200]">⚠ {w[0]}{w.length > 1 ? ` (+${w.length - 1})` : ""}</p>}
                  <div className="mt-2"><LabelChips items={lab.get(c.id) ?? []} /></div>
                </Card></li>);
            })}</ul>)}
          {detail && (
            <Card>
              <h2 className="font-semibold">{detail.name}</h2>
              <dl className="mt-2 grid gap-1 text-sm">
                <div><dt className="inline text-muted">Texto principal: </dt><dd className="inline">{detail.primaryText ?? "—"}</dd></div>
                <div><dt className="inline text-muted">Título: </dt><dd className="inline">{detail.headline ?? "—"}</dd></div>
                <div><dt className="inline text-muted">CTA: </dt><dd className="inline">{detail.cta ?? "—"}</dd></div>
                <div><dt className="inline text-muted">Destino: </dt><dd className="inline break-all">{detail.url ?? "—"}</dd></div>
                {detail.videoUrl && <div><dt className="inline text-muted">Vídeo: </dt><dd className="inline break-all">{detail.videoUrl}</dd></div>}
                <div><dt className="inline text-muted">Variações: </dt><dd className="inline">{detail.variants.primaryTexts.length} textos · {detail.variants.headlines.length} títulos · {detail.variants.descriptions.length} descrições</dd></div>
              </dl>
              <h3 className="mt-3 text-sm font-semibold">Histórico de uso</h3>
              {detail.links.length === 0 ? <p className="text-sm text-muted">Nenhum vínculo registrado.</p> : <ul className="text-sm">{detail.links.map((l) => <li key={l.id}>Campanha {l.campaignId?.slice(0, 8)} {l.usedFrom ? `desde ${l.usedFrom}` : ""} {l.note ? `— ${l.note}` : ""}</li>)}</ul>}
              {write && (
                <div className="mt-3 space-y-3">
                  <LabelEditor entity="creative" entityId={detail.id} all={labels} current={lab.get(detail.id) ?? []} />
                  <form action={creativeStatusAction} className="flex items-center gap-2"><input type="hidden" name="creativeId" value={detail.id} />
                    <select name="status" defaultValue={detail.status} aria-label="Status" className={inputCls + " w-auto"}>{Object.entries(STATUS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select><button className="rounded-md border border-line px-3 py-2 text-sm text-brand">Alterar status</button></form>
                  <Form action={linkCreativeAction} submit="Registrar uso em campanha" variant="secondary" className="space-y-2">
                    <input type="hidden" name="creativeId" value={detail.id} />
                    <label className="block text-sm font-medium">Campanha<select name="campanha" required className={`${inputCls} mt-1`}>{camps.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
                    <label className="block text-sm font-medium">Usado desde<input name="desde" type="date" className={`${inputCls} mt-1`} /></label>
                  </Form>
                </div>)}
            </Card>)}
        </div>
        {write && (
          <Card className="h-fit">
            <h2 className="mb-3 text-sm font-semibold">Novo criativo</h2>
            <Form action={saveCreativeAction} submit="Salvar criativo">
              <label className="block text-sm font-medium">Nome<input name="name" required maxLength={120} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Formato<select name="formato" className={`${inputCls} mt-1`}>{Object.entries(FORMAT).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <div><label htmlFor="img" className="mb-1 block text-sm font-medium">Imagem (PNG ou JPEG, até 1 MB)</label><input id="img" name="imagem" type="file" accept="image/png,image/jpeg" className="block w-full text-sm" /></div>
              <label className="block text-sm font-medium">URL do vídeo (se formato vídeo)<input name="video" className={`${inputCls} mt-1`} placeholder="https://" /></label>
              <label className="block text-sm font-medium">Texto principal<textarea name="texto" rows={3} maxLength={2200} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Título<input name="titulo" maxLength={120} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Descrição<input name="descricao" maxLength={200} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Botão (CTA)<input name="cta" maxLength={40} className={`${inputCls} mt-1`} placeholder="Saiba mais" /></label>
              <label className="block text-sm font-medium">URL de destino<input name="url" className={`${inputCls} mt-1`} placeholder="https://" /></label>
              <label className="block text-sm font-medium">Variações de título (uma por linha, até 5)<textarea name="v_titulos" rows={2} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Variações de texto (uma por linha, até 5)<textarea name="v_textos" rows={2} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Cliente<select name="cliente" className={`${inputCls} mt-1`}><option value="">Nenhum (da organização)</option>{opts.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              {folders.length > 0 && <label className="block text-sm font-medium">Pasta<select name="pasta" className={`${inputCls} mt-1`}><option value="">Sem pasta</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
            </Form>
          </Card>)}
      </div>
    </>
  );
}
