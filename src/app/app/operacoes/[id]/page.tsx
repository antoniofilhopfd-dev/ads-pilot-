import Link from "next/link";
import { notFound } from "next/navigation";
import { Form } from "@/components/form";
import { Alert, Badge, Card, PageHeader, Td, btnCls } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { OP_LABEL, OPSTATUS, statusInfo } from "@/lib/labels";
import { brl } from "@/lib/metrics";
import { getOperation } from "@/server/meta/operations";
import { canActor } from "@/server/context";
import { requireActor } from "@/server/session";
import { cancelOperationAction, executeOperationAction, issueCodeAction, reconcileOperationAction } from "../../../actions";

export const metadata = { title: "Operação — AdsPilot" };

export default async function OperacaoPage({ params }: { params: Promise<{ id: string }> }) {
  const { actor } = await requireActor();
  const { id } = await params;
  let op;
  try { op = await getOperation(actor, id); } catch (e) { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; }
  const [tone, label] = OPSTATUS[op.status];
  const canWrite = canActor(actor, "campaigns.write");
  const needsAck = op.warnings.some((w) => w.startsWith("Aumento"));
  const target = op.type === "pause" ? "PAUSED" : op.type === "activate" ? "ACTIVE" : null;
  const s = (st: string | null) => statusInfo(st).label;

  return (
    <>
      <PageHeader title={`${OP_LABEL[op.type]}: ${op.campaignName}`} subtitle={op.status === "prepared" ? "Revise a alteração. Nada acontece até você confirmar." : "Registro da operação."} action={<Badge tone={tone}>{label}</Badge>} />
      {op.mode === "demo" && <div className="mb-4"><Alert tone="info"><strong>SIMULAÇÃO</strong> — esta operação acontece no ambiente de demonstração e <strong>não altera nada na Meta</strong>.</Alert></div>}
      <Card className="mb-4 max-w-2xl">
        <h2 className="mb-2 text-sm font-semibold">Alteração</h2>
        <table className="w-full text-sm"><tbody>
          {target && <tr><Td>Status da campanha</Td><Td>{s(op.before.status)}</Td><Td className="font-semibold">→ {s(op.after?.status ?? target)}</Td></tr>}
          {op.type === "set_daily_budget" && <tr><Td>Orçamento diário</Td><Td>{brl(op.before.dailyBudget)}</Td><Td className="font-semibold">→ {brl(op.after?.dailyBudget ?? op.params.dailyBudget ?? null)}</Td></tr>}
        </tbody></table>
        <p className="mt-2 text-xs text-muted">“Atual” foi lido na hora do preparo e será conferido de novo antes de executar; se mudou, a operação é abortada sem alterar nada.</p>
      </Card>
      {op.warnings.filter((w) => !w.startsWith("SIMULAÇÃO")).map((w, i) => <div key={i} className="mb-3 max-w-2xl"><Alert tone="error">{w}</Alert></div>)}

      {op.origin === "mcp" && <div className="mb-4 max-w-2xl"><Alert tone="info"><strong>Preparada por um assistente de IA (MCP).</strong> O assistente não pode executar sozinho: você precisa revisar a alteração e gerar o código abaixo, ou confirmar aqui mesmo.</Alert></div>}
      {op.origin === "mcp" && op.status === "prepared" && canWrite && (
        <Card className="mb-4 max-w-2xl">
          <h2 className="mb-2 text-sm font-semibold">Autorizar o assistente</h2>
          <Form action={issueCodeAction} submit="Gerar código para o assistente" variant="secondary"><input type="hidden" name="operationId" value={op.id} /></Form>
          <p className="mt-2 text-xs text-muted">O código vale 10 minutos, tem 5 tentativas e é de uso único. Só o autor ou um administrador pode gerá-lo.</p>
        </Card>
      )}
      {op.status === "prepared" && canWrite && (
        <Card className="max-w-2xl">
          <p className="mb-3 text-sm">Expira às {op.expiresAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" })}. Autor: você ou um administrador pode confirmar.</p>
          <Form action={executeOperationAction} submit="Confirmar e executar" className="space-y-3">
            <input type="hidden" name="operationId" value={op.id} />
            {needsAck && <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="ack" className="mt-1" /> Estou ciente de que este aumento grande eleva o gasto potencial.</label>}
          </Form>
          <form action={cancelOperationAction} className="mt-3">
            <input type="hidden" name="operationId" value={op.id} /><input type="hidden" name="campaignId" value={op.campaignId} />
            <button className={btnCls.secondary}>Cancelar</button>
          </form>
        </Card>
      )}

      {op.status !== "prepared" && (
        <Card className="max-w-2xl">
          <h2 className="mb-1 text-sm font-semibold">Resultado</h2>
          <p className="text-sm">{op.resultMessage ?? "—"}</p>
          {op.status === "succeeded" && <p className="mt-2 text-sm text-ok">✔ Confirmado no estado remoto{op.verifiedAt ? ` às ${op.verifiedAt.toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", timeStyle: "short" })}` : ""}.</p>}
          {(op.status === "ambiguous" || op.status === "executing") && canWrite && (
            <div className="mt-3"><Form action={reconcileOperationAction} submit="Verificar estado agora" variant="secondary"><input type="hidden" name="operationId" value={op.id} /></Form>
              <p className="mt-2 text-xs text-muted">A verificação apenas lê o estado na Meta; ela nunca repete a alteração.</p></div>
          )}
        </Card>
      )}
      <p className="mt-4 text-sm"><Link className="text-brand underline" href={`/app/campanhas/${op.campaignId}`}>← Voltar à campanha</Link> · <Link className="text-brand underline" href="/app/operacoes">Todas as operações</Link></p>
    </>
  );
}
