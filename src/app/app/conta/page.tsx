import { Form } from "@/components/form";
import { Alert, Card, Field, PageHeader } from "@/components/ui";
import { requireUser } from "@/server/session";
import { changePasswordAction, deleteAccountAction, updateProfileAction } from "../../actions";

export const metadata = { title: "Minha conta — AdsPilot" };

export default async function Conta() {
  const user = await requireUser();
  return (
    <>
      <PageHeader title="Minha conta" subtitle={user.email} />
      <div className="grid max-w-4xl gap-4 md:grid-cols-2">
        <Card><h2 className="mb-3 text-sm font-semibold">Perfil</h2>
          <Form action={updateProfileAction} submit="Salvar"><Field label="Nome" name="name" id="profile-name" defaultValue={user.name} /></Form></Card>
        <Card><h2 className="mb-3 text-sm font-semibold">Alterar senha</h2>
          <Form action={changePasswordAction} submit="Alterar senha">
            <Field label="Senha atual" name="current" id="pw-current" type="password" autoComplete="current-password" />
            <Field label="Nova senha" name="password" id="pw-new" type="password" autoComplete="new-password" hint="Mínimo de 10 caracteres, com letras e números." />
            <Field label="Confirmar nova senha" name="confirm" id="pw-confirm" type="password" autoComplete="new-password" />
          </Form></Card>
        <Card><h2 className="mb-2 text-sm font-semibold">Meus dados (LGPD)</h2>
          <p className="mb-3 text-sm text-muted">Baixe uma cópia dos seus dados pessoais: perfil, organizações a que pertence e o histórico das suas ações.</p>
          <a className="inline-flex rounded-md border border-line bg-surface px-4 py-2 text-sm font-medium text-brand hover:bg-canvas" href="/api/conta/exportar" download>Baixar meus dados (JSON)</a></Card>
        <Card><h2 className="mb-2 text-sm font-semibold text-danger">Excluir conta</h2>
          <div className="mb-3"><Alert tone="error">Ação permanente. Organizações em que você é o único membro serão excluídas com todos os clientes e dados. O histórico de auditoria é mantido sem identificar você.</Alert></div>
          <Form action={deleteAccountAction} submit="Excluir minha conta" variant="danger" confirm="Excluir a conta definitivamente? Isso não pode ser desfeito.">
            <Field label="Confirme sua senha" name="password" id="delete-password" type="password" autoComplete="current-password" />
          </Form></Card>
      </div>
    </>
  );
}
