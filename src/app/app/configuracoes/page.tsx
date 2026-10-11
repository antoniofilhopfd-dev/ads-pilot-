import { Form } from "@/components/form";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { can } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { renameOrgAction } from "../../actions";

export const metadata = { title: "Configurações — AdsPilot" };

export default async function Configuracoes() {
  const { actor, orgs } = await requireActor();
  const org = orgs.find((o) => o.id === actor.organizationId)!;
  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados da organização." />
      {can(actor.role, "org.settings") ? (
        <Card className="max-w-md">
          <Form action={renameOrgAction} submit="Salvar">
            <Field label="Nome da organização" name="name" defaultValue={org.name} />
          </Form>
        </Card>
      ) : <Alert tone="info">Somente administradores podem alterar as configurações.</Alert>}
    </>
  );
}
