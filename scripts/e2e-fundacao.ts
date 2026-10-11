// E2E da Etapa 02 (fundação): estados de erro/carregamento/404, CSP com nonce, skip link. Prints em docs/v2/etapa-02/prints.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/v2/etapa-02/prints";
const run = Date.now().toString(36);
const log = (m: string) => console.log("✔", m);

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => ((window as unknown as { __csp: string[] }).__csp ??= []).push(`${e.violatedDirective}|${e.blockedURI}`)); });
  const csp = async () => ((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? [])) as string[]);

  // 404 público e autenticado
  const r404 = await page.goto(`${BASE}/pagina-que-nao-existe`); assert.equal(r404!.status(), 404);
  await page.getByText("Página ou item não encontrado").waitFor(); await page.screenshot({ path: `${OUT}/01-404.png` }); log("404 próprio com identidade visual");

  // CSP com nonce no login
  const resp = await page.goto(`${BASE}/login`); const header = resp!.headers()["content-security-policy"];
  assert.match(header, /script-src 'self' 'nonce-[A-Za-z0-9+/=]+' 'strict-dynamic'/); assert.doesNotMatch(header, /unsafe-inline'[^;]*script|script-src[^;]*unsafe-inline/); log("página com CSP script-src por nonce (sem unsafe-inline)");
  const nonce1 = /nonce-([A-Za-z0-9+/=]+)/.exec(header)![1]; const nonce2 = /nonce-([A-Za-z0-9+/=]+)/.exec((await (await ctx.request.get(`${BASE}/login`)).headers()["content-security-policy"]))![1]; assert.notEqual(nonce1, nonce2); log("nonce diferente a cada requisição");
  assert.equal((await csp()).length, 0, "login não deve gerar violações de CSP");

  // vetor 1: handler inline (onerror) sem nonce
  const w1 = await page.evaluate(() => new Promise<boolean>((resolve) => {
    const w = window as unknown as { __xss: boolean };
    w.__xss = false;
    document.body.insertAdjacentHTML("beforeend", '<img src="x:invalido" onerror="window.__xss = true">');
    setTimeout(() => resolve(w.__xss), 500);
  }));
  assert.equal(w1, false); assert.ok((await csp()).some((v) => v.startsWith("script-src")), "esperava violação de script-src registrada");
  await page.screenshot({ path: `${OUT}/02-login-csp.png` });
  // vetor 2: <script> inline escrito pelo parser (sem nonce)
  const w2 = await page.evaluate(() => new Promise<boolean>((resolve) => {
    const w = window as unknown as { __xss2: boolean };
    w.__xss2 = false;
    document.write("<script>window.__xss2 = true<\\/script>");
    setTimeout(() => resolve(w.__xss2), 500);
  }));
  assert.equal(w2, false); log("handler inline (onerror) e <script> inline sem nonce são BLOQUEADOS pelo navegador");

  // cadastro e navegação por todo o app sem violações
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", "Fundação Teste"); await page.fill("#organizationName", "Org Fundação"); await page.fill("#email", `fund-${run}@exemplo.com`); await page.fill("#password", "SenhaForte2026");
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  for (const p of ["/app", "/app/campanhas", "/app/clientes", "/app/equipe", "/app/integracoes", "/app/relatorios", "/app/operacoes", "/app/mcp", "/app/configuracoes", "/app/conta"]) { await page.goto(`${BASE}${p}`); await page.waitForLoadState("networkidle"); }
  const v = await csp(); assert.equal(v.length, 0, `violações de CSP: ${v.join(", ")}`); log("10 telas autenticadas navegadas sem NENHUMA violação de CSP (hidratação/formulários funcionam)");

  // skip link
  await page.goto(`${BASE}/app`); await page.keyboard.press("Tab");
  const focused = await page.evaluate(() => document.activeElement?.textContent); assert.match(focused ?? "", /Pular para o conteúdo/);
  await page.screenshot({ path: `${OUT}/03-skip-link-foco.png`, clip: { x: 0, y: 0, width: 700, height: 120 } }); log("primeiro Tab foca 'Pular para o conteúdo'");

  // 404 dentro do app (mantém o menu)
  const rid = await page.goto(`${BASE}/app/campanhas/00000000-0000-4000-8000-000000000000`); assert.equal(rid!.status(), 404);
  await page.getByText("Página ou item não encontrado").waitFor(); assert.ok(await page.getByRole("link", { name: "Campanhas" }).count()); await page.screenshot({ path: `${OUT}/04-404-dentro-do-app.png`, fullPage: true }); log("404 dentro do app mantém menu e cabeçalho");

  // erro inesperado dentro do app
  await page.goto(`${BASE}/app/diagnostico-erro`);
  await page.getByText("Algo deu errado").waitFor(); const code = await page.getByText("Código do erro:").innerText().catch(() => ""); await page.screenshot({ path: `${OUT}/05-erro-inesperado.png`, fullPage: true });
  assert.ok(await page.getByRole("link", { name: "Painel" }).count()); log(`erro inesperado: tela amigável com menu preservado ${code ? "e código " + code.replace("Código do erro: ", "") : ""}`);
  await page.getByRole("button", { name: "Tentar novamente" }).waitFor();

  // carregamento 1: indicador no menu durante a navegação lenta (página que pode responder 404 mantém o status correto)
  await page.goto(`${BASE}/app`);
  await page.route("**/app/relatorios**", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue().catch(() => {}); });
  await page.getByRole("link", { name: "Relatórios", exact: true }).click();
  await page.getByRole("status").filter({ hasText: "Carregando" }).first().waitFor({ state: "attached", timeout: 5000 }); await page.screenshot({ path: `${OUT}/06-carregando-menu.png` }); log("menu mostra 'Carregando…' durante a navegação lenta");
  await page.waitForURL(/relatorios/); await page.unroute("**/app/relatorios**");
  // carregamento 2: esqueleto (loading.tsx) em tela que nunca responde 404
  await page.goto(`${BASE}/app`); await page.waitForLoadState("networkidle"); await page.waitForTimeout(2500); // deixa o prefetch do esqueleto terminar
  await page.route("**/app/integracoes**", async (route) => { await new Promise((r) => setTimeout(r, 1500)); await route.continue().catch(() => {}); });
  await page.getByRole("link", { name: "Integrações", exact: true }).click();
  await page.locator(".animate-pulse").first().waitFor({ timeout: 5000 }); await page.screenshot({ path: `${OUT}/07-carregando-esqueleto.png` }); log("esqueleto de carregamento aparece em tela lenta");
  await page.waitForURL(/integracoes/); await page.unroute("**/app/integracoes**");

  // X-Request-Id
  const r = await ctx.request.get(`${BASE}/login`); assert.ok(r.headers()["x-request-id"]); log("X-Request-Id presente nas respostas de página");
  await browser.close(); console.log("E2E FUNDAÇÃO OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
