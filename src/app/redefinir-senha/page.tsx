import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Form } from "@/components/form";
import { Alert, Field } from "@/components/ui";
import { resetAction } from "../actions";

export const metadata = { title: "Redefinir senha — AdsPilot" };

export default async function Page({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return (
    <AuthShell title="Redefinir senha" footer={<Link className="font-medium text-brand underline" href="/login">Voltar para entrar</Link>}>
      {!token ? (
        <Alert tone="error">Link inválido. Solicite um novo em “Esqueci minha senha”.</Alert>
      ) : (
        <Form action={resetAction} submit="Redefinir senha">
          <input type="hidden" name="token" value={token} />
          <Field label="Nova senha" name="password" type="password" autoComplete="new-password" hint="Mínimo de 10 caracteres, com letras e números." />
          <Field label="Confirmar nova senha" name="confirm" type="password" autoComplete="new-password" />
        </Form>
      )}
    </AuthShell>
  );
}
