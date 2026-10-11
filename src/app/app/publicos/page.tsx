import Link from "next/link";
import { Form } from "@/components/form";
import { LabelEditor } from "@/components/label-editor";
import { LabelChips } from "@/components/label-chips";
import { Badge, Card, EmptyState, PageHeader, inputCls } from "@/components/ui";
import { canActor } from "@/server/context";
import { AUDIENCE_PRESETS, labelsFor, listAudiences, listFolders, listLabels, validateAudience } from "@/server/library";
import { filterOptions, one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { archiveAudienceAction, saveAudienceAction } from "../../actions";
import { OBJECTIVES } from "@/lib/draft";

export const metadata = { title: "Públicos — AdsPilot" };

export default async function Publicos({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor } = await requireActor();
  const [list, folders, labels, opts] = await Promise.all([listAudiences(actor, { includeArchived: one(sp.arquivados) === "1" }), listFolders(actor, "audience"), listLabels(actor), filterOptions(actor)]);
  const lab = await labelsFor(actor, "audience", list.map((a) => a.id));
  const write = canActor(actor, "library.write");
  const presetKey = one(sp.modelo); const preset = presetKey ? AUDIENCE_PRESETS[presetKey] : undefined;
  const pc = (preset?.config ?? {}) as Record<string, string | number>;
  return (
    <>
      <PageHeader title="Públicos" subtitle="Biblioteca de públicos com versões. É configuração LOCAL: a criação do público na Meta só acontece na etapa de integração." />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          <p className="text-sm"><Link className="text-brand hover:underline" href={one(sp.arquivados) === "1" ? "/app/publicos" : "/app/publicos?arquivados=1"}>{one(sp.arquivados) === "1" ? "Ocultar arquivados" : "Mostrar arquivados"}</Link></p>
          {list.length === 0 ? <EmptyState title="Nenhum público salvo">{write ? "Crie um do zero ou use um modelo por objetivo." : ""}</EmptyState> : list.map((a) => {
            const c = a.config as Record<string, string | number>; const warns = validateAudience(a.config);
            return (
              <Card key={a.id}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div><h2 className="font-semibold"><Link href={`/app/publicos/${a.id}`} className="text-brand hover:underline">{a.name}</Link> <span className="text-xs font-normal text-muted">v{a.version}</span></h2>
                    <p className="text-xs text-muted">{a.objective ? OBJECTIVES[a.objective as keyof typeof OBJECTIVES] ?? a.objective : "Sem objetivo"} · {c.locations || "—"} · {c.ageMin}–{c.ageMax} anos</p></div>
                  {a.archived && <Badge>Arquivado</Badge>}
                </div>
                <p className="mt-2 text-sm text-muted">Estimativa de alcance: {a.reachEstimate ? `${new Intl.NumberFormat("pt-BR").format(a.reachEstimate.value)} (${a.reachEstimate.source}, ${a.reachEstimate.date})` : "não informada"}</p>
                {warns.length > 0 && <ul className="mt-1 list-disc pl-5 text-xs text-[#7a5200]">{warns.map((w) => <li key={w}>{w}</li>)}</ul>}
                <div className="mt-2 flex flex-wrap items-center gap-3"><LabelChips items={lab.get(a.id) ?? []} />{write && <LabelEditor entity="audience" entityId={a.id} all={labels} current={lab.get(a.id) ?? []} />}
                  {write && <form action={archiveAudienceAction}><input type="hidden" name="audienceId" value={a.id} /><input type="hidden" name="arquivar" value={a.archived ? "0" : "1"} /><button className="text-xs text-brand hover:underline">{a.archived ? "Restaurar" : "Arquivar"}</button></form>}</div>
              </Card>);
          })}
        </div>
        {write && (
          <Card className="h-fit">
            <h2 className="mb-2 text-sm font-semibold">Novo público</h2>
            <p className="mb-3 text-xs text-muted">Modelos: {Object.entries(AUDIENCE_PRESETS).map(([k, p]) => <Link key={k} href={`/app/publicos?modelo=${k}`} className="mr-2 inline-block text-brand hover:underline">{p.label.split(" — ")[0]}</Link>)}</p>
            <Form key={presetKey ?? "novo"} action={saveAudienceAction} submit="Salvar público">
              <label className="block text-sm font-medium">Nome<input name="name" required maxLength={120} defaultValue={preset?.label ?? ""} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Objetivo<select name="objetivo" defaultValue={preset?.objective ?? ""} className={`${inputCls} mt-1`}><option value="">—</option>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block text-sm font-medium">Cliente<select name="cliente" className={`${inputCls} mt-1`}><option value="">Nenhum (da organização)</option>{opts.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              {folders.length > 0 && <label className="block text-sm font-medium">Pasta<select name="pasta" className={`${inputCls} mt-1`}><option value="">Sem pasta</option>{folders.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}</select></label>}
              <label className="block text-sm font-medium">Localização<input name="locais" required defaultValue={String(pc.locations ?? "")} className={`${inputCls} mt-1`} /></label>
              <div className="grid grid-cols-2 gap-2"><label className="block text-sm font-medium">Idade mín.<input name="idade_min" type="number" min={13} max={65} defaultValue={Number(pc.ageMin ?? 18)} className={`${inputCls} mt-1`} /></label><label className="block text-sm font-medium">Idade máx.<input name="idade_max" type="number" min={13} max={65} defaultValue={Number(pc.ageMax ?? 65)} className={`${inputCls} mt-1`} /></label></div>
              <label className="block text-sm font-medium">Interesses<input name="interesses" defaultValue={String(pc.interests ?? "")} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Exclusões<input name="exclusoes" defaultValue={String(pc.exclusions ?? "")} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Estimativa de alcance (opcional)<input name="alcance" inputMode="numeric" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Fonte da estimativa<input name="fonte_alcance" placeholder="ex.: Gerenciador de Anúncios, 10/03" className={`${inputCls} mt-1`} /></label>
            </Form>
          </Card>)}
      </div>
      <p className="mt-4 text-xs text-muted">Estimativas de alcance são informadas por você com a fonte; o AdsPilot não as calcula.</p>
    </>
  );
}
