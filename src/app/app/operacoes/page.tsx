import Link from "next/link";
import { Badge, Card, EmptyState, PageHeader, Td, Th } from "@/components/ui";
import { OP_LABEL, OPSTATUS } from "@/lib/labels";
import { listOperations } from "@/server/meta/operations";
import { requireActor } from "@/server/session";

export const metadata = { title: "Operações — AdsPilot" };

export default async function Operacoes() {
  const { actor } = await requireActor();
  const rows = await listOperations(actor);
  return (
    <>
      <PageHeader title="Operações" subtitle="Histórico de alterações feitas (ou tentadas) em campanhas. Cada operação é verificada no estado remoto." />
      {rows.length === 0 ? <EmptyState title="Nenhuma operação registrada">Abra uma campanha e use “Ações” para pausar, reativar ou alterar o orçamento.</EmptyState> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><Th>Quando</Th><Th>Campanha</Th><Th>Operação</Th><Th>Ambiente</Th><Th>Resultado</Th></tr></thead>
            <tbody>
              {rows.map(({ op, campaignName }) => {
                const [tone, label] = OPSTATUS[op.status];
                return (
                  <tr key={op.id}>
                    <Td className="num text-muted">{op.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" })}</Td>
                    <Td className="font-medium"><Link className="hover:underline" href={`/app/operacoes/${op.id}`}>{campaignName}</Link></Td>
                    <Td>{OP_LABEL[op.type]}{op.type === "set_daily_budget" && op.params.dailyBudget ? ` → ${op.params.dailyBudget.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}` : ""}</Td>
                    <Td>{op.mode === "demo" ? <Badge tone="warn">Simulação</Badge> : <Badge tone="ok">Meta</Badge>}</Td>
                    <Td><Badge tone={tone}>{label}</Badge></Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
