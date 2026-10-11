import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/etapa-02b/prints";
const run = Date.now().toString(36);
const U = { name: "Carla Dias", email: `carla-${run}@exemplo.com`, org: "Estúdio Carla", pw: "SenhaForte2026", pw2: "OutraSenha2027x" };

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const log = (m: string) => console.log("✔", m);
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", U.name); await page.fill("#organizationName", U.org); await page.fill("#email", U.email); await page.fill("#password", U.pw);
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);

  await page.goto(`${BASE}/app/conta`); await page.screenshot({ path: `${OUT}/01-minha-conta.png`, fullPage: true });
  // sessão paralela (outro dispositivo)
  const ctx2 = await browser.newContext(); const p2 = await ctx2.newPage();
  await p2.goto(`${BASE}/login`); await p2.fill("#email", U.email); await p2.fill("#password", U.pw); await p2.click("button[type=submit]"); await p2.waitForURL(/\/app$/);

  await page.fill("#pw-current", U.pw); await page.fill("#pw-new", U.pw2); await page.fill("#pw-confirm", U.pw2);
  await page.click("button:has-text('Alterar senha')"); await page.getByText("Os outros dispositivos foram desconectados.").waitFor();
  await page.screenshot({ path: `${OUT}/02-senha-alterada.png`, fullPage: true });
  await p2.goto(`${BASE}/app`); assert.match(p2.url(), /\/login$/); log("troca de senha derruba a sessão do outro dispositivo e mantém a atual");

  const [dl] = await Promise.all([page.waitForEvent("download"), page.click("text=Baixar meus dados (JSON)")]);
  const json = JSON.parse(readFileSync(await dl.path(), "utf8"));
  assert.equal(json.user.email, U.email); assert.ok(!/scrypt|passwordHash|password_hash/i.test(JSON.stringify(json))); log("exportação LGPD baixada, sem hash de senha");

  await page.goto(`${BASE}/privacidade`); await page.screenshot({ path: `${OUT}/03-privacidade-minuta.png`, fullPage: true });

  // seletor de colunas (precisa de dados demo)
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { await rows.nth(i).getByLabel("Acompanhar").check(); await rows.nth(i).getByRole("button", { name: "Salvar" }).click(); await rows.nth(i).getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();
  await page.goto(`${BASE}/app/campanhas`);
  await page.locator("summary", { hasText: "Colunas" }).click();
  for (const n of ["CTR", "Objetivo", "ROAS"]) await page.getByRole("checkbox", { name: n }).uncheck();
  await page.screenshot({ path: `${OUT}/04-seletor-colunas.png` });
  await page.click("button:has-text('Aplicar')"); await page.waitForURL(/colunas=/); await page.waitForLoadState("networkidle");
  const heads = await page.locator("thead th").allInnerTexts();
  assert.ok(!heads.some((h) => /CTR|Objetivo|ROAS/.test(h)) && heads.some((h) => /Gasto/.test(h))); log("seletor de colunas oculta/mostra colunas (estado na URL)");
  await page.screenshot({ path: `${OUT}/05-campanhas-colunas.png`, fullPage: true });

  // exclusão
  await page.goto(`${BASE}/app/conta`);
  const pwField = page.locator("#delete-password"); await pwField.fill("errada12345");
  page.once("dialog", (d) => d.accept()); await page.click("button:has-text('Excluir minha conta')");
  await page.getByText("Senha atual incorreta.").waitFor(); log("exclusão com senha errada é recusada");
  await pwField.fill(U.pw2); page.once("dialog", (d) => d.accept()); await page.click("button:has-text('Excluir minha conta')");
  await page.waitForURL(/\/login$/);
  await page.fill("#email", U.email); await page.fill("#password", U.pw2); await page.click("button[type=submit]");
  await page.getByText("E-mail ou senha incorretos.").waitFor(); log("conta excluída não consegue mais entrar");
  await browser.close(); console.log("E2E CONTA OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
