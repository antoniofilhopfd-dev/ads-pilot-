import { Form } from "@/components/form";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { canActor } from "@/server/context";
import { getLogo } from "@/server/services/logo";
import { requireActor } from "@/server/session";
import { deleteLogoAction, renameOrgAction, uploadLogoAction } from "../../actions";

export const metadata = { title: "Configurações — AdsPilot" };

export default async function Configuracoes() {
  const { actor, orgs } = await requireActor();
  const org = orgs.find((o) => o.id === actor.organizationId)!;
  const logo = await getLogo(actor);
  const admin = canActor(actor, "org.settings");
  return (
    <>
      <PageHeader title="Configurações" subtitle="Dados da organização." />
      {admin ? (
        <div className="grid max-w-3xl gap-4">
          <Card className="max-w-md">
            <Form action={renameOrgAction} submit="Salvar">
              <Field label="Nome da organização" name="name" defaultValue={org.name} />
            </Form>
          </Card>
          <Card>
            <h2 className="mb-1 text-sm font-semibold">Logo da empresa</h2>
            <p className="mb-3 text-sm text-muted">Aparece no cabeçalho dos relatórios em PDF e XLSX e na visualização do relatório. PNG ou JPEG, de 64×64 a 4000×4000 pixels, até 1 MB. Fundo transparente (PNG) funciona melhor.</p>
            {logo ? (
              <div className="mb-4 flex flex-wrap items-center gap-4">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={`/api/logo?v=${logo.sha256.slice(0, 12)}`} alt={`Logo atual de ${org.name}`} className="max-h-16 max-w-[220px] rounded border border-line bg-white object-contain p-2" />
                <span className="text-xs text-muted">{logo.width}×{logo.height} px · {(logo.bytes / 1024).toFixed(0)} KB</span>
                <Form action={deleteLogoAction} submit="Remover logo" variant="danger" className="inline" confirm="Remover a logo da empresa? Os próximos relatórios sairão sem logo." />
              </div>
            ) : <p className="mb-3 text-sm text-muted">Nenhuma logo cadastrada.</p>}
            <Form action={uploadLogoAction} submit={logo ? "Trocar logo" : "Enviar logo"} variant="secondary" className="space-y-3">
              <div>
                <label htmlFor="logo-file" className="mb-1 block text-sm font-medium">Arquivo da logo</label>
                <input id="logo-file" name="logo" type="file" accept="image/png,image/jpeg" required className="block w-full text-sm file:mr-3 file:rounded-md file:border file:border-line file:bg-surface file:px-3 file:py-2 file:text-sm file:font-medium file:text-brand" />
              </div>
            </Form>
          </Card>
        </div>
      ) : <Alert tone="info">Somente administradores podem alterar as configurações.</Alert>}
    </>
  );
}
