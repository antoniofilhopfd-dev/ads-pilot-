// E2E Etapa 05: tela de canais (WhatsApp sem configuração = bloqueado, nunca finge envio) e integrações.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/v2/etapa-05/prints";
const run = Date.now().toString(36);
const log = (m: string) => console.log("✔", m);

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => ((window as unknown as { __csp: string[] }).__csp ??= []).push(String(e.violatedDirective))); });
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", "Marina Gestora"); await page.fill("#organizationName", "Agência Horizonte"); await page.fill("#email", `canais-${run}@exemplo.com`); await page.fill("#password", "SenhaForte2026");
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  await page.goto(`${BASE}/app/canais`); await page.waitForLoadState("networkidle");
  await page.getByText("Não configurado").first().waitFor(); await page.screenshot({ path: `${OUT}/01-canais-vazio.png`, fullPage: true }); log("canal WhatsApp declarado NÃO configurado; e-mail declarado não implementado");
  await page.fill("input[name=name]", "Plantão de tráfego"); await page.fill("input[name=phone]", "+55 (11) 91234-5678"); await page.click("button:has-text('Cadastrar')"); await page.getByText("Destinatário cadastrado.").waitFor();
  await page.fill("input[name=name]", "Inválido"); await page.fill("input[name=phone]", "123"); await page.click("button:has-text('Cadastrar')"); await page.getByText(/Telefone inválido/).waitFor(); log("telefone inválido recusado");
  await page.reload(); await page.waitForLoadState("networkidle");
  const txt = await page.locator("main").innerText(); assert.ok(!txt.includes("91234"), "número completo não deve aparecer"); log("número mascarado na tela");
  await page.click("button:has-text('Enviar teste')"); await page.getByText(/NÃO enviada/).waitFor(); log("teste sem configuração: mensagem registrada como NÃO enviada (sem fingir sucesso)");
  await page.reload(); await page.waitForLoadState("networkidle"); await page.getByText(/Bloqueada/).first().waitFor(); await page.screenshot({ path: `${OUT}/02-canais-bloqueado.png`, fullPage: true }); log("histórico mostra a mensagem como bloqueada");
  await page.goto(`${BASE}/app/integracoes`); await page.waitForLoadState("networkidle"); await page.screenshot({ path: `${OUT}/03-integracoes.png`, fullPage: true });
  const v = await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []); assert.equal(v.length, 0);
  await browser.close();
}
main().catch((e) => { console.error("✘", e); process.exit(1); });
