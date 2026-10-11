import Link from "next/link";
import { AuthShell } from "@/components/auth-shell";
import { Form } from "@/components/form";
import { Field } from "@/components/ui";
import { forgotAction } from "../actions";

export const metadata = { title: "Recuperar senha — AdsPilot" };

export default function Page() {
  return (
    <AuthShell title="Recuperar senha" subtitle="Informe seu e-mail para receber o link de redefinição." footer={<Link className="font-medium text-brand underline" href="/login">Voltar para entrar</Link>}>
      <Form action={forgotAction} submit="Enviar link">
        <Field label="E-mail" name="email" type="email" autoComplete="email" />
      </Form>
    </AuthShell>
  );
}
