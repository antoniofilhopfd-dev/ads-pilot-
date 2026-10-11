// E2E Etapa 04 (modo DEMONSTRAÇÃO): preparar → confirmar → verificar. Prints em docs/etapa-04/prints.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/etapa-04/prints";
const run = Date.now().toString(36);
const mk = (n: string) => ({ name: n, email: `${n.toLowerCase()}-${run}@exemplo.com`, org: `Agência ${n}`, pw: "SenhaForte2026" });
const A = mk("Marina"), B = mk("Bruno");

async function signup(page: import("playwright").Page, u: typeof A) {
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", u.name); await page.fill("#organizationName", u.org); await page.fill("#email", u.email); await page.fill("#password", u.pw);
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const shot = (n: string, p = page) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
  const log = (m: string) => console.log("✔", m);
  await signup(page, A);
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { await rows.nth(i).getByLabel("Acompanhar").check(); await rows.nth(i).getByRole("button", { name: "Salvar" }).click(); await rows.nth(i).getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();

  await page.goto(`${BASE}/app/campanhas`); await page.getByRole("link", { name: "Remarketing – Catálogo" }).click(); await page.waitForURL(/\/app\/campanhas\/[0-9a-f-]{36}/);
  await page.getByRole("heading", { name: "Ações" }).waitFor(); const campUrl = page.url(); await shot("01-campanha-acoes");

  // pausar
  await page.click("button:has-text('Pausar campanha')"); await page.waitForURL(/\/app\/operacoes\//);
  await page.getByText("SIMULAÇÃO").first().waitFor(); await page.getByText("Aguardando confirmação").waitFor(); await shot("02-confirmar-pausa");
  const opUrl = page.url();
  await page.click("button:has-text('Confirmar e executar')"); await page.getByText("Confirmado no estado remoto").waitFor(); await shot("03-pausa-verificada");
  log("pausa preparada, confirmada e VERIFICADA");
  await page.goto(campUrl); await page.getByText("Pausada").first().waitFor(); log("campanha aparece pausada após a operação");
  assert.equal(await page.getByRole("button", { name: "Reativar campanha…" }).count(), 1);

  // reativar e orçamento grande
  await page.click("button:has-text('Reativar campanha')"); await page.waitForURL(/\/app\/operacoes\//);
  await page.click("button:has-text('Confirmar e executar')"); await page.getByText("Confirmado no estado remoto").waitFor();
  await page.goto(campUrl); await page.fill("#new-budget", "500"); await page.click("button:has-text('Alterar orçamento')"); await page.waitForURL(/\/app\/operacoes\//);
  await page.getByText("Aumento de 150%").waitFor(); await shot("04-orcamento-aumento-grande");
  await page.click("button:has-text('Confirmar e executar')"); await page.getByText("Confirme explicitamente").waitFor(); log("aumento grande exige confirmação reforçada");
  await page.getByLabel("Estou ciente").check(); await page.click("button:has-text('Confirmar e executar')"); await page.getByText("Confirmado no estado remoto").waitFor();
  await page.goto(campUrl); await page.getByText("R$ 500,00/dia").waitFor(); log("orçamento alterado e refletido");

  // orçamento inválido
  await page.fill("#new-budget", "0"); await page.click("button:has-text('Alterar orçamento')"); await page.getByText("entre 1 e").waitFor(); log("orçamento inválido recusado no servidor");

  await page.goto(`${BASE}/app/operacoes`); await shot("05-historico-operacoes");
  await page.goto(`${BASE}/app/atividades`); await page.getByText("Campanha pausada").first().waitFor(); log("operações aparecem na auditoria");

  // analista: sem ações; outra org: 404
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pb = await ctxB.newPage();
  await signup(pb, B);
  const r = await pb.goto(opUrl); assert.equal(r!.status(), 404); await shot("06-outra-org-404", pb); log("outra organização recebe 404 na operação");
  await page.goto(`${BASE}/app/equipe`); await page.fill("#email", B.email); await page.selectOption("#role", "analyst"); await page.click("button:has-text('Adicionar')"); await page.getByText("Membro adicionado.").waitFor();
  await pb.goto(`${BASE}/app`);
  const orgId = await pb.locator("#organizationId option", { hasText: A.org }).getAttribute("value");
  await pb.selectOption("#organizationId", orgId!);
  await Promise.all([pb.waitForResponse((x) => x.request().method() === "POST" && x.url().endsWith("/app")), pb.click("button:has-text('Trocar')")]);
  await pb.goto(campUrl); await pb.getByText("Remarketing – Catálogo").first().waitFor();
  assert.equal(await pb.getByRole("heading", { name: "Ações" }).count(), 0); await shot("07-analista-sem-acoes", pb); log("analista não vê ações de escrita");
  await pb.goto(opUrl); assert.equal(await pb.getByRole("button", { name: "Confirmar e executar" }).count(), 0); log("analista não vê confirmação");

  await browser.close(); console.log("E2E OPS OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
