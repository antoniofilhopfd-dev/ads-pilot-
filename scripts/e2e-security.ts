// E2E de segurança (navegador + HTTP cru) contra o build de PRODUÇÃO em :3000.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/etapa-07/prints";
const run = Date.now().toString(36);
const log = (m: string) => console.log("✔", m);

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage();
  let dialogs = 0; page.on("dialog", (d) => { dialogs++; d.dismiss(); });

  // 1) cabeçalhos de segurança
  const h = (await fetch(`${BASE}/login`)).headers;
  assert.equal(h.get("x-frame-options"), "DENY"); assert.equal(h.get("x-content-type-options"), "nosniff");
  assert.match(h.get("content-security-policy") ?? "", /frame-ancestors 'none'/); assert.match(h.get("strict-transport-security") ?? "", /max-age=31536000/);
  assert.ok(h.get("referrer-policy")); assert.ok(h.get("permissions-policy")); assert.equal(h.get("x-powered-by"), null); log("cabeçalhos: X-Frame-Options, CSP, HSTS, nosniff, Referrer/Permissions-Policy; sem X-Powered-By");

  // 2) rotas protegidas sem login
  for (const p of ["/api/conta/exportar", "/api/relatorios/exportar?tipo=campaigns&formato=csv", "/api/mcp"]) {
    const r = await fetch(`${BASE}${p}`, { method: p.includes("mcp") ? "POST" : "GET", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: p.includes("mcp") ? "{}" : undefined });
    assert.equal(r.status, 401, p);
  }
  const redirect = await fetch(`${BASE}/app/clientes`, { redirect: "manual" }); assert.ok([302, 303, 307, 308].includes(redirect.status)); log("API e páginas protegidas recusam acesso sem login (401/redirect)");

  // 3) health sem segredos
  const hj = await (await fetch(`${BASE}/api/health`)).json() as { checks: Record<string, unknown> };
  assert.ok(Object.values(hj.checks).every((v) => typeof v === "boolean")); assert.ok(!JSON.stringify(hj).match(/mysql:|SENHA|secret/i)); log("/api/health devolve apenas booleanos");

  // 4) cadastro + cookies
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", "Sec Teste"); await page.fill("#organizationName", "Org Sec"); await page.fill("#email", `sec-${run}@exemplo.com`); await page.fill("#password", "SenhaForte2026");
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  const cookies = await ctx.cookies(); const sess = cookies.find((c) => c.name === "ap_session")!;
  assert.ok(sess.httpOnly && sess.secure && sess.sameSite === "Lax"); log("cookie de sessão: HttpOnly + Secure + SameSite=Lax");
  assert.equal(await page.evaluate(() => document.cookie.includes("ap_session")), false); log("JavaScript da página não enxerga o cookie de sessão");

  // 5) XSS armazenado: renderizado como texto, nada executa
  const xss = `<img src=x onerror="alert('xss')"><script>alert('xss2')</script>`;
  await page.goto(`${BASE}/app/clientes`); await page.fill("#name", xss); await page.click("button:has-text('Adicionar cliente')"); await page.getByText("Cliente criado.").waitFor();
  await page.goto(`${BASE}/app/clientes`); await page.waitForTimeout(500);
  assert.equal(dialogs, 0); assert.equal(await page.locator("td img[src=x]").count(), 0); assert.ok((await page.locator("tbody").innerText()).includes("<script>alert('xss2')</script>"));
  await page.screenshot({ path: `${OUT}/01-xss-escapado.png`, fullPage: true }); log("XSS armazenado aparece como texto; nenhum alert executou");

  // 6) Server Action forjada: replay de outra origem
  let actionId = "", body = "";
  await ctx.clearCookies();
  await page.goto(`${BASE}/login`);
  page.on("request", (r) => { if (r.method() === "POST" && r.headers()["next-action"]) { actionId = r.headers()["next-action"]; body = r.postData() ?? ""; } });
  await page.fill("#email", "x@y.com"); await page.fill("#password", "qualquercoisa123"); await page.click("button[type=submit]"); await page.getByText("E-mail ou senha incorretos.").waitFor();
  assert.ok(actionId, "capturou o id da Server Action");
  const forged = await fetch(`${BASE}/login`, { method: "POST", headers: { "Next-Action": actionId, "Content-Type": "text/plain;charset=UTF-8", Origin: "https://site-malicioso.example", Host: new URL(BASE).host }, body });
  const text = await forged.text();
  assert.ok(forged.status >= 400 || /Invalid Server Actions request|origin/i.test(text), `replay de origem falsa deveria ser recusado (status ${forged.status})`); log(`Server Action com Origin falso foi recusada (HTTP ${forged.status})`);

  // 7) limitação de tentativas de login (HTTP real via UI)
  for (let i = 0; i < 11; i++) { await page.fill("#email", `brute-${run}@exemplo.com`); await page.fill("#password", `errada${i}xxxxx`); await page.click("button[type=submit]"); await page.waitForTimeout(150); }
  await page.getByText("Muitas tentativas").waitFor(); await page.screenshot({ path: `${OUT}/02-bloqueio-tentativas.png` }); log("força bruta de login é bloqueada após 10 tentativas");

  await browser.close(); console.log("E2E SEGURANÇA OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
