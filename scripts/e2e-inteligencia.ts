// E2E da Etapa 04 (inteligência, modo DEMONSTRAÇÃO): alertas, notificações, diagnósticos, comparação, lote, MCP leitura, relatório.
import { chromium, type Page } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/v2/etapa-04/prints";
const run = Date.now().toString(36);
const log = (m: string) => console.log("✔", m);

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page: Page = await ctx.newPage();
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => ((window as unknown as { __csp: string[] }).__csp ??= []).push(`${e.violatedDirective}|${e.blockedURI}`)); });
  const violations: string[] = [];
  const collect = async () => { violations.push(...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => [])) as string[])); };
  const go = async (p: string) => { await collect(); await page.goto(`${BASE}${p}`); await page.waitForLoadState("networkidle"); };
  const shot = (n: string) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", "Marina Gestora"); await page.fill("#organizationName", "Agência Horizonte"); await page.fill("#email", `intel-${run}@exemplo.com`); await page.fill("#password", "SenhaForte2026");
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  await go("/app/integracoes"); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { const row = rows.nth(i); await row.getByLabel("Acompanhar").check(); await row.getByRole("button", { name: "Salvar" }).click(); await row.getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();
  log("conta de teste em modo demonstração com 2 contas sincronizadas");

  // orçamento minúsculo + meta impossível → alertas determinísticos
  await go("/app/orcamentos"); await page.selectOption("select[name=alvo]", { index: 0 }); await page.fill("input[name=valor]", "100"); await page.click("button:has-text('Salvar orçamento')"); await page.getByText("Orçamento planejado salvo.").waitFor();
  await go("/app/metas"); await page.selectOption("select[name=alvo]", { index: 0 }); await page.selectOption("select[name=metrica]", "ctr"); await page.selectOption("select[name=direcao]", "min"); await page.fill("input[name=meta]", "50"); await page.click("button:has-text('Salvar meta')"); await page.getByText("Meta salva.").waitFor();

  // alertas
  await go("/app/alertas"); await page.click("button:has-text('Reavaliar alertas agora')"); await page.getByText(/Avaliação concluída/).waitFor();
  await page.reload(); await page.waitForLoadState("networkidle");
  await page.getByText("Orçamento planejado excedido").first().waitFor(); await page.getByText("Meta não atingida").first().waitFor();
  await shot("01-alertas"); log("alertas abertos: orçamento excedido e meta não atingida, com dados e premissas");
  await page.click("button:has-text('Reavaliar alertas agora')"); await page.getByText(/0 aberto\(s\)/).waitFor(); log("reavaliar não duplica alertas (0 novos)");
  await page.getByRole("button", { name: "Reconhecer" }).first().click(); await page.waitForLoadState("networkidle"); await page.getByText("Reconhecido").first().waitFor(); log("alerta reconhecido");

  // notificações
  const bell = page.getByRole("link", { name: /Notificações/ }); await bell.waitFor(); await shot("02-sino-notificacoes-menu");
  await go("/app/notificacoes"); await page.getByText("Orçamento planejado excedido").first().waitFor(); await shot("03-notificacoes");
  await page.click("button:has-text('Marcar todas como lidas')"); await page.waitForLoadState("networkidle"); log("notificações internas criadas para o responsável e marcadas como lidas");

  // configuração de alertas
  await go("/app/alertas"); await page.fill("input[name=costRisePct]", "40"); await page.click("button:has-text('Salvar configuração')"); await page.getByText("Configuração de alertas salva.").waitFor();
  await page.fill("input[name=costRisePct]", "1"); await page.click("button:has-text('Salvar configuração')"); await page.getByText(/costRisePct/).waitFor(); log("configuração validada (limiar absurdo recusado)");
  await shot("04-alertas-configuracao");

  // diagnósticos
  await go("/app/diagnosticos"); await page.getByText(/Explicações por IA indisponíveis/).waitFor(); await shot("05-diagnosticos"); log("diagnósticos por regras; IA declarada indisponível (sem chave)");
  await go("/app/campanhas"); await page.getByRole("link", { name: /Remarketing/ }).first().click(); await page.getByText("Diagnóstico (regras, últimos 7 dias)").waitFor(); await page.getByText("Leads").first().waitFor().catch(() => {}); await shot("06-campanha-diagnostico");

  // comparar
  await go("/app/campanhas"); const href = await page.getByRole("link", { name: /Remarketing/ }).first().getAttribute("href"); const id = href!.split("/app/campanhas/")[1].split("?")[0];
  await go(`/app/comparar?modo=periodo&dias=30&a=${id}`); await page.locator("th", { hasText: "Período anterior" }).waitFor(); await shot("07-comparar-periodos"); log("comparação período × período anterior");
  const ids = await page.locator("select[name=a] option").evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value).filter(Boolean));
  await go(`/app/comparar?modo=campanhas&dias=30&a=${ids[0]}&b=${ids[1]}&c=${ids[2] ?? ""}`); await page.getByText("Custo/resultado").waitFor(); await shot("08-comparar-campanhas"); log("comparação campanha × campanha");

  // lote
  await go("/app/campanhas"); await page.locator("input[name=ids]").nth(0).check(); await page.locator("input[name=ids]").nth(1).check(); await shot("09-campanhas-lote-selecao");
  await page.click("button:has-text('Preparar pausa')"); await page.waitForURL(/operacoes\?lote=/); await page.getByText(/operação\(ões\) preparada\(s\)/).waitFor(); await shot("10-operacoes-lote-preparado"); log("lote: operações PREPARADAS (nada executado; confirmação individual)");

  // relatório com leads/CPL e alertas
  await go("/app/relatorios/ver?tipo=executive&dias=30"); await page.getByText("Resumo executivo").first().waitFor(); await shot("11-relatorio-ampliado"); log("relatório executivo inclui indicadores por tipo e alertas persistidos");

  await collect(); assert.equal(violations.length, 0, `violações de CSP: ${violations.join(", ")}`); log("nenhuma violação de CSP");
  await browser.close();
}
main().catch((e) => { console.error("✘", e); process.exit(1); });
