import { Form } from "@/components/form";
import { ConfirmButton } from "@/components/confirm-button";
import { TargetSelect } from "@/components/target-select";
import { Badge, Card, EmptyState, PageHeader, btnCls, inputCls } from "@/components/ui";
import { brl, int, pct, ratio } from "@/lib/metrics";
import { canActor } from "@/server/context";
import { evaluateGoals, type GoalStatus } from "@/server/goals";
import { targetOptions } from "@/server/params";
import { requireActor } from "@/server/session";
import { deleteGoalAction, saveGoalAction } from "../../actions";

export const metadata = { title: "Metas — AdsPilot" };
const METRIC: Record<string, string> = { cpa: "CPA (custo por resultado)", cpl: "CPL (custo por lead)", roas: "ROAS", ctr: "CTR", cpc: "CPC", cpm: "CPM", spend: "Gasto", results: "Resultados" };
const STATUS: Record<GoalStatus, { label: string; tone: "ok" | "danger" | "warn" | "neutral" }> = { atingida: { label: "Atingida", tone: "ok" }, nao_atingida: { label: "Não atingida", tone: "danger" }, sem_dados: { label: "Sem dados", tone: "neutral" }, amostra_insuficiente: { label: "Amostra insuficiente (<1.000 impressões)", tone: "warn" } };
const fmt = (m: string, v: number | null) => v === null ? "—" : m === "roas" ? ratio(v) : m === "ctr" ? pct(v) : m === "results" ? int(v) : brl(v);

export default async function Metas() {
  const { actor } = await requireActor();
  const [goals, opts] = await Promise.all([evaluateGoals(actor), targetOptions(actor)]);
  const manage = canActor(actor, "budgets.manage");
  return (
    <>
      <PageHeader title="Metas" subtitle="Metas internas avaliadas com dados sincronizados da janela escolhida. Sem dados nunca conta como atingida." />
      <div className="grid gap-4 lg:grid-cols-[1fr_340px]">
        <div className="space-y-3">
          {goals.length === 0 ? <EmptyState title="Nenhuma meta definida">{manage ? "Crie a primeira meta ao lado." : "Peça a um gestor para definir."}</EmptyState> : goals.map((g) => (
            <Card key={g.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-xs text-muted">{g.scopeLabel} · últimos {g.windowDays} dias</p><h2 className="font-semibold">{METRIC[g.metric]} {g.direction === "max" ? "≤" : "≥"} {fmt(g.metric, g.target)}</h2></div>
                <Badge tone={STATUS[g.status].tone}>{STATUS[g.status].label}</Badge>
              </div>
              <p className="mt-2 text-sm">Atual: <strong className="num">{fmt(g.metric, g.current)}</strong>{g.gapPct !== null && <span className="text-muted"> ({g.gapPct > 0 ? "+" : ""}{g.gapPct.toFixed(1).replace(".", ",")}% vs. meta)</span>}</p>
              {g.note && <p className="mt-1 text-xs text-muted">{g.note}</p>}
              {manage && <form action={deleteGoalAction} className="mt-2"><input type="hidden" name="goalId" value={g.id} /><ConfirmButton message="Excluir esta meta?" className={btnCls.danger}>Excluir</ConfirmButton></form>}
            </Card>))}
        </div>
        {manage && (
          <Card className="h-fit">
            <h2 className="mb-3 text-sm font-semibold">Nova meta</h2>
            <Form action={saveGoalAction} submit="Salvar meta">
              <TargetSelect opts={opts} allowOrg />
              <label className="block text-sm font-medium">Métrica<select name="metrica" className={`${inputCls} mt-1`}>{Object.entries(METRIC).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></label>
              <label className="block text-sm font-medium">Regra<select name="direcao" className={`${inputCls} mt-1`}><option value="max">Ficar até o valor (custos)</option><option value="min">Ficar no mínimo no valor (retorno/volume)</option></select></label>
              <label className="block text-sm font-medium">Valor da meta<input name="meta" inputMode="decimal" required className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Janela (dias)<input name="janela" type="number" min="1" max="365" defaultValue="30" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Observação<input name="nota" maxLength={300} className={`${inputCls} mt-1`} /></label>
            </Form>
          </Card>)}
      </div>
    </>
  );
}
