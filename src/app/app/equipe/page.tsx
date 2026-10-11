import { Form } from "@/components/form";
import { Alert, Badge, Card, Field, PageHeader, Td, Th, btnCls, inputCls } from "@/components/ui";
import { ROLES } from "@/db/schema";
import { can, ROLE_LABEL } from "@/server/permissions";
import { listMembers } from "@/server/services/organizations";
import { requireActor } from "@/server/session";
import { addMemberAction, changeRoleAction, removeMemberAction } from "../../actions";

export const metadata = { title: "Equipe — AdsPilot" };

export default async function Equipe() {
  const { actor } = await requireActor();
  const members = await listMembers(actor);
  const manage = can(actor.role, "members.manage");
  return (
    <>
      <PageHeader title="Equipe" subtitle="Quem tem acesso a esta organização e com qual perfil." />
      <div className="grid gap-4 lg:grid-cols-[1fr_320px]">
        <Card className="overflow-x-auto p-0">
          <table className="w-full text-sm">
            <thead><tr><Th>Nome</Th><Th>E-mail</Th><Th>Perfil</Th>{manage && <Th right>Ações</Th>}</tr></thead>
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
            </Form>
          </Card>
        ) : (
          <Alert tone="info">Somente administradores podem gerenciar a equipe.</Alert>
        )}
      </div>
    </>
  );
}
