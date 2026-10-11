import Link from "next/link";
import { Form } from "@/components/form";
import { Badge, Card, EmptyState, PageHeader, inputCls } from "@/components/ui";
import { ALERT_TYPES, DEFAULT_ALERT_CONFIG } from "@/db/schema";
import { canActor } from "@/server/context";
import { getAlertConfig, listAlerts } from "@/server/alerts";
import { listMembers } from "@/server/services/organizations";
import { one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { acknowledgeAlertAction, reevaluateAlertsAction, saveAlertConfigAction } from "../../actions";

export const metadata = { title: "Alertas — AdsPilot" };
const TYPE: Record<string, string> = { budget_projection: "Projeção de orçamento", budget_exceeded: "Orçamento excedido", goal_not_met: "Meta não atingida", no_delivery: "Sem entrega", cost_rise: "Custo subiu", ctr_drop: "CTR caiu", frequency_high: "Frequência alta", stale_sync: "Dados desatualizados" };
const SEV = { critical: { label: "Crítico", tone: "danger" }, warning: { label: "Atenção", tone: "warn" }, info: { label: "Info", tone: "neutral" } } as const;
const STATE = { open: "Aberto", acknowledged: "Reconhecido", resolved: "Resolvido" } as const;

export default async function Alertas({ searchParams }: { searchParams: Promise<SP> }) {
  const sp = await searchParams;
  const { actor } = await requireActor();
  const state = one(sp.estado) === "resolved" ? "resolved" : undefined;
  const [list, cfg, members] = await Promise.all([listAlerts(actor, { state }), getAlertConfig(actor.organizationId), canActor(actor, "budgets.manage") ? listMembers(actor) : Promise.resolve([])]);
  const manage = canActor(actor, "budgets.manage"), ack = canActor(actor, "campaigns.write");
  return (
    <>
      <PageHeader title="Alertas" subtitle="Alertas internos calculados a partir dos dados sincronizados. Nunca bloqueiam gasto na Meta. Cada problema aparece uma vez e é atualizado, não repetido."
        action={<Link href={state ? "/app/alertas" : "/app/alertas?estado=resolved"} className="text-sm text-brand hover:underline">{state ? "Ver abertos" : "Ver resolvidos"}</Link>} />
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-3">
          {list.length === 0 ? <EmptyState title={state ? "Nenhum alerta resolvido" : "Nenhum alerta ativo"}>Isso significa que nenhuma regra disparou com os dados e mínimos de amostra atuais — não garante bom desempenho.</EmptyState> : list.map((a) => (
            <Card key={a.id}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div><p className="text-xs text-muted">{TYPE[a.type]} · {a.entityName}</p><h2 className="font-semibold">{a.title}</h2></div>
                <div className="flex gap-1"><Badge tone={SEV[a.severity].tone}>{SEV[a.severity].label}</Badge><Badge>{STATE[a.state]}</Badge></div>
              </div>
              <p className="mt-2 text-sm">{a.detail.message}</p>
              <details className="mt-2 text-xs text-muted"><summary className="cursor-pointer">Dados e premissas</summary>
                <ul className="ml-4 list-disc">{Object.entries(a.detail.facts).map(([k, v]) => <li key={k}>{k.replace(/_/g, " ")}: {v === null ? "—" : String(v)}</li>)}{(a.detail.assumptions ?? []).map((x) => <li key={x}>{x}</li>)}</ul></details>
              <p className="mt-2 text-xs text-muted">Visto {a.occurrences}× · desde {a.firstSeenAt.toLocaleString("pt-BR")} · última avaliação {a.lastSeenAt.toLocaleString("pt-BR")}</p>
              <div className="mt-2 flex gap-3 text-sm">
                {a.entityType === "campaign" && <Link className="text-brand hover:underline" href={`/app/campanhas/${a.entityId}`}>Abrir campanha</Link>}
                {ack && a.state === "open" && <form action={acknowledgeAlertAction}><input type="hidden" name="alertId" value={a.id} /><button className="text-brand hover:underline">Reconhecer</button></form>}
              </div>
            </Card>))}
        </div>
        <div className="space-y-4">
          {ack && <Card><Form action={reevaluateAlertsAction} submit="Reavaliar alertas agora" variant="secondary" className="space-y-1"><p className="text-xs text-muted">Roda automaticamente após cada sincronização.</p></Form></Card>}
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Configuração</h2>
            {manage ? (
              <Form action={saveAlertConfigAction} submit="Salvar configuração">
                <fieldset><legend className="mb-1 text-sm font-medium">Regras ativas</legend>
                  {ALERT_TYPES.map((t) => <label key={t} className="flex items-center gap-2 text-sm"><input type="checkbox" name={`on_${t}`} defaultChecked={cfg.enabled[t] !== false} />{TYPE[t]}</label>)}</fieldset>
                {([["costRisePct", "Custo sobe (%)", 5], ["ctrDropPct", "CTR cai (%)", 5], ["frequencyMax", "Frequência máxima", 0.1], ["minImpressions", "Mínimo de impressões", 100], ["minResults", "Mínimo de resultados", 1], ["noDeliveryDays", "Dias sem entrega", 1], ["renotifyHours", "Reavisar a cada (h)", 1]] as const).map(([k, l, st]) => (
                  <label key={k} className="block text-sm font-medium">{l}<input name={k} type="number" step={st} defaultValue={cfg[k] ?? DEFAULT_ALERT_CONFIG[k]} required className={`${inputCls} mt-1`} /></label>))}
                <fieldset><legend className="mb-1 text-sm font-medium">Responsáveis (vazio = admins e gestores)</legend>
                  {members.map((m) => <label key={m.userId} className="flex items-center gap-2 text-sm"><input type="checkbox" name="responsaveis" value={m.userId} defaultChecked={cfg.responsibleUserIds.includes(m.userId)} />{m.name}</label>)}</fieldset>
              </Form>
            ) : <p className="text-sm text-muted">Limiares: custo +{cfg.costRisePct}% · CTR −{cfg.ctrDropPct}% · frequência {cfg.frequencyMax} · mínimo {cfg.minImpressions} impressões e {cfg.minResults} resultados. Somente administradores e gestores alteram.</p>}
            <p className="mt-3 text-xs text-muted">Os limiares são seus, não “benchmarks de mercado”. Nenhum alerta dispara abaixo dos mínimos de amostra.</p>
          </Card>
        </div>
      </div>
    </>
  );
}
