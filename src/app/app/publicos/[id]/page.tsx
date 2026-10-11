import Link from "next/link";
import { notFound } from "next/navigation";
import { Form } from "@/components/form";
import { Card, PageHeader, inputCls } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { canActor } from "@/server/context";
import { diffConfig, getAudience } from "@/server/library";
import { one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { saveAudienceAction } from "../../../actions";

export default async function PublicoDetalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params; const sp = await searchParams;
  const { actor } = await requireActor();
  let a;
  try { a = await getAudience(actor, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const write = canActor(actor, "library.write");
  const v1 = Number(one(sp.de)) || (a.versions[1]?.version ?? a.versions[0].version), v2 = Number(one(sp.para)) || a.versions[0].version;
  const x = a.versions.find((v) => v.version === v1), y = a.versions.find((v) => v.version === v2);
  const diff = x && y ? diffConfig(x.config, y.config) : [];
  const c = a.config as Record<string, string | number>;
  return (
    <>
      <PageHeader title={`${a.name} (v${a.version})`} subtitle="Histórico de versões e comparação." action={<Link href="/app/publicos" className="text-sm text-brand hover:underline">← Públicos</Link>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Comparar versões</h2>
            <form method="get" className="mb-3 flex flex-wrap items-end gap-2">
              <label className="text-sm">De<select name="de" defaultValue={v1} className={`${inputCls} mt-1`}>{a.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}</select></label>
              <label className="text-sm">Para<select name="para" defaultValue={v2} className={`${inputCls} mt-1`}>{a.versions.map((v) => <option key={v.version} value={v.version}>v{v.version}</option>)}</select></label>
              <button className="rounded-md border border-line px-3 py-2 text-sm text-brand">Comparar</button>
            </form>
            {diff.length === 0 ? <p className="text-sm text-muted">Sem diferenças entre v{v1} e v{v2}.</p> : (
              <table className="w-full text-sm"><thead><tr><th className="p-2 text-left text-xs text-muted">Campo</th><th className="p-2 text-left text-xs text-muted">v{v1}</th><th className="p-2 text-left text-xs text-muted">v{v2}</th></tr></thead>
                <tbody>{diff.map((d) => <tr key={d.field}><td className="border-t border-line p-2 font-medium">{d.field}</td><td className="border-t border-line p-2">{String(d.from ?? "—")}</td><td className="border-t border-line p-2">{String(d.to ?? "—")}</td></tr>)}</tbody></table>)}
          </Card>
          <Card>
            <h2 className="mb-2 text-sm font-semibold">Histórico</h2>
            <ul className="space-y-1 text-sm">{a.versions.map((v) => <li key={v.version}>v{v.version} · {v.createdAt.toLocaleString("pt-BR")} {v.note ? `— ${v.note}` : ""}</li>)}</ul>
          </Card>
        </div>
        {write && (
          <Card className="h-fit">
            <h2 className="mb-3 text-sm font-semibold">Salvar nova versão</h2>
            <Form action={saveAudienceAction} submit="Salvar nova versão">
              <input type="hidden" name="id" value={a.id} />
              <label className="block text-sm font-medium">Nome<input name="name" required defaultValue={a.name} className={`${inputCls} mt-1`} /></label>
              <input type="hidden" name="objetivo" value={a.objective ?? ""} /><input type="hidden" name="cliente" value={a.clientId ?? ""} /><input type="hidden" name="pasta" value={a.folderId ?? ""} />
              <label className="block text-sm font-medium">Localização<input name="locais" required defaultValue={String(c.locations ?? "")} className={`${inputCls} mt-1`} /></label>
              <div className="grid grid-cols-2 gap-2"><label className="block text-sm font-medium">Idade mín.<input name="idade_min" type="number" defaultValue={Number(c.ageMin)} className={`${inputCls} mt-1`} /></label><label className="block text-sm font-medium">Idade máx.<input name="idade_max" type="number" defaultValue={Number(c.ageMax)} className={`${inputCls} mt-1`} /></label></div>
              <label className="block text-sm font-medium">Interesses<input name="interesses" defaultValue={String(c.interests ?? "")} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Exclusões<input name="exclusoes" defaultValue={String(c.exclusions ?? "")} className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Motivo da mudança<input name="nota" maxLength={300} className={`${inputCls} mt-1`} /></label>
            </Form>
          </Card>)}
      </div>
    </>
  );
}
