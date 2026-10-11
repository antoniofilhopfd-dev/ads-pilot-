// E2E: acesso por conta de anúncios (modo DEMONSTRAÇÃO). Prints em docs/acesso-por-conta/prints.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/acesso-por-conta/prints";
const run = Date.now().toString(36);
const mk = (n: string) => ({ name: n, email: `${n.toLowerCase()}-${run}@exemplo.com`, org: `Agência ${n}`, pw: "SenhaForte2026" });
const A = mk("Marina"), B = mk("Rafael");
const log = (m: string) => console.log("✔", m);

async function signup(page: import("playwright").Page, u: typeof A) {
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", u.name); await page.fill("#organizationName", u.org); await page.fill("#email", u.email); await page.fill("#password", u.pw);
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  const pb = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await signup(page, A); await signup(pb, B);

  // admin: clientes, demo, contas vinculadas, sincronização
  for (const n of ["Cliente Loja", "Cliente Clínica"]) { await page.goto(`${BASE}/app/clientes`); await page.fill("#name", n); await page.click("button:has-text('Adicionar cliente')"); await page.getByText("Cliente criado.").waitFor(); }
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i); await row.getByLabel("Acompanhar").check();
    const isLoja = (await row.locator("td").first().innerText()).includes("Loja");
    await row.locator("select").selectOption({ label: isLoja ? "Cliente Loja" : "Cliente Clínica" });
    await row.getByRole("button", { name: "Salvar" }).click(); await row.getByText("Conta atualizada.").waitFor();
  }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();

  // admin adiciona Rafael COMO RESTRITO (não vê nada ainda)
  await page.goto(`${BASE}/app/equipe`); await page.fill("#email", B.email); await page.selectOption("#role", "manager"); await page.getByLabel("Acesso restrito").check();
  await page.click("button:has-text('Adicionar')"); await page.getByText("Membro adicionado.").waitFor();
  const switchTo = async () => { await pb.goto(`${BASE}/app`); const id = await pb.locator("#organizationId option", { hasText: A.org }).getAttribute("value"); await pb.selectOption("#organizationId", id!); await Promise.all([pb.waitForResponse((x) => x.request().method() === "POST" && x.url().endsWith("/app")), pb.click("button:has-text('Trocar')")]); };
  await switchTo(); await pb.goto(`${BASE}/app/campanhas`);
  await pb.getByText("Acesso restrito a 0 conta(s)").waitFor(); await pb.getByText("Nenhuma campanha encontrada").waitFor(); await pb.screenshot({ path: `${OUT}/01-restrito-sem-contas.png`, fullPage: true }); log("novo membro restrito não vê nenhuma campanha");

  // admin libera SÓ a conta da Loja
  await page.goto(`${BASE}/app/equipe`);
  const row = page.locator("tbody tr").filter({ hasText: B.name });
  await row.locator("summary").click(); await row.getByLabel("Somente as contas marcadas:").check();
  await row.getByRole("checkbox", { name: /Loja Exemplo/ }).check(); await page.screenshot({ path: `${OUT}/02-editor-de-acesso.png`, fullPage: true });
  await row.getByRole("button", { name: "Salvar acesso" }).click(); await row.getByText("Acesso atualizado.").waitFor();
  await page.goto(`${BASE}/app/equipe`); await page.getByText("Restrito: 1 conta(s)").waitFor(); await page.screenshot({ path: `${OUT}/03-equipe-com-acesso.png`, fullPage: true }); log("administrador libera somente a conta da Loja");

  // Rafael: só vê a Loja
  await pb.goto(`${BASE}/app`); await pb.getByText("Acesso restrito a 1 conta(s)").waitFor();
  const camps = (await (await pb.goto(`${BASE}/app/campanhas`))!.text());
  assert.ok(camps.includes("Remarketing") && !camps.includes("Agendamentos") && !camps.includes("Clínica Vida")); await pb.screenshot({ path: `${OUT}/04-rafael-ve-so-loja.png`, fullPage: true }); log("Rafael vê só as campanhas da conta liberada");
  await pb.goto(`${BASE}/app`); await pb.screenshot({ path: `${OUT}/05-painel-rafael.png`, fullPage: true });
  const cl = await (await pb.goto(`${BASE}/app/clientes`))!.text(); assert.ok(cl.includes("Cliente Loja") && !cl.includes("Cliente Clínica")); log("lista de clientes mostra só o cliente da conta liberada");

  // 404 na campanha da Clínica
  await page.goto(`${BASE}/app/campanhas`); await page.getByRole("link", { name: "Agendamentos – Consulta" }).click(); await page.waitForURL(/\/app\/campanhas\/[0-9a-f-]{36}/);
  const clinUrl = page.url(); const r = await pb.goto(clinUrl); assert.equal(r!.status(), 404); await pb.screenshot({ path: `${OUT}/06-campanha-fora-do-acesso-404.png`, fullPage: true }); log("campanha de conta não liberada = 404");

  // ações organizacionais negadas
  await pb.goto(`${BASE}/app/atividades`); await pb.getByText("não tem acesso ao histórico").waitFor();
  await pb.goto(`${BASE}/app/clientes`); assert.equal(await pb.getByRole("button", { name: "Adicionar cliente" }).count(), 0); log("restrito não vê atividades nem cadastra clientes");

  // relatório do Rafael não contém a Clínica
  const csv = await (await pb.request.get(`${BASE}/api/relatorios/exportar?tipo=campaigns&dias=30&formato=csv`)).text();
  assert.ok(csv.includes("Remarketing") && !csv.includes("Agendamentos")); log("exportação CSV do restrito não contém a conta não liberada");
  const bad = await pb.request.get(`${BASE}/api/relatorios/exportar?tipo=campaigns&dias=30&formato=csv&conta=${clinUrl.split("/").pop()?.slice(0, 0)}`); void bad;

  // operação de campanha da Clínica criada pelo admin: Rafael não vê
  await page.goto(clinUrl); await page.click("button:has-text('Pausar campanha')"); await page.waitForURL(/\/app\/operacoes\//); const opUrl = page.url();
  const ro = await pb.goto(opUrl); assert.equal(ro!.status(), 404); log("operação de conta não liberada = 404");
  await pb.goto(`${BASE}/app/operacoes`); assert.ok(!(await pb.locator("main").innerText()).includes("Agendamentos")); log("histórico de operações não lista a conta não liberada");

  await browser.close(); console.log("E2E ACESSO OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
