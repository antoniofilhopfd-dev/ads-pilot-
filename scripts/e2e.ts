// Teste ponta a ponta (navegador real) contra http://localhost:3000. Gera prints em docs/etapa-02/prints.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import mysql from "mysql2/promise";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/etapa-02/prints";
const run = Date.now().toString(36);
const A = { name: "Marina Souza", email: `marina-${run}@exemplo.com`, org: "Agência Horizonte", pw: "SenhaForte2026" };
const B = { name: "Bruno Lima", email: `bruno-${run}@exemplo.com`, org: "Outra Agência", pw: "SenhaForte2026" };

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const shot = (n: string, full = true) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: full });
  const log = (m: string) => console.log("✔", m);

  // 1. rota protegida redireciona
  await page.goto(`${BASE}/app/clientes`);
  assert.match(page.url(), /\/login$/); log("rota protegida redireciona para /login");
  await shot("01-login");

  // 2. senha fraca e cadastro
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", A.name); await page.fill("#organizationName", A.org); await page.fill("#email", A.email); await page.fill("#password", "curta");
  await page.click("button[type=submit]");
  await page.getByRole("alert").waitFor(); await shot("02-cadastro-erro");
  await page.fill("#password", A.pw); await page.click("button[type=submit]");
  await page.waitForURL(/\/app$/); await shot("03-painel-vazio"); log("cadastro + login automático");

  // 3. clientes
  await page.goto(`${BASE}/app/clientes`);
  await page.fill("#name", "Loja Exemplo"); await page.fill("#notes", "E-commerce de moda");
  await page.click("button:has-text('Adicionar cliente')");
  await page.getByText("Cliente criado.").waitFor();
  await page.fill("#name", "Loja Exemplo"); await page.click("button:has-text('Adicionar cliente')");
  await page.getByText("Já existe um cliente com este nome.").waitFor(); log("cliente duplicado é recusado");
  await page.fill("#name", "Clínica Vida"); await page.click("button:has-text('Adicionar cliente')");
  await page.getByText("Clínica Vida", { exact: true }).first().waitFor();
  await page.goto(`${BASE}/app/clientes`); await shot("04-clientes"); log("CRUD de clientes");

  // 4. usuário B (outra organização) cria conta em outro contexto
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const pb = await ctxB.newPage();
  await pb.goto(`${BASE}/cadastro`);
  await pb.fill("#name", B.name); await pb.fill("#organizationName", B.org); await pb.fill("#email", B.email); await pb.fill("#password", B.pw);
  await pb.click("button[type=submit]"); await pb.waitForURL(/\/app$/);
  await pb.goto(`${BASE}/app/clientes`);
  assert.equal(await pb.getByText("Loja Exemplo").count(), 0); log("organização B NÃO vê clientes da organização A (navegador real)");
  await pb.screenshot({ path: `${OUT}/05-isolamento-org-b.png`, fullPage: true });

  // 5. A adiciona B como analista; B alterna para a org A e fica somente leitura
  await page.goto(`${BASE}/app/equipe`);
  await page.fill("#email", B.email); await page.selectOption("#role", "analyst");
  await page.click("button:has-text('Adicionar')"); await page.getByText("Membro adicionado.").waitFor(); await shot("06-equipe");
  await pb.goto(`${BASE}/app`);
  const orgId = await pb.locator("#organizationId option", { hasText: A.org }).getAttribute("value");
  await pb.selectOption("#organizationId", orgId!);
  await Promise.all([pb.waitForResponse((r) => r.request().method() === "POST" && r.url().endsWith("/app")), pb.click("button:has-text('Trocar')")]);
  await pb.goto(`${BASE}/app/clientes`);
  await pb.getByText("Loja Exemplo").first().waitFor();
  assert.equal(await pb.getByText("Novo cliente").count(), 0);
  assert.equal(await pb.getByRole("button", { name: "Excluir" }).count(), 0); log("analista vê clientes mas sem criar/excluir na UI");
  await pb.screenshot({ path: `${OUT}/07-analista-somente-leitura.png`, fullPage: true });
  await pb.goto(`${BASE}/app/atividades`);
  await pb.getByText("não tem acesso ao histórico").waitFor(); log("analista sem acesso ao histórico");

  // 6. atividades e configurações (admin)
  await page.goto(`${BASE}/app/atividades`); await shot("08-atividades");
  await page.goto(`${BASE}/app/configuracoes`); await shot("09-configuracoes");

  // 7. logout, recuperação de senha (link lido da tabela email_outbox de DEV)
  await page.goto(`${BASE}/app`); await page.click("button:has-text('Sair')"); await page.waitForURL(/\/login$/);
  await page.goto(`${BASE}/app`); assert.match(page.url(), /\/login$/); log("logout encerra a sessão");
  await page.goto(`${BASE}/login`); await page.fill("#email", A.email); await page.fill("#password", "senhaerrada123"); await page.click("button[type=submit]");
  await page.getByText("E-mail ou senha incorretos.").waitFor(); await shot("10-login-erro");
  await page.goto(`${BASE}/recuperar-senha`); await page.fill("#email", A.email); await page.click("button[type=submit]");
  await page.getByText("Se o e-mail estiver cadastrado").waitFor(); await shot("11-recuperar-enviado");
  const conn = await mysql.createConnection(process.env.DATABASE_URL!);
  const [rows] = (await conn.query("SELECT body FROM email_outbox WHERE to_email=? ORDER BY created_at DESC LIMIT 1", [A.email])) as any;
  await conn.end();
  const link = /(http\S+)/.exec(rows[0].body)![1];
  await page.goto(link); await page.fill("#password", "NovaSenha2026x"); await page.fill("#confirm", "NovaSenha2026x"); await shot("12-redefinir");
  await page.click("button[type=submit]"); await page.waitForURL(/redefinida=1/); await shot("13-login-redefinida");
  await page.fill("#email", A.email); await page.fill("#password", "NovaSenha2026x"); await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  log("recuperação de senha de ponta a ponta");

  // 8. responsivo
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${BASE}/app/clientes`); await shot("14-mobile-clientes");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth);
  assert.equal(overflow, false); log("sem rolagem horizontal da página no celular (390px)");

  await browser.close();
  console.log("E2E OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
