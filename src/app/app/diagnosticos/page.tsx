import Link from "next/link";
import { Alert, Badge, Card, EmptyState, PageHeader } from "@/components/ui";
import { accountDiagnostics, llmStatus } from "@/server/diagnostics";
import { requireActor } from "@/server/session";

export const metadata = { title: "Diagnósticos — AdsPilot" };
const TONE = { info: "neutral", warn: "warn", danger: "danger", ok: "ok" } as const;

export default async function Diagnosticos() {
  const { actor } = await requireActor();
  const list = await accountDiagnostics(actor);
  const llm = llmStatus();
  return (
    <>
      <PageHeader title="Diagnósticos" subtitle="Leitura por regras transparentes dos últimos 7 dias × 7 dias anteriores. Hipóteses não são fatos: servem para você investigar, não para decidir sozinho." />
      <div className="mb-4"><Alert tone="info">{llm.reason}</Alert></div>
      {list.length === 0 ? <EmptyState title="Nada a destacar">Nenhuma campanha com variação relevante e amostra suficiente. Campanhas com poucos dados aparecem aqui como “amostra pequena”.</EmptyState> : (
        <div className="space-y-4">{list.map((c) => (
          <Card key={c.campaign.id}>
            <h2 className="font-semibold"><Link className="text-brand underline" href={`/app/campanhas/${c.campaign.id}`}>{c.campaign.name}</Link> <span className="text-xs font-normal text-muted">{c.campaign.account}</span></h2>
            <div className="mt-2 space-y-3">{c.items.filter((i) => i.id !== "estavel").map((d) => (
              <div key={d.id} className="rounded-md border border-line p-3 text-sm">
                <div className="flex flex-wrap items-center gap-2"><Badge tone={TONE[d.tone]}>{d.id.replace(/_/g, " ")}</Badge><Badge>Confiança: {d.confidence}</Badge></div>
                <p className="mt-2"><strong>Observação:</strong> {d.observation}</p>
                <p className="text-muted"><strong>Comparação:</strong> {d.comparison}</p>
                {d.hypothesis && <p><strong>Hipótese (não comprovada):</strong> {d.hypothesis.replace(/^Hipótese \(não comprovada\):\s*/, "")}</p>}
                <p><strong>Recomendação:</strong> {d.recommendation}</p>
                <p className="text-muted"><strong>Riscos:</strong> {d.risks}</p>
                <p><strong>Próxima ação:</strong> {d.nextAction}</p>
                <p className="mt-1 text-xs text-muted">Período: {d.period}</p>
              </div>))}</div>
          </Card>))}</div>)}
    </>
  );
}
