import Link from "next/link";
import { Card, EmptyState, PageHeader, btnCls } from "@/components/ui";
import { listClients } from "@/server/services/clients";
import { listMembers } from "@/server/services/organizations";
import { requireActor } from "@/server/session";

export const metadata = { title: "Painel — AdsPilot" };

export default async function Painel() {
  const { actor } = await requireActor();
  const [clients, members] = await Promise.all([listClients(actor), listMembers(actor)]);
  return (
    <>
      <PageHeader title="Painel" subtitle="Visão geral da organização." />
      <div className="mb-5 grid gap-3 sm:grid-cols-2">
        <Card><p className="text-xs text-muted">Clientes</p><p className="num mt-1 text-2xl font-semibold">{clients.length}</p></Card>
        <Card><p className="text-xs text-muted">Membros da equipe</p><p className="num mt-1 text-2xl font-semibold">{members.length}</p></Card>
      </div>
      <EmptyState
        title="Nenhuma conta de anúncios conectada"
        action={<Link href="/app/clientes" className={btnCls.secondary}>Gerenciar clientes</Link>}
      >
        A conexão com a Meta Ads e os indicadores de gasto, resultados e campanhas serão adicionados na Etapa 03. Até lá, este painel não exibe dados de anúncios.
      </EmptyState>
    </>
  );
}
