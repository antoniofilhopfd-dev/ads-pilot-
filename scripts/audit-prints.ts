// Captura as telas EXISTENTES do AdsPilot (modo demonstração) para a auditoria. Prints em docs/v2/etapa-01/prints.
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = process.env.OUT ?? "docs/v2/etapa-01/prints";
const run = Date.now().toString(36);
const U = { name: "Marina Souza", email: `audit-${run}@exemplo.com`, org: "Agência Horizonte", pw: "SenhaForte2026" };

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const shot = (n: string) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
  await page.goto(`${BASE}/login`); await shot("01-login");
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", U.name); await page.fill("#organizationName", U.org); await page.fill("#email", U.email); await page.fill("#password", U.pw);
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  await page.goto(`${BASE}/app/clientes`); for (const n of ["Loja Exemplo", "Clínica Vida"]) { await page.fill("#name", n); await page.click("button:has-text('Adicionar cliente')"); await page.getByText("Cliente criado.").waitFor(); }
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { const r = rows.nth(i); await r.getByLabel("Acompanhar").check(); const loja = (await r.locator("td").first().innerText()).includes("Loja"); await r.locator("select").selectOption({ label: loja ? "Loja Exemplo" : "Clínica Vida" }); await r.getByRole("button", { name: "Salvar" }).click(); await r.getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();
  const pages: [string, string][] = [["02-painel", "/app"], ["03-campanhas", "/app/campanhas"], ["05-operacoes", "/app/operacoes"], ["06-relatorios", "/app/relatorios"], ["07-integracoes", "/app/integracoes"], ["08-equipe", "/app/equipe"], ["09-configuracoes", "/app/configuracoes"], ["10-assistentes-mcp", "/app/mcp"], ["11-atividades", "/app/atividades"], ["12-clientes", "/app/clientes"]];
  for (const [n, p] of pages) { await page.goto(`${BASE}${p}`); await page.waitForLoadState("networkidle"); await shot(n); }
  await page.goto(`${BASE}/app/campanhas`); await page.getByRole("link", { name: "Remarketing – Catálogo" }).click(); await page.waitForURL(/\/app\/campanhas\/[0-9a-f-]{36}/); await shot("04-detalhe-campanha");
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${BASE}/app`); await shot("13-mobile-painel");
  await browser.close(); console.log("prints ok");
}
main().catch((e) => { console.error(e.message); process.exit(1); });
