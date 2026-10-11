import Link from "next/link";
import { Form } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { Badge, Card, EmptyState, Field, PageHeader, Td, Th, btnCls, inputCls } from "@/components/ui";
import { filterOptions } from "@/server/params";
import { canActor } from "@/server/context";
import { listExports, listTemplates } from "@/server/reports/service";
import { DEFAULT_SECTIONS, REPORT_TYPES, SECTIONS, SECTION_LABEL, TYPE_LABEL, type ReportType } from "@/server/reports/types";
import { requireActor } from "@/server/session";
import { deleteTemplateAction, saveTemplateAction } from "../../actions";

export const metadata = { title: "Relatórios — AdsPilot" };

const qs = (c: { type?: string; days?: number; clientId?: string; accountId?: string; sections?: string[] }) => {
  const q = new URLSearchParams({ tipo: c.type ?? "executive", dias: String(c.days ?? 30), ...(c.clientId ? { cliente: c.clientId } : {}), ...(c.accountId ? { conta: c.accountId } : {}) });
  for (const s of c.sections ?? []) q.append("secoes", s);
  return q.toString();
};

export default async function Relatorios() {
  const { actor } = await requireActor();
  const [options, templates, exports] = await Promise.all([filterOptions(actor), listTemplates(actor), listExports(actor)]);
  const manage = canActor(actor, "reports.manage");
  return (
    <>
      <PageHeader title="Relatórios" subtitle="Monte um relatório, visualize no aplicativo e exporte em PDF, XLSX ou CSV." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Novo relatório</h2>
          <form action="/app/relatorios/ver" method="get" className="space-y-4">
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="text-sm font-medium">Tipo
                <select name="tipo" defaultValue="executive" className={`${inputCls} mt-1`}>{REPORT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
              <label className="text-sm font-medium">Período
                <select name="dias" defaultValue="30" className={`${inputCls} mt-1`}><option value="7">Últimos 7 dias</option><option value="30">Últimos 30 dias</option><option value="90">Últimos 90 dias</option></select></label>
              <label className="text-sm font-medium">Cliente
                <select name="cliente" className={`${inputCls} mt-1`}><option value="">Todos</option>{options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              <label className="text-sm font-medium">Conta
                <select name="conta" className={`${inputCls} mt-1`}><option value="">Todas</option>{options.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></label>
            </div>
            <fieldset>
              <legend className="mb-1 text-sm font-medium">Seções <span className="font-normal text-muted">(vazio = padrão do tipo: {DEFAULT_SECTIONS.executive.length} no resumo executivo)</span></legend>
              <div className="grid gap-1 sm:grid-cols-2">
                {SECTIONS.map((s) => <label key={s} className="flex items-center gap-2 text-sm"><input type="checkbox" name="secoes" value={s} />{SECTION_LABEL[s]}</label>)}
              </div>
            </fieldset>
            <button className={btnCls.primary}>Visualizar relatório</button>
          </form>
        </Card>
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Modelos salvos</h2>
            {templates.length === 0 ? <p className="text-sm text-muted">Nenhum modelo. {manage ? "Salve a configuração do formulário abaixo." : ""}</p> : (
              <ul className="space-y-2">{templates.map((t) => {
                const c = t.config as { type?: ReportType; days?: number; clientId?: string; accountId?: string; sections?: string[] };
                return (
                  <li key={t.id} className="flex items-center justify-between gap-2 text-sm">
                    <span><Link className="font-medium text-brand hover:underline" href={`/app/relatorios/ver?${qs(c)}`}>{t.name}</Link><span className="block text-xs text-muted">{c.type ? TYPE_LABEL[c.type] : "—"} · {c.days} dias</span></span>
                    {manage && <form action={deleteTemplateAction}><input type="hidden" name="templateId" value={t.id} /><ConfirmButton message={`Excluir o modelo “${t.name}”?`} className={btnCls.danger}>Excluir</ConfirmButton></form>}
                  </li>);
              })}</ul>
            )}
            {manage && (
              <Form action={saveTemplateAction} submit="Salvar como modelo" variant="secondary" className="mt-4 space-y-3 border-t border-line pt-3">
                <Field label="Nome do modelo" name="name" id="tpl-name" />
                <label className="block text-xs text-muted">Tipo<select name="tipo" className={`${inputCls} mt-1`}>{REPORT_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABEL[t]}</option>)}</select></label>
                <label className="block text-xs text-muted">Período<select name="dias" defaultValue="30" className={`${inputCls} mt-1`}><option value="7">7 dias</option><option value="30">30 dias</option><option value="90">90 dias</option></select></label>
                <label className="block text-xs text-muted">Cliente<select name="cliente" className={`${inputCls} mt-1`}><option value="">Todos</option>{options.clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></label>
              </Form>
            )}
          </Card>
        </div>
      </div>

      <Card className="mt-4 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 text-sm font-semibold">Exportações recentes</h2>
        {exports.length === 0 ? <div className="p-5"><EmptyState title="Nenhuma exportação ainda" /></div> : (
          <table className="mt-2 w-full text-sm"><thead><tr><Th>Quando</Th><Th>Relatório</Th><Th>Formato</Th><Th right>Tamanho</Th><Th>Verificação</Th><Th>Arquivo (SHA-256)</Th></tr></thead>
            <tbody>{exports.map((e) => (
              <tr key={e.id}><Td className="num text-muted">{e.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</Td>
                <Td>{TYPE_LABEL[e.reportType as ReportType] ?? e.reportType}</Td><Td className="uppercase">{e.format}</Td><Td right>{(e.bytes / 1024).toFixed(1).replace(".", ",")} KB</Td>
                <Td>{e.verified ? <Badge tone="ok">Verificado ({e.verification.length} conferências)</Badge> : <Badge tone="danger">Reprovado — não entregue</Badge>}</Td>
                <Td className="font-mono text-xs text-muted">{e.sha256.slice(0, 12)}…</Td></tr>))}</tbody></table>
        )}
      </Card>
    </>
  );
}
