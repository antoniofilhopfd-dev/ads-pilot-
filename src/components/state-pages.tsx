"use client";
import Link from "next/link";
import { useEffect } from "react";
import { btnCls } from "./ui";

// Estados globais da aplicação: erro inesperado, página não encontrada e carregamento.
export function ErrorState({ error, reset, backHref = "/app" }: { error: Error & { digest?: string }; reset: () => void; backHref?: string }) {
  useEffect(() => { /* o erro já é registrado no servidor (instrumentation.ts) com o mesmo código */ }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold">Algo deu errado</h1>
      <p className="mt-2 text-sm text-muted">Não foi possível concluir esta ação. Seus dados não foram perdidos. Tente novamente; se o problema continuar, informe o código abaixo ao suporte.</p>
      {error.digest && <p className="mt-3 text-xs text-muted">Código do erro: <code className="rounded bg-canvas px-1.5 py-0.5 text-ink">{error.digest}</code></p>}
      <div className="mt-5 flex justify-center gap-3">
        <button onClick={reset} className={btnCls.primary}>Tentar novamente</button>
        <Link href={backHref} className={btnCls.secondary}>Voltar ao início</Link>
      </div>
    </div>
  );
}

export function NotFoundState({ backHref = "/app" }: { backHref?: string }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-line bg-surface p-8 text-center">
      <h1 className="text-lg font-semibold">Página ou item não encontrado</h1>
      <p className="mt-2 text-sm text-muted">O endereço pode estar incorreto, o item pode ter sido removido ou você pode não ter acesso a ele.</p>
      <div className="mt-5"><Link href={backHref} className={btnCls.primary}>Voltar ao início</Link></div>
    </div>
  );
}

export function LoadingState({ label = "Carregando…" }: { label?: string }) {
  return (
    <div role="status" aria-live="polite" className="space-y-4">
      <span className="sr-only">{label}</span>
      <div className="h-7 w-48 animate-pulse rounded bg-line" />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">{[0, 1, 2, 3].map((i) => <div key={i} className="h-24 animate-pulse rounded-xl border border-line bg-surface" />)}</div>
      <div className="h-64 animate-pulse rounded-xl border border-line bg-surface" />
    </div>
  );
}
