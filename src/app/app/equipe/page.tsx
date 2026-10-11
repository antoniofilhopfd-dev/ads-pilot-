import { Form } from "@/components/form";
import { Alert, Badge, Card, Field, PageHeader, Td, Th, btnCls, inputCls } from "@/components/ui";
import { ROLES } from "@/db/schema";
import { canActor } from "@/server/context";
import { ROLE_LABEL } from "@/server/permissions";
import { listAccounts } from "@/server/meta/connection";
import { listMemberAccess, listMembers } from "@/server/services/organizations";
import { requireActor } from "@/server/session";
import { addMemberAction, changeRoleAction, removeMemberAction, setMemberAccessAction } from "../../actions";

export const metadata = { title: "Equipe — AdsPilot" };

export default async function Equipe() {
  const { actor } = await requireActor();
  const members = await listMembers(actor);
  const manage = canActor(actor, "members.manage");
  const accounts = manage ? await listAccounts(actor) : [];
  const access = manage ? await listMemberAccess(actor) : new Map<string, string[]>();
  return (
    <>
      <PageHeader title="Equipe" subtitle="Quem tem acesso a esta organização e com qual perfil." />
      <div className="grid gap-4 2xl:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th><Th>Acesso às contas</Th>{manage && <Th right>Ações</Th>}</tr></thead>
            <tbody>
              {members.map((m) => (
                <tr key={m.userId}>
                  <Td className="font-medium">{m.name}</Td>
                  <Td className="text-muted">{m.email}</Td>
                  <Td>{manage ? (
                    <Form action={changeRoleAction} submit="Salvar" variant="secondary" className="flex items-center gap-2">
                      <input type="hidden" name="userId" value={m.userId} />
                      <select name="role" defaultValue={m.role} aria-label={`Perfil de ${m.name}`} className={inputCls + " !w-auto"}>
                        {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                      </select>
                    </Form>
                  ) : <Badge>{ROLE_LABEL[m.role]}</Badge>}</Td>
                  <Td className="min-w-[300px]">
                    {m.role === "admin" ? <Badge tone="ok">Todas (administrador)</Badge> : manage ? (
                      <details>
                        <summary className="cursor-pointer text-sm"><Badge tone={m.accessScope === "restricted" ? "warn" : "ok"}>{m.accessScope === "restricted" ? `Restrito: ${(access.get(m.userId) ?? []).length} conta(s)` : "Todas as contas"}</Badge> <span className="text-brand underline">editar</span></summary>
                        <Form action={setMemberAccessAction} submit="Salvar acesso" variant="secondary" className="mt-2 space-y-2">
                          <input type="hidden" name="userId" value={m.userId} />
                          <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" value="all" defaultChecked={m.accessScope === "all"} /> Todas as contas</label>
                          <label className="flex items-center gap-2 text-sm"><input type="radio" name="scope" value="restricted" defaultChecked={m.accessScope === "restricted"} /> Somente as contas marcadas:</label>
                          <fieldset className="max-h-40 overflow-auto rounded-md border border-line p-2"><legend className="sr-only">Contas liberadas para {m.name}</legend>
                            {accounts.length === 0 ? <p className="text-xs text-muted">Nenhuma conta disponível.</p> : accounts.map((a) => (
                              <label key={a.id} className="flex items-center gap-2 py-0.5 text-sm"><input type="checkbox" name="accountId" value={a.id} defaultChecked={(access.get(m.userId) ?? []).includes(a.id)} /> {a.name}</label>))}
                          </fieldset>
                          <p className="text-xs text-muted">Contas novas não são liberadas automaticamente a quem tem acesso restrito.</p>
                        </Form>
                      </details>
                    ) : <Badge tone={m.accessScope === "restricted" ? "warn" : "ok"}>{m.accessScope === "restricted" ? "Restrito" : "Todas as contas"}</Badge>}
                  </Td>
                  {manage && (
                    <Td right>
                      <Form action={removeMemberAction} submit="Remover" variant="danger" className="inline">
                        <input type="hidden" name="userId" value={m.userId} />
                      </Form>
                    </Td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
        {manage ? (
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Adicionar membro</h2>
            <Form action={addMemberAction} submit="Adicionar">
              <Field label="E-mail da conta" name="email" type="email" hint="A pessoa precisa já ter criado uma conta. Convites por e-mail virão depois." />
              <div>
                <label htmlFor="role" className="mb-1 block text-sm font-medium">Perfil</label>
                <select id="role" name="role" defaultValue="analyst" className={inputCls}>
                  {ROLES.map((r) => <option key={r} value={r}>{ROLE_LABEL[r]}</option>)}
                </select>
              </div>
              <label className="flex items-start gap-2 text-sm"><input type="checkbox" name="restricted" className="mt-1" /> <span>Acesso restrito<span className="block text-xs text-muted">Não verá nenhuma conta até você liberar as contas desejadas.</span></span></label>
            </Form>
          </Card>
        ) : (
          <Alert tone="info">Somente administradores podem gerenciar a equipe.</Alert>
        )}
      </div>
    </>
  );
}
