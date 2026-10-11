import { LineChart } from "./charts";
import { Alert, Badge, Card, Td, Th } from "./ui";
import { objectiveLabel, statusInfo } from "@/lib/labels";
import { brl, brl0, int, pct, ratio } from "@/lib/metrics";
import { fmtValue } from "@/server/reports/table";
import { SECTION_LABEL, type Report } from "@/server/reports/types";

const d = (s: string) => s.split("-").reverse().join("/");
const dt = (x: Date | null) => (x ? x.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }) : "nunca");

export function ReportView({ r }: { r: Report }) {
  const S = new Set(r.config.sections), m = r.meta, cur = m.currency;
  return (
    <article aria-label={r.title} className="space-y-4">
      <header>
        {m.logo && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={`/api/logo?v=${m.logo.sha256.slice(0, 12)}`} alt={`Logo de ${m.organization}`} className="mb-3 max-h-14 max-w-[240px] object-contain" />
        )}
        <p className="text-sm text-muted">{m.organization}{m.client ? ` · Cliente: ${m.client}` : ""}{m.account ? ` · Conta: ${m.account}` : ""}</p>
        <p className="text-sm text-muted">Período analisado: <b className="text-ink">{d(m.since)} a {d(m.until)}</b> · Gerado em {dt(m.generatedAt)} · Última sincronização: <b className={m.stale ? "text-[#7a5200]" : "text-ink"}>{dt(m.lastSyncedAt)}{m.stale ? " (desatualizado)" : ""}</b></p>
      </header>
      {m.isDemo && <Alert tone="info"><strong>DADOS SIMULADOS</strong> (modo demonstração): não vêm da Meta e não representam resultados reais.</Alert>}
      {!m.hasData && <Alert tone="info">Não há métricas sincronizadas para estes filtros e período.</Alert>}

      {S.has("summary") && (
        <Card><h2 className="mb-2 text-sm font-semibold">{SECTION_LABEL.summary}</h2>
          <ul className="space-y-1.5 text-sm">
            {r.facts.map((x, i) => <li key={`f${i}`}><Badge tone="ok">Fato</Badge> {x}</li>)}
            {r.hypotheses.map((x, i) => <li key={`h${i}`}><Badge tone="warn">Hipótese</Badge> {x.replace(/^HIPÓTESE \(não comprovada\): /, "")} <span className="text-muted">(não comprovada)</span></li>)}
            {r.recommendations.map((x, i) => <li key={`r${i}`}><Badge>Recomendação</Badge> {x}</li>)}
          </ul></Card>
      )}

      {(S.has("kpis") || S.has("comparison")) && (
        <Card className="overflow-x-auto p-0"><h2 className="px-5 pt-4 text-sm font-semibold">{S.has("comparison") ? "Indicadores e comparação com o período anterior" : SECTION_LABEL.kpis}</h2>
          <table className="mt-2 w-full text-sm"><thead><tr><Th>Indicador</Th><Th right>Período atual</Th>{S.has("comparison") && <><Th right>Período anterior</Th><Th right>Variação</Th></>}</tr></thead>
            <tbody>{r.kpis.map((k) => (
              <tr key={k.key}><Td>{k.label}</Td><Td right>{fmtValue(k.value, k.format, cur)}</Td>
                {S.has("comparison") && <><Td right>{fmtValue(k.prev, k.format, cur)}</Td><Td right>{k.change === null ? "—" : `${k.change >= 0 ? "▲" : "▼"} ${Math.abs(k.change).toFixed(1).replace(".", ",")}%`}</Td></>}</tr>))}</tbody></table>
          {S.has("comparison") && !m.prevComparable && <p className="px-5 pb-3 text-xs text-muted">Comparação omitida: período anterior não totalmente sincronizado.</p>}
        </Card>
      )}

      {S.has("charts") && (
        <div className="grid gap-3 md:grid-cols-2">
          <Card><h2 className="mb-2 text-sm font-semibold">Gasto por dia</h2><LineChart data={r.daily.map((x) => ({ date: x.date, value: x.spend }))} label="Gasto por dia" format={(v) => brl0(v, cur)} /></Card>
          <Card><h2 className="mb-2 text-sm font-semibold">Resultados por dia</h2><LineChart data={r.daily.map((x) => ({ date: x.date, value: x.results }))} label="Resultados por dia" format={(v) => int(v)} color="#7557D9" /></Card>
        </div>
      )}

      {S.has("breakdown") && r.breakdown.length > 0 && (
        <Card className="overflow-x-auto p-0"><h2 className="px-5 pt-4 text-sm font-semibold">{r.config.type === "client" ? "Desempenho por cliente" : "Desempenho por conta"}</h2>
          <table className="mt-2 w-full text-sm"><thead><tr><Th>Nome</Th><Th right>Gasto</Th><Th right>Resultados</Th><Th right>Custo/result.</Th><Th right>CTR</Th></tr></thead>
            <tbody>{r.breakdown.map((b) => <tr key={b.label}><Td className="font-medium">{b.label}</Td><Td right>{brl(b.spend, cur)}</Td><Td right>{int(b.results)}</Td><Td right>{brl(b.costPerResult, cur)}</Td><Td right>{pct(b.ctr)}</Td></tr>)}</tbody></table></Card>
      )}

      {S.has("campaigns") && (
        <Card className="overflow-x-auto p-0"><h2 className="px-5 pt-4 text-sm font-semibold">Campanhas ({r.campaigns.length})</h2>
          <table className="mt-2 w-full text-sm"><thead><tr><Th>Campanha</Th><Th>Status</Th><Th>Objetivo</Th><Th right>Gasto</Th><Th right>Resultados</Th><Th right>Custo/result.</Th><Th right>CTR</Th><Th right>ROAS</Th></tr></thead>
            <tbody>{r.campaigns.map((c) => { const s = statusInfo(c.effectiveStatus); return (
              <tr key={c.id}><Td className="font-medium">{c.name}<p className="text-xs font-normal text-muted">{c.accountName}</p></Td><Td><Badge tone={s.tone}>{s.label}</Badge></Td><Td>{objectiveLabel(c.objective)}</Td>
                <Td right>{brl(c.totals.spend, c.currency)}</Td><Td right>{int(c.totals.results)}</Td><Td right>{brl(c.totals.costPerResult, c.currency)}</Td><Td right>{pct(c.totals.ctr)}</Td><Td right>{ratio(c.totals.roas)}</Td></tr>); })}</tbody></table>
          <p className="px-5 pb-3 text-xs text-muted">“—” = a Meta não informou o dado (não é zero).</p></Card>
      )}

      {S.has("variations") && (
        <Card className="overflow-x-auto p-0"><h2 className="px-5 pt-4 text-sm font-semibold">{SECTION_LABEL.variations}</h2>
          {r.variations.length === 0 ? <p className="p-5 text-sm text-muted">{m.prevComparable ? "Nenhuma variação de 20% ou mais (base mínima de R$ 50 no período anterior)." : "Indisponível: período anterior não totalmente sincronizado."}</p> : (
            <table className="mt-2 w-full text-sm"><thead><tr><Th>Campanha</Th><Th>Métrica</Th><Th right>Atual</Th><Th right>Anterior</Th><Th right>Variação</Th></tr></thead>
              <tbody>{r.variations.map((v, i) => <tr key={i}><Td className="font-medium">{v.name}</Td><Td>{v.metric}</Td><Td right>{fmtValue(v.curr, v.format, cur)}</Td><Td right>{fmtValue(v.prev, v.format, cur)}</Td><Td right>{v.change >= 0 ? "▲" : "▼"} {Math.abs(v.change).toFixed(0)}%</Td></tr>)}</tbody></table>)}</Card>
      )}

      {S.has("budget") && (
        <Card className="overflow-x-auto p-0"><h2 className="px-5 pt-4 text-sm font-semibold">{SECTION_LABEL.budget}</h2>
          <table className="mt-2 w-full text-sm"><thead><tr><Th>Campanha</Th><Th right>Orçamento diário (Meta)</Th><Th right>Gasto (Meta)</Th><Th right>Média diária</Th><Th right>Previsão 30 d (estimativa)</Th></tr></thead>
            <tbody>{r.budget.map((b) => <tr key={b.campaign}><Td className="font-medium">{b.campaign}</Td><Td right>{brl(b.configuredDaily, cur)}</Td><Td right>{brl(b.spend, cur)}</Td><Td right>{brl(b.avgDaily, cur)}</Td><Td right>{brl(b.projected30, cur)}</Td></tr>)}</tbody></table>
          <p className="px-5 pb-3 text-xs text-muted">Previsão = média diária × 30 (estimativa do AdsPilot). Limites internos não bloqueiam gasto na Meta.</p></Card>
      )}

      {S.has("alerts") && (
        <Card><h2 className="mb-2 text-sm font-semibold">{SECTION_LABEL.alerts}</h2>
          {r.alerts.length === 0 ? <p className="text-sm text-muted">Nada a sinalizar com base nos dados sincronizados.</p> : <ul className="space-y-2 text-sm">{r.alerts.map((a, i) => <li key={i}><Badge tone={a.tone}>{a.tone === "danger" ? "Crítico" : "Atenção"}</Badge> <b>{a.title}</b><p className="text-xs text-muted">{a.detail}</p></li>)}</ul>}</Card>
      )}

      {S.has("changes") && (
        <Card className="overflow-x-auto p-0"><h2 className="px-5 pt-4 text-sm font-semibold">{SECTION_LABEL.changes}</h2>
          {r.changes.length === 0 ? <p className="p-5 text-sm text-muted">Nenhuma operação registrada no período.</p> : (
            <table className="mt-2 w-full text-sm"><thead><tr><Th>Quando</Th><Th>Alteração</Th><Th>Quem</Th><Th>Resultado</Th></tr></thead>
              <tbody>{r.changes.map((c, i) => <tr key={i}><Td className="num">{dt(c.at)}</Td><Td>{c.what}{c.mode === "demo" ? " (simulação)" : ""}</Td><Td>{c.who ?? "—"}</Td><Td>{c.result}</Td></tr>)}</tbody></table>)}</Card>
      )}

      {S.has("health") && (
        <Card><h2 className="mb-2 text-sm font-semibold">{SECTION_LABEL.health}</h2><p className="mb-2 text-sm">Estado geral: <Badge tone={r.health.state === "ok" ? "ok" : r.health.state === "attention" ? "warn" : "danger"}>{r.health.state}</Badge></p>
          <ul className="list-disc space-y-1 pl-5 text-sm">{r.health.instructions.map((i, k) => <li key={k}>{i}</li>)}</ul></Card>
      )}

      {S.has("recommendations") && r.limitations.length > 0 && (
        <Card><h2 className="mb-2 text-sm font-semibold">Limitações</h2><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{r.limitations.map((x, i) => <li key={i}>{x}</li>)}</ul></Card>
      )}
      {S.has("methodology") && (
        <Card><h2 className="mb-2 text-sm font-semibold">Metodologia e origem das métricas</h2><ul className="list-disc space-y-1 pl-5 text-sm text-muted">{r.methodology.map((x, i) => <li key={i}>{x}</li>)}</ul></Card>
      )}
    </article>
  );
}
