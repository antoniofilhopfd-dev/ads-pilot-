import Link from "next/link";
import { NavLink } from "@/components/nav-link";
import { ROLE_LABEL } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { logoutAction, switchOrgAction } from "../actions";

const NAV: { group: string; items: { href: string; label: string }[] }[] = [
  { group: "Gestão", items: [{ href: "/app", label: "Painel" }, { href: "/app/campanhas", label: "Campanhas" }, { href: "/app/operacoes", label: "Operações" }, { href: "/app/clientes", label: "Clientes" }] },
  { group: "Planejamento", items: [{ href: "/app/orcamentos", label: "Orçamentos" }, { href: "/app/metas", label: "Metas" }] },
  { group: "Biblioteca", items: [{ href: "/app/publicos", label: "Públicos" }, { href: "/app/criativos", label: "Criativos" }, { href: "/app/rascunhos", label: "Rascunhos" }, { href: "/app/pastas", label: "Pastas e etiquetas" }] },
  { group: "Ferramentas", items: [{ href: "/app/utm", label: "UTMs" }, { href: "/app/checklists", label: "Checklists" }, { href: "/app/simuladores", label: "Simuladores" }, { href: "/app/experimentos", label: "Experimentos" }] },
  { group: "Análise", items: [{ href: "/app/relatorios", label: "Relatórios" }, { href: "/app/atividades", label: "Atividades" }] },
  { group: "Sistema", items: [{ href: "/app/integracoes", label: "Integrações" }, { href: "/app/mcp", label: "Assistentes (MCP)" }, { href: "/app/equipe", label: "Equipe" }, { href: "/app/configuracoes", label: "Configurações" }] },
];

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { user, actor, orgs } = await requireActor();
  return (
    <div className="min-h-screen md:flex">
      <a href="#conteudo" className="sr-only z-50 rounded-md bg-surface px-3 py-2 text-sm font-medium text-brand focus:not-sr-only focus:absolute focus:left-2 focus:top-2">Pular para o conteúdo</a>
      <aside className="bg-navy px-3 py-4 text-[#cbd5f5] md:fixed md:inset-y-0 md:w-56 md:overflow-y-auto">
        <p className="px-2 pb-3 text-lg font-bold text-white md:pb-5">Ads<span className="text-[#a99af0]">Pilot</span></p>
        <nav aria-label="Principal" className="flex gap-1 overflow-x-auto md:block">
          {NAV.map((g) => (
            <div key={g.group} role="group" aria-label={g.group} className="flex gap-1 md:mb-3 md:block">
              <p className="hidden px-3 pb-1 text-[11px] font-semibold uppercase tracking-wide text-[#8c98c9] md:block">{g.group}</p>
              {g.items.map((n) => <NavLink key={n.href} href={n.href}>{n.label}</NavLink>)}
            </div>
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
          {actor.allowedAccountIds !== null && <span className="rounded-full bg-[#fbf1dc] px-2.5 py-1 text-xs font-medium text-[#7a5200]">Acesso restrito a {actor.allowedAccountIds.length} conta(s)</span>}
          <Link href="/app/conta" className="text-sm text-muted hover:text-ink hover:underline">{user.name} · {ROLE_LABEL[actor.role]}</Link>
          <form action={logoutAction}><button className="rounded-md border border-line px-3 py-1.5 text-sm text-brand hover:bg-canvas">Sair</button></form>
        </header>
        <main id="conteudo" tabIndex={-1} className="px-4 py-6 md:px-7 focus:outline-none">{children}</main>
      </div>
    </div>
  );
}
