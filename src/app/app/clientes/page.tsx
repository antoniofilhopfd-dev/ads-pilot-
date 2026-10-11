import { ConfirmButton } from "@/components/confirm-button";
import { Form } from "@/components/form";
import { Card, EmptyState, Field, PageHeader, Td, Th, btnCls } from "@/components/ui";
import { canActor } from "@/server/context";
import { listClients } from "@/server/services/clients";
import { requireActor } from "@/server/session";
import { createClientAction, deleteClientAction } from "../../actions";

export const metadata = { title: "Clientes — AdsPilot" };

export default async function Clientes() {
  const { actor } = await requireActor();
  const clients = await listClients(actor);
  const canWrite = canActor(actor, "clients.write");
  return (
    <>
      <PageHeader title="Clientes" subtitle="Empresas ou marcas cujas contas de anúncios você gerencia." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <div>
          {clients.length === 0 ? (
            <EmptyState title="Nenhum cliente cadastrado">{canWrite ? "Use o formulário ao lado para cadastrar o primeiro cliente." : "Peça a um gestor ou administrador para cadastrar clientes."}</EmptyState>
          ) : (
            <Card className="overflow-x-auto p-0">
              <table className="w-full text-sm">
                <thead><tr><Th>Cliente</Th><Th>Observações</Th>{canWrite && <Th right>Ações</Th>}</tr></thead>
                <tbody>
                  {clients.map((c) => (
                    <tr key={c.id}>
                      <Td className="font-medium">{c.name}</Td>
                      <Td className="text-muted">{c.notes ?? "—"}</Td>
                      {canWrite && (
                        <Td right>
                          <form action={deleteClientAction}>
                            <input type="hidden" name="clientId" value={c.id} />
                            <ConfirmButton message={`Excluir o cliente “${c.name}”?`} className={btnCls.danger}>Excluir</ConfirmButton>
                          </form>
                        </Td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </div>
        {canWrite && (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Novo cliente</h2>
            <Form action={createClientAction} submit="Adicionar cliente">
              <Field label="Nome" name="name" />
              <Field label="Observações" name="notes" required={false} />
            </Form>
          </Card>
        )}
      </div>
    </>
  );
}
