"use client";
import { startTransition, useActionState, useEffect, useRef, type ReactNode } from "react";
import { Alert, btnCls } from "./ui";

export type FormState = { error?: string; ok?: string } | undefined;

// Envia via onSubmit (e não via `action`) para o React 19 não limpar os campos após um erro.
// Em caso de sucesso com mensagem `ok`, o formulário é limpo.
export function Form({ action, children, submit, className = "space-y-4", variant = "primary", confirm }: { action: (s: FormState, f: FormData) => Promise<FormState>; children?: ReactNode; submit: string; className?: string; variant?: keyof typeof btnCls; confirm?: string }) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const ref = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) ref.current?.reset();
  }, [state]);
  return (
    <form
      ref={ref}
      className={className}
      onSubmit={(e) => {
        e.preventDefault();
        if (confirm && !window.confirm(confirm)) return;
        const data = new FormData(e.currentTarget);
        startTransition(() => formAction(data));
      }}
    >
      {state?.error && <Alert tone="error">{state.error}</Alert>}
      {state?.ok && <Alert tone="success">{state.ok}</Alert>}
      {children}
      <button type="submit" disabled={pending} className={btnCls[variant]}>
        {pending ? "Aguarde…" : submit}
      </button>
    </form>
  );
}
