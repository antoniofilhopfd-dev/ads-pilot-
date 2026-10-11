import { ConfirmButton } from "@/components/confirm-button";
import { Form } from "@/components/form";
import { Alert, Badge, Card, EmptyState, PageHeader, btnCls, inputCls } from "@/components/ui";
import { canActor } from "@/server/context";
import { evolutionConfig, listOutbox } from "@/server/notify/evolution";
import { listRecipients } from "@/server/notify/recipients";
import { requireActor } from "@/server/session";
import { addRecipientAction, removeRecipientAction, testRecipientAction } from "../../actions";

export const metadata = { title: "Canais de aviso — AdsPilot" };
const ST = { pending: ["neutral", "Na fila"], sending: ["neutral", "Enviando"], sent: ["ok", "Enviada"], failed: ["danger", "Falhou"], blocked: ["warn", "Bloqueada (canal não configurado)"], uncertain: ["warn", "Incerta (confirme no aparelho)"] } as const;

export default async function Canais() {
  const { actor } = await requireActor();
  const manage = canActor(actor, "budgets.manage");
  const [recipients, box] = await Promise.all([listRecipients(actor), listOutbox(actor.organizationId)]);
  const wa = !!evolutionConfig();
  return (
    <>
      <PageHeader title="Canais de aviso" subtitle="Alertas críticos podem ser enviados por WhatsApp. Os avisos dentro do AdsPilot (sino) funcionam sempre." />
      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <Card><p className="text-sm font-semibold">WhatsApp (Evolution API)</p><p className="mt-1"><Badge tone={wa ? "ok" : "warn"}>{wa ? "Configurado (não validado com instância real)" : "Não configurado"}</Badge></p>
          <p className="mt-2 text-xs text-muted">{wa ? "Variáveis EVOLUTION_* definidas neste servidor. O envio real depende de uma instância Evolution conectada." : "Defina EVOLUTION_API_URL, EVOLUTION_API_KEY e EVOLUTION_INSTANCE no servidor. Enquanto isso, as mensagens ficam na fila como “bloqueadas” e nada é enviado."}</p></Card>
        <Card><p className="text-sm font-semibold">E-mail</p><p className="mt-1"><Badge tone="warn">Não implementado</Badge></p><p className="mt-2 text-xs text-muted">Depende de um servidor SMTP (pendência externa). Recuperação de senha e convites por e-mail ficam para essa etapa.</p></Card>
      </div>
      <div className="grid gap-4 lg:grid-cols-[1fr_360px]">
        <div className="space-y-4">
          <Card>
            <h2 className="mb-3 text-sm font-semibold">Destinatários do WhatsApp</h2>
            {recipients.length === 0 ? <EmptyState title="Nenhum destinatário" /> : (
              <ul className="space-y-3">{recipients.map((r) => (
                <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
                  <span><strong>{r.name}</strong> <span className="text-muted">{r.phoneMasked} · a partir de “{r.minSeverity === "critical" ? "crítico" : r.minSeverity === "warning" ? "atenção" : "info"}”</span></span>
                  {manage && <span className="flex items-center gap-2">
                    <Form action={testRecipientAction} submit="Enviar teste" variant="secondary" className="inline"><input type="hidden" name="recipientId" value={r.id} /></Form>
                    <form action={removeRecipientAction}><input type="hidden" name="recipientId" value={r.id} /><ConfirmButton message={`Remover ${r.name}?`} className={btnCls.danger}>Remover</ConfirmButton></form></span>}
                </li>))}</ul>)}
            <p className="mt-3 text-xs text-muted">Números completos nunca aparecem na tela. Destinatários recebem alertas da organização inteira — cadastre só quem pode ver todas as contas.</p>
          </Card>
          <Card className="overflow-x-auto p-0">
            <h2 className="px-5 pt-4 text-sm font-semibold">Histórico de envios</h2>
            {box.length === 0 ? <p className="px-5 py-4 text-sm text-muted">Nada enviado ainda.</p> : (
              <table className="mt-2 w-full text-sm"><thead><tr><th className="px-5 py-2 text-left text-xs text-muted">Quando</th><th className="px-3 py-2 text-left text-xs text-muted">Para</th><th className="px-3 py-2 text-left text-xs text-muted">Situação</th><th className="px-3 py-2 text-left text-xs text-muted">Detalhe</th></tr></thead>
                <tbody>{box.map(({ o, name }) => <tr key={o.id}><td className="num border-t border-line px-5 py-2">{o.createdAt.toLocaleString("pt-BR")}</td><td className="border-t border-line px-3 py-2">{name}</td><td className="border-t border-line px-3 py-2"><Badge tone={ST[o.status][0]}>{ST[o.status][1]}</Badge></td><td className="border-t border-line px-3 py-2 text-xs text-muted">{o.lastError ?? o.body.split("\n")[0]}</td></tr>)}</tbody></table>)}
          </Card>
        </div>
        {manage ? (
          <Card className="h-fit"><h2 className="mb-3 text-sm font-semibold">Novo destinatário</h2>
            <Form action={addRecipientAction} submit="Cadastrar">
              <label className="block text-sm font-medium">Nome<input name="name" required className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">WhatsApp (DDI+DDD+número)<input name="phone" required inputMode="tel" placeholder="5511912345678" className={`${inputCls} mt-1`} /></label>
              <label className="block text-sm font-medium">Receber a partir de<select name="gravidade" defaultValue="critical" className={`${inputCls} mt-1`}><option value="critical">Crítico</option><option value="warning">Atenção</option></select></label>
            </Form></Card>
        ) : <Alert tone="info">Somente administradores e gestores gerenciam destinatários.</Alert>}
      </div>
    </>
  );
}
