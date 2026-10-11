import Link from "next/link";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { Form } from "@/components/form";
import { Field } from "@/components/ui";
import { currentUser } from "@/server/session";
import { registerAction } from "../actions";

export const metadata = { title: "Criar conta — AdsPilot" };

export default async function CadastroPage() {
  if (await currentUser()) redirect("/app");
  return (
    <AuthShell title="Criar conta" subtitle="Você será o administrador da nova organização." footer={<>Já tem conta? <Link className="font-medium text-brand underline" href="/login">Entrar</Link></>}>
      <Form action={registerAction} submit="Criar conta">
        <Field label="Seu nome" name="name" autoComplete="name" />
        <Field label="Nome da organização" name="organizationName" hint="Sua agência ou empresa." />
        <Field label="E-mail" name="email" type="email" autoComplete="email" />
        <Field label="Senha" name="password" type="password" autoComplete="new-password" hint="Mínimo de 10 caracteres, com letras e números." />
      </Form>
      <p className="mt-4 text-xs text-muted">Ao criar a conta você concorda com os <a className="underline" href="/termos">Termos</a> e a <a className="underline" href="/privacidade">Política de Privacidade</a> (minutas).</p>
    </AuthShell>
  );
}
