import { Form } from "@/components/form";
import { Alert, Badge, Card, EmptyState, PageHeader, Td, Th, btnCls, inputCls } from "@/components/ui";
import { listClients } from "@/server/services/clients";
import { getConnection, listAccounts } from "@/server/meta/connection";
import { getHealth } from "@/server/meta/health";
import { recentRuns } from "@/server/meta/sync";
import { can } from "@/server/permissions";
import { requireActor } from "@/server/session";
import { configureAccountAction, connectDemoAction, disconnectAction, refreshAccountsAction, syncAccountAction, syncAllAction } from "../../actions";
import type { SP } from "@/server/params";

export const metadata = { title: "Integrações — AdsPilot" };

const RUN_TONE = { success: "ok", partial: "warn", failed: "danger", interrupted: "danger", running: "neutral" } as const;
const RUN_LABEL = { success: "Sucesso", partial: "Parcial", failed: "Falhou", interrupted: "Interrompida", running: "Em andamento" } as const;
const STATE_LABEL = { ok: ["ok", "Saudável"], attention: ["warn", "Atenção"], critical: ["danger", "Ação necessária"], none: ["neutral", "Não conectada"] } as const;
const fmt = (d: Date | null | undefined) => (d ? d.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "—");

export default async function Integracoes({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor } = await requireActor();
  const sp = await searchParams;
  const [conn, health, accounts, runs, clients] = await Promise.all([getConnection(actor), getHealth(actor), listAccounts(actor), recentRuns(actor), listClients(actor)]);
  const canConnect = can(actor.role, "meta.connect");
  const canSync = can(actor.role, "meta.sync");
  const oauthReady = !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
  const [tone, stateLabel] = STATE_LABEL[health.state];
  const errMsg = typeof sp.erro === "string" ? sp.erro : null;

  return (
    <>
      <PageHeader title="Integrações" subtitle="Conexão com a Meta Ads, contas acompanhadas e saúde da sincronização." action={<Badge tone={tone}>{stateLabel}</Badge>} />
      {errMsg && <div className="mb-4"><Alert tone="error">{errMsg}</Alert></div>}
      {sp.ok && <div className="mb-4"><Alert tone="success">Meta conectada com sucesso.</Alert></div>}

      <div className="mb-4 grid gap-4 lg:grid-cols-[1fr_380px]">
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Conexão</h2>
          {!conn ? (
            <>
              <p className="mb-3 text-sm text-muted">Nenhuma conexão. Conecte a Meta Ads para sincronizar contas, campanhas e métricas.</p>
              {canConnect ? (
                <div className="space-y-3">
                  {oauthReady ? <a className={btnCls.primary} href="/api/meta/oauth/start">Conectar com a Meta</a>
                    : <Alert tone="info">Conexão real indisponível: o app da Meta ainda não está configurado neste ambiente (META_APP_ID / META_APP_SECRET).</Alert>}
                  <Form action={connectDemoAction} submit="Ativar modo demonstração (dados simulados)" variant="secondary" className="space-y-2" />
                </div>
              ) : <Alert tone="info">Somente administradores podem conectar.</Alert>}
            </>
          ) : (
            <dl className="grid grid-cols-[170px_1fr] gap-y-2 text-sm">
              <dt className="text-muted">Tipo</dt><dd>{conn.mode === "demo" ? <Badge tone="warn">Demonstração — dados simulados</Badge> : <Badge tone="ok">Meta (API oficial)</Badge>}</dd>
              <dt className="text-muted">Estado da conexão</dt><dd>{conn.status === "active" ? "Ativa" : conn.status === "needs_reconnect" ? "Reconexão necessária" : conn.status === "revoked" ? "Desconectada" : "Com erro"}</dd>
              {conn.mode === "meta" && <><dt className="text-muted">Permissões</dt><dd>{(conn.grantedScopes ?? []).join(", ") || "—"}{health.connection?.missingScopes.length ? <span className="text-danger"> · faltando: {health.connection.missingScopes.join(", ")}</span> : null}</dd>
              <dt className="text-muted">Token expira em</dt><dd>{conn.tokenExpiresAt ? `${fmt(conn.tokenExpiresAt)}` : "Não informado"}</dd></>}
              {conn.lastError && <><dt className="text-muted">Último erro</dt><dd className="text-danger">{conn.lastError}</dd></>}
            </dl>
          )}
          {conn && canConnect && (
            <div className="mt-4 flex flex-wrap gap-2">
              {conn.mode === "meta" && oauthReady && <a className={btnCls.secondary} href="/api/meta/oauth/start">Reconectar</a>}
              <Form action={refreshAccountsAction} submit="Atualizar lista de contas" variant="secondary" className="inline" />
              <Form action={disconnectAction} submit={conn.mode === "demo" ? "Remover demonstração e dados simulados" : "Desconectar"} variant="danger" className="inline" confirm={conn.mode === "demo" ? "Remover a conexão de demonstração e todos os dados simulados?" : "Desconectar a Meta? O token será apagado; o histórico de dados é mantido."} />
            </div>
          )}
        </Card>
        <Card>
          <h2 className="mb-3 text-sm font-semibold">Saúde da integração</h2>
          {health.instructions.length === 0 ? <p className="text-sm text-ok">Conexão ativa e dados dentro do prazo.</p> : (
            <ul className="list-disc space-y-1.5 pl-5 text-sm">{health.instructions.map((i, k) => <li key={k}>{i}</li>)}</ul>
          )}
          <p className="mt-3 text-xs text-muted">“Conexão ativa” não significa dados atualizados: os dois são verificados separadamente (limite de {24} h).</p>
        </Card>
      </div>

      <Card className="mb-4 overflow-x-auto p-0">
        <div className="flex flex-wrap items-center justify-between gap-2 px-5 pt-4">
          <h2 className="text-sm font-semibold">Contas de anúncios</h2>
          {canSync && accounts.some((a) => a.isSelected) && <Form action={syncAllAction} submit="Sincronizar todas as selecionadas" className="inline" />}
        </div>
        {accounts.length === 0 ? <div className="p-5"><EmptyState title="Nenhuma conta disponível">Conecte a Meta para listar as contas acessíveis.</EmptyState></div> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr><Th>Conta</Th><Th>Acompanhar / Cliente</Th><Th>Última sync bem-sucedida</Th><Th>Última tentativa</Th><Th right>Ações</Th></tr></thead>
            <tbody>
              {accounts.map((a) => {
                const h = health.accounts.find((x) => x.id === a.id);
                return (
                  <tr key={a.id}>
                    <Td className="font-medium">{a.name}<p className="text-xs font-normal text-muted">{a.externalId} · {a.currency}</p></Td>
                    <Td>
                      {canConnect ? (
                        <Form action={configureAccountAction} submit="Salvar" variant="secondary" className="flex flex-wrap items-center gap-2">
                          <input type="hidden" name="accountId" value={a.id} />
                          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="selected" defaultChecked={a.isSelected} /> Acompanhar</label>
                          <select name="clientId" defaultValue={a.clientId ?? ""} aria-label={`Cliente de ${a.name}`} className={`${inputCls} !w-auto`}>
                            <option value="">Sem cliente</option>{clients.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
                          </select>
                        </Form>
                      ) : <>{a.isSelected ? "Acompanhada" : "Não acompanhada"}{a.clientId ? ` · ${clients.find((c) => c.id === a.clientId)?.name ?? ""}` : ""}</>}
                    </Td>
                    <Td className="num">{h?.lastSuccess ? `${fmt(h.lastSuccess.at)}` : "Nunca"}{h?.stale && <> <Badge tone="warn">desatualizado</Badge></>}</Td>
                    <Td className="num">{h?.lastAttempt ? <>{fmt(h.lastAttempt.at)} <Badge tone={RUN_TONE[h.lastAttempt.status]}>{RUN_LABEL[h.lastAttempt.status]}</Badge></> : "—"}</Td>
                    <Td right>{canSync && a.isSelected ? <Form action={syncAccountAction} submit="Sincronizar" variant="secondary" className="inline"><input type="hidden" name="accountId" value={a.id} /></Form> : null}</Td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>

      <Card className="mb-4 overflow-x-auto p-0">
        <h2 className="px-5 pt-4 text-sm font-semibold">Histórico de sincronizações</h2>
        {runs.length === 0 ? <p className="p-5 text-sm text-muted">Nenhuma sincronização executada.</p> : (
          <table className="mt-2 w-full text-sm">
            <thead><tr><Th>Início</Th><Th>Conta</Th><Th>Período</Th><Th>Resultado</Th><Th right>Campanhas</Th><Th right>Linhas de métricas</Th><Th right>Tentativas</Th><Th>Erro</Th></tr></thead>
            <tbody>
              {runs.map(({ run, accountName }) => (
                <tr key={run.id}>
                  <Td className="num">{fmt(run.startedAt)}</Td><Td>{accountName}</Td><Td className="num">{run.rangeSince.split("-").reverse().join("/")} → {run.rangeUntil.split("-").reverse().join("/")}</Td>
                  <Td><Badge tone={RUN_TONE[run.status]}>{RUN_LABEL[run.status]}</Badge></Td>
                  <Td right>{run.counts?.campaigns ?? "—"}</Td><Td right>{run.counts?.insightRows ?? "—"}</Td><Td right>{run.attempts}</Td>
                  <Td className="max-w-xs text-xs text-muted">{run.errorMessage ?? ""}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <Card>
        <h2 className="mb-2 text-sm font-semibold">Metodologia das métricas</h2>
        <ul className="list-disc space-y-1 pl-5 text-sm text-muted">
          <li><b className="text-ink">Origem:</b> API oficial da Meta (Marketing API), nível de campanha, por dia, no fuso da conta de anúncios. Valores podem ser revisados pela Meta após alguns dias; cada sincronização reescreve o período.</li>
          <li><b className="text-ink">Ausente ≠ zero:</b> se a Meta não informa um valor, o AdsPilot mostra “—”. Totais somam apenas valores informados; sem nenhum valor, o total é “—”.</li>
          <li><b className="text-ink">Razões</b> (CTR = cliques ÷ impressões; CPC = gasto ÷ cliques; CPM = gasto ÷ impressões × 1000) são recalculadas a partir dos totais, nunca por média de razões.</li>
          <li><b className="text-ink">Resultado:</b> ação do objetivo da campanha — vendas = compras, cadastros = leads, tráfego = cliques no link, engajamento = engajamentos com a publicação. Outros objetivos: resultado não calculado.</li>
          <li><b className="text-ink">Custo por resultado</b> = gasto ÷ resultados, só nos dias com gasto e resultado informados. <b className="text-ink">ROAS</b> = valor de compras ÷ gasto, só com valor de compra informado pela Meta.</li>
          <li><b className="text-ink">Alcance e frequência</b> não são somáveis entre dias; por isso só aparecem em recortes de um dia.</li>
          <li><b className="text-ink">Atribuição:</b> janela padrão da conta na Meta; resultados podem mudar com o tempo e diferem do Gerenciador de Anúncios se houver outra janela.</li>
        </ul>
      </Card>
    </>
  );
}
