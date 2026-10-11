import Link from "next/link";
import { Card, EmptyState, PageHeader, btnCls } from "@/components/ui";
import { listNotifications } from "@/server/alerts";
import { requireActor } from "@/server/session";
import { markReadAction } from "../../actions";

export const metadata = { title: "Notificações — AdsPilot" };

export default async function Notificacoes() {
  const { actor } = await requireActor();
  const list = await listNotifications(actor);
  const unread = list.filter((n) => !n.readAt).length;
  return (
    <>
      <PageHeader title="Notificações" subtitle="Avisos internos gerados pelos alertas. Envio por e-mail e WhatsApp depende de integrações externas ainda não configuradas."
        action={unread > 0 ? <form action={markReadAction}><button className={btnCls.secondary}>Marcar todas como lidas</button></form> : undefined} />
      {list.length === 0 ? <EmptyState title="Nenhuma notificação" /> : (
        <ul className="space-y-2">{list.map((n) => (
          <li key={n.id}><Card className={n.readAt ? "" : "border-violet"}>
            <p className="text-sm font-semibold">{!n.readAt && <span className="mr-2 inline-block h-2 w-2 rounded-full bg-violet" aria-label="Não lida" />}{n.title}</p>
            <p className="text-sm text-muted">{n.body}</p>
            <p className="mt-1 text-xs text-muted">{n.createdAt.toLocaleString("pt-BR")}{n.href && <> · <Link className="text-brand hover:underline" href={n.href}>Ver alertas</Link></>}</p>
          </Card></li>))}</ul>)}
    </>
  );
}
