import { ConfirmButton } from "@/components/confirm-button";
import { Form } from "@/components/form";
import { Alert, Badge, Card, EmptyState, Field, PageHeader, Td, Th, btnCls, inputCls } from "@/components/ui";
import { listMcpTokens } from "@/server/mcp/tokens";
import { canActor } from "@/server/context";
import { requireActor } from "@/server/session";
import { createMcpTokenAction, revokeMcpTokenAction } from "../../actions";

export const metadata = { title: "Assistentes de IA (MCP) — AdsPilot" };

const fmt = (d: Date | null) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function McpPage() {
  const { actor } = await requireActor();
  const tokens = await listMcpTokens(actor);
  const canWrite = canActor(actor, "campaigns.write");
  const url = `${process.env.APP_URL ?? "https://SEU-DOMINIO"}/api/mcp`;
  return (
    <>
      <PageHeader title="Assistentes de IA (MCP)" subtitle="Permita que um assistente compatível com MCP consulte seus dados do AdsPilot. O assistente usa as mesmas regras, permissões e auditoria da plataforma." />
      <div className="mb-4"><Alert tone="info">O token herda o <strong>seu</strong> perfil e só acessa <strong>esta</strong> organização. Escopo “leitura” consulta dados. Escopo “escrita” permite <em>preparar</em> alterações, mas <strong>nada é executado sem um código de confirmação que você mesmo gera</strong> na tela da operação.</Alert></div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <Card className="overflow-x-auto p-0">
          <h2 className="px-5 pt-4 text-sm font-semibold">Tokens</h2>
          {tokens.length === 0 ? <div className="p-5"><EmptyState title="Nenhum token criado" /></div> : (
            <table className="mt-2 w-full text-sm"><thead><tr><Th>Nome</Th><Th>Escopos</Th><Th>Último uso</Th><Th>Expira</Th><Th>Estado</Th><Th right>Ações</Th></tr></thead>
              <tbody>{tokens.map((t) => {
                const revoked = !!t.revokedAt, expired = t.expired;
                return (
                  <tr key={t.id}><Td className="font-medium">{t.name}<p className="font-mono text-xs font-normal text-muted">{t.tokenPrefix}…</p></Td>
                    <Td>{t.scopes.map((s) => <Badge key={s} tone={s === "write" ? "warn" : "neutral"}>{s === "write" ? "escrita" : "leitura"}</Badge>)}</Td>
                    <Td className="num">{fmt(t.lastUsedAt)}</Td><Td className="num">{fmt(t.expiresAt)}</Td>
                    <Td>{revoked ? <Badge tone="danger">Revogado</Badge> : expired ? <Badge tone="neutral">Expirado</Badge> : <Badge tone="ok">Ativo</Badge>}</Td>
                    <Td right>{!revoked && <form action={revokeMcpTokenAction}><input type="hidden" name="tokenId" value={t.id} /><ConfirmButton message={`Revogar o token “${t.name}”? O assistente perde o acesso imediatamente.`} className={btnCls.danger}>Revogar</ConfirmButton></form>}</Td></tr>);
              })}</tbody></table>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Novo token</h2>
          <Form action={createMcpTokenAction} submit="Criar token">
            <Field label="Nome (ex.: Claude Desktop)" name="name" id="mcp-name" />
            <fieldset><legend className="mb-1 text-sm font-medium">Escopos</legend>
              <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="scope" value="read" defaultChecked /> Leitura</label>
              <label className={`flex items-center gap-2 text-sm ${canWrite ? "" : "text-muted"}`}><input type="checkbox" name="scope" value="write" disabled={!canWrite} /> Escrita controlada{!canWrite && " (seu perfil não permite)"}</label></fieldset>
            <label className="block text-sm font-medium">Validade<select name="ttl" defaultValue="30" className={`${inputCls} mt-1`}><option value="30">30 dias</option><option value="90">90 dias</option><option value="365">365 dias</option></select></label>
          </Form>
        </Card>
      </div>
      <Card className="mt-4">
        <h2 className="mb-2 text-sm font-semibold">Como conectar</h2>
        <p className="text-sm text-muted">Endereço do servidor MCP (Streamable HTTP): <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">{url}</code> com o cabeçalho <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">Authorization: Bearer SEU_TOKEN</code>. Veja o contrato das ferramentas em <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">docs/mcp.md</code>.</p>
      </Card>
    </>
  );
}
