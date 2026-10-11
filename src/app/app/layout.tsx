import Link from "next/link";
import { ROLE_LABEL } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { logoutAction, switchOrgAction } from "../actions";

const NAV = [
  { href: "/app", label: "Painel" },
  { href: "/app/campanhas", label: "Campanhas" },
  { href: "/app/clientes", label: "Clientes" },
  { href: "/app/integracoes", label: "Integrações" },
  { href: "/app/equipe", label: "Equipe" },
  { href: "/app/atividades", label: "Atividades" },
  { href: "/app/configuracoes", label: "Configurações" },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, actor, orgs } = await requireActor();
  return (
    <div className="min-h-screen md:flex">
      <aside className="bg-navy px-3 py-4 text-[#cbd5f5] md:fixed md:inset-y-0 md:w-56">
        <p className="px-2 pb-3 text-lg font-bold text-white md:pb-5">Ads<span className="text-[#a99af0]">Pilot</span></p>
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:block">
          {NAV.map((n) => (
            <Link key={n.href} href={n.href} className="block whitespace-nowrap rounded-md px-3 py-2 text-sm hover:bg-white/10 hover:text-white">
              {n.label}
            </Link>
          ))}
        </nav>
      </aside>
      <div className="min-w-0 flex-1 md:ml-56">
        <header className="flex flex-wrap items-center gap-3 border-b border-line bg-surface px-4 py-3 md:px-7">
          <form action={switchOrgAction} className="flex items-center gap-2">
            <label htmlFor="organizationId" className="text-sm text-muted">Organização</label>
            <select id="organizationId" name="organizationId" defaultValue={actor.organizationId} className="rounded-md border border-line bg-surface px-2 py-1.5 text-sm">
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
            <button className="rounded-md border border-line px-2 py-1.5 text-sm text-brand hover:bg-canvas">Trocar</button>
          </form>
          <span className="flex-1" />
          <Link href="/app/conta" className="text-sm text-muted hover:text-ink hover:underline">{user.name} · {ROLE_LABEL[actor.role]}</Link>
          <form action={logoutAction}><button className="rounded-md border border-line px-3 py-1.5 text-sm text-brand hover:bg-canvas">Sair</button></form>
        </header>
        <main className="px-4 py-6 md:px-7">{children}</main>
      </div>
    </div>
  );
}
