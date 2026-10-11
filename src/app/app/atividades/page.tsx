import { Alert, Badge, Card, EmptyState, PageHeader, Td, Th } from "@/components/ui";
import { canActor } from "@/server/context";
import { listActivity } from "@/server/services/organizations";
import { requireActor } from "@/server/session";

export const metadata = { title: "Atividades — AdsPilot" };

const LABEL: Record<string, string> = {
  "user.register": "Conta criada", "client.create": "Cliente criado", "client.update": "Cliente alterado", "client.delete": "Cliente excluído",
  "member.add": "Membro adicionado", "member.role_change": "Perfil alterado", "member.remove": "Membro removido", "org.rename": "Organização renomeada", "operation.prepare": "Operação preparada", "operation.pause": "Campanha pausada", "operation.activate": "Campanha reativada", "operation.set_daily_budget": "Orçamento alterado", "operation.cancel": "Operação cancelada", "meta.sync": "Sincronização", "mcp.token_create": "Token MCP criado", "mcp.token_revoke": "Token MCP revogado", "operation.confirmation_code_issued": "Código de confirmação gerado", "report.export": "Relatório exportado", "report.template_save": "Modelo de relatório salvo", "report.template_delete": "Modelo de relatório excluído", "meta.connect_demo": "Demonstração ativada", "meta.disconnect": "Conexão removida", "meta.account_configure": "Conta configurada",
};

export default async function Atividades() {
  const { actor } = await requireActor();
  if (!canActor(actor, "audit.read")) {
    return (<><PageHeader title="Atividades" /><Alert tone="info">Seu perfil não tem acesso ao histórico de atividades.</Alert></>);
  }
  const rows = await listActivity(actor);
  return (
    <>
      <PageHeader title="Atividades" subtitle="Histórico das ações registradas na organização (últimas 100)." />
      {rows.length === 0 ? <EmptyState title="Nenhuma atividade registrada" /> : (
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><Th>Quando</Th><Th>Quem</Th><Th>Ação</Th><Th>Resultado</Th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <Td className="num text-muted">{r.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</Td>
                  <Td>{r.userName ?? "—"}</Td>
                  <Td>{LABEL[r.action] ?? r.action}</Td>
                  <Td><Badge tone={r.result === "success" ? "ok" : "danger"}>{r.result === "success" ? "Sucesso" : "Falha"}</Badge></Td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </>
  );
}
