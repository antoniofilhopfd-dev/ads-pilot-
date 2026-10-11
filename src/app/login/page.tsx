import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Form } from "@/components/form";
import { Alert, Field } from "@/components/ui";
import { currentUser } from "@/server/session";
import { loginAction } from "../actions";

export const metadata = { title: "Entrar — AdsPilot" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ redefinida?: string }> }) {
  if (await currentUser()) redirect("/app");
  const sp = await searchParams;
  return (
    <AuthShell title="Entrar" footer={<>Ainda não tem conta? <Link className="font-medium text-brand underline" href="/cadastro">Criar conta</Link></>}>
      {sp.redefinida && <div className="mb-4"><Alert tone="success">Senha redefinida. Entre com a nova senha.</Alert></div>}
      <Form action={loginAction} submit="Entrar">
        <Field label="E-mail" name="email" type="email" autoComplete="email" />
        <Field label="Senha" name="password" type="password" autoComplete="current-password" />
        <p className="text-sm"><Link className="text-brand underline" href="/recuperar-senha">Esqueci minha senha</Link></p>
      </Form>
    </AuthShell>
  );
}
