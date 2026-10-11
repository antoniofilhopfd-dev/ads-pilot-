import Link from "next/link";
import { notFound } from "next/navigation";
import { LineChart } from "@/components/charts";
import { DemoBanner, SyncBadge } from "@/components/data-status";
import { Form } from "@/components/form";
import { Alert, Badge, Card, Field, PageHeader, Td, Th } from "@/components/ui";
import { canActor } from "@/server/context";
import { prepareOperationAction } from "../../../actions";
import { AppError } from "@/lib/errors";
import { objectiveLabel, statusInfo } from "@/lib/labels";
import { brl, brl0, int, pct, ratio } from "@/lib/metrics";
import { getCampaignDetail } from "@/server/insights";
import { getConnection } from "@/server/meta/connection";
import { parseFilters, type SP } from "@/server/params";
import { requireActor } from "@/server/session";

export const metadata = { title: "Campanha — AdsPilot" };

export default async function Detalhe({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { actor } = await requireActor();
  const { id } = await params;
  const f = parseFilters(await searchParams);
  let d;
  try { d = await getCampaignDetail(actor, id, f); } catch (e) { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; }
  const conn = await getConnection(actor);
  const c = d.campaign, cur = d.currency, t = d.totals;
  const s = statusInfo(c.effectiveStatus);
  const stale = !d.lastSyncedAt || Date.now() - d.lastSyncedAt.getTime() > 24 * 3_600_000;
  const avgDaily = t.spend !== null && t.days > 0 ? t.spend / t.days : null;
  const back = new URLSearchParams({ ...(f.clientId ? { cliente: f.clientId } : {}), ...(f.accountId ? { conta: f.accountId } : {}), dias: f.dias }).toString();

  return (
    <>
      <PageHeader title={c.name} subtitle={`${d.accountName} · ${objectiveLabel(c.objective)}`} action={<SyncBadge lastSyncedAt={d.lastSyncedAt} stale={stale} hasConnection />} />
      <p className="-mt-3 mb-4 text-sm"><Link className="text-brand underline" href={`/app/campanhas?${back}`}>← Campanhas</Link> <span className="ml-2"><Badge tone={s.tone}>{s.label}</Badge></span></p>
      {conn?.mode === "demo" && <DemoBanner />}
      {canActor(actor, "campaigns.write") && (
        <Card className="mb-4">
          <h2 className="mb-2 text-sm font-semibold">Ações</h2>
          {conn?.mode !== "demo" ? (
            <Alert tone="info">Alterar campanhas na Meta real ainda não está habilitado (exige a permissão ads_management e validação com conta de teste).</Alert>
          ) : (
            <div className="flex flex-wrap items-end gap-6">
              {(c.status === "ACTIVE" || c.status === "PAUSED") && (
                <Form action={prepareOperationAction} submit={c.status === "ACTIVE" ? "Pausar campanha…" : "Reativar campanha…"} variant="secondary" className="inline">
                  <input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="type" value={c.status === "ACTIVE" ? "pause" : "activate"} />
                </Form>
              )}
              {c.dailyBudget !== null && (
                <Form action={prepareOperationAction} submit="Alterar orçamento…" variant="secondary" className="flex items-end gap-2">
                  <input type="hidden" name="campaignId" value={c.id} /><input type="hidden" name="type" value="set_daily_budget" />
                  <Field label="Novo orçamento diário (R$)" name="dailyBudget" id="new-budget" />
                </Form>
              )}
              <p className="basis-full text-xs text-muted">Toda ação passa por uma tela de confirmação (atual × novo) e é verificada depois. Ambiente de demonstração: nada é alterado na Meta.</p>
            </div>
          )}
        </Card>
      )}
      <div className="mb-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {[["Gasto (Meta)", brl(t.spend, cur)], ["Resultados", int(t.results)], ["Custo por resultado", brl(t.costPerResult, cur)], ["CTR", pct(t.ctr)], ["ROAS", ratio(t.roas)]].map(([l, v]) => (
          <Card key={l}><p className="text-xs text-muted">{l}</p><p className="num mt-1 text-2xl font-semibold">{v}</p></Card>
        ))}
      </div>
      <div className="mb-4 grid gap-3 lg:grid-cols-2">
        <Card><h2 className="mb-2 text-sm font-semibold">Gasto por dia</h2><LineChart data={d.daily.map((x) => ({ date: x.date, value: x.spend }))} label="Gasto por dia" format={(v) => brl0(v, cur)} /></Card>
        <Card>
          <h2 className="mb-2 text-sm font-semibold">Orçamento e gasto</h2>
          <table className="w-full text-sm"><tbody>
            <tr><Td>Orçamento configurado na Meta</Td><Td right>{c.dailyBudget !== null ? `${brl(c.dailyBudget, cur)}/dia` : c.lifetimeBudget !== null ? `${brl(c.lifetimeBudget, cur)} (total)` : "Definido nos conjuntos ou não informado"}</Td></tr>
            <tr><Td>Gasto informado pela Meta ({f.dias} dias)</Td><Td right>{brl(t.spend, cur)}</Td></tr>
            <tr><Td>Previsão calculada pelo AdsPilot <Badge>estimativa</Badge></Td><Td right>{avgDaily !== null && t.days >= 3 ? `${brl(avgDaily * 30, cur)} / 30 dias` : "Dados insuficientes"}</Td></tr>
            <tr><Td>Limite interno do AdsPilot</Td><Td right>Não disponível nesta versão</Td></tr>
            <tr><Td>Limite de gasto aplicado na Meta</Td><Td right>Não consultado nesta versão</Td></tr>
          </tbody></table>
          <p className="mt-2 text-xs text-muted">Previsão = gasto médio diário do período × 30 (projeção simples, não garantia). Um alerta interno nunca bloqueia gasto na Meta.</p>
        </Card>
      </div>
      <Card className="mb-4 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 text-sm font-semibold">Conjuntos de anúncios ({d.adSets.length})</h2>
        <table className="mt-2 w-full text-sm"><thead><tr><Th>Conjunto</Th><Th>Status</Th><Th>Otimização</Th></tr></thead><tbody>
          {d.adSets.length === 0 ? <tr><Td className="text-muted">Nenhum conjunto sincronizado.</Td></tr> : d.adSets.map((a) => { const si = statusInfo(a.effectiveStatus); return <tr key={a.id}><Td className="font-medium">{a.name}</Td><Td><Badge tone={si.tone}>{si.label}</Badge></Td><Td>{a.optimizationGoal ?? "—"}</Td></tr>; })}
        </tbody></table>
      </Card>
      <Card className="mb-4 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 text-sm font-semibold">Anúncios ({d.ads.length})</h2>
        <table className="mt-2 w-full text-sm"><thead><tr><Th>Anúncio</Th><Th>Status de entrega</Th></tr></thead><tbody>
          {d.ads.length === 0 ? <tr><Td className="text-muted">Nenhum anúncio sincronizado.</Td></tr> : d.ads.map((a) => { const si = statusInfo(a.effectiveStatus); return <tr key={a.id}><Td className="font-medium">{a.name}</Td><Td><Badge tone={si.tone}>{si.label}</Badge></Td></tr>; })}
        </tbody></table>
      </Card>
      <p className="text-xs text-muted">Resultado = ação do objetivo da campanha (vendas: compras; cadastros: leads; tráfego: cliques no link; engajamento: engajamentos). “—” indica que a Meta não informou o dado. Detalhes em Integrações › Metodologia.</p>
    </>
  );
}
