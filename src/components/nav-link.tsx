"use client";
import Link, { useLinkStatus } from "next/link";

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? (
    <span role="status" className="ml-2 inline-flex items-center gap-1 text-xs text-[#a99af0]">
      <span aria-hidden className="inline-block h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
      <span>Carregando…</span>
    </span>
  ) : null;
}

// Link do menu com indicador de carregamento durante a navegação (não altera o status HTTP da página de destino).
export function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link href={href} className="flex items-center whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-white/10 hover:text-white">
      {children}
      <Pending />
    </Link>
  );
}
