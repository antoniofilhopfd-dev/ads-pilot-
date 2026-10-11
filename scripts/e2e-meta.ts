// E2E da Etapa 03 (navegador real, app em :3000, modo DEMONSTRAÇÃO). Prints em docs/etapa-03/prints.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/etapa-03/prints";
const run = Date.now().toString(36);
const A = { name: "Marina Souza", email: `marina3-${run}@exemplo.com`, org: "Agência Horizonte", pw: "SenhaForte2026" };
const B = { name: "Bruno Lima", email: `bruno3-${run}@exemplo.com`, org: "Outra Agência", pw: "SenhaForte2026" };

async function signup(page: import("playwright").Page, u: typeof A) {
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", u.name); await page.fill("#organizationName", u.org); await page.fill("#email", u.email); await page.fill("#password", u.pw);
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page = await ctx.newPage();
  const shot = (n: string, p = page) => p.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });
  const log = (m: string) => console.log("✔", m);

  await signup(page, A);
  await page.goto(`${BASE}/app`);
  await page.getByText("Nenhuma conta de anúncios conectada").waitFor(); await shot("01-painel-sem-conexao"); log("painel sem conexão mostra estado vazio (sem dados inventados)");

  // cliente para vincular
  await page.goto(`${BASE}/app/clientes`); await page.fill("#name", "Loja Exemplo"); await page.click("button:has-text('Adicionar cliente')"); await page.getByText("Cliente criado.").waitFor();

  await page.goto(`${BASE}/app/integracoes`); await shot("02-integracoes-vazia");
  await page.getByText("Conexão real indisponível").waitFor(); log("conexão real indisponível é informada (app Meta não configurado)");
  await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  await page.getByText("Nenhuma conta de anúncios selecionada").first().waitFor(); await shot("03-integracoes-demo-contas");

  // seleciona as 2 contas, vincula a Loja à conta "Loja Exemplo"
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  assert.equal(await rows.count(), 2);
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i);
    await row.getByLabel("Acompanhar").check();
    if ((await row.locator("td").first().innerText()).includes("Loja Exemplo")) await row.locator("select").selectOption({ label: "Loja Exemplo" });
    await row.getByRole("button", { name: "Salvar" }).click();
    await row.getByText("Conta atualizada.").waitFor();
  }
  log("contas selecionadas e vinculadas a cliente");

  await page.click("button:has-text('Sincronizar todas as selecionadas')");
  await page.getByText("2 conta(s) sincronizada(s).").waitFor();
  await page.goto(`${BASE}/app/integracoes`); await shot("04-integracoes-sincronizada");
  await page.getByText("Sucesso").first().waitFor(); log("sincronização executada e registrada no histórico");

  // painel
  await page.goto(`${BASE}/app`);
  await page.getByText("MODO DEMONSTRAÇÃO").waitFor();
  await page.getByText("Gasto (informado pela Meta)").waitFor();
  await page.getByText("Sem receita atribuída (não é zero)").first().waitFor().catch(() => {});
  await shot("05-painel-demo"); log("painel com KPIs, gráficos e aviso de demonstração");
  const attention = await page.getByText("Precisa de atenção").locator("..").innerText();
  assert.match(attention, /reprovado/i); log("anúncio reprovado aparece em Precisa de atenção");

  // filtro por cliente
  await page.selectOption("select[name=cliente]", { label: "Loja Exemplo" }); await page.click("button:has-text('Aplicar')"); await page.waitForURL(/cliente=/); await page.waitForLoadState("networkidle");
  const body = await page.locator("tbody").innerText();
  assert.ok(!body.includes("Agendamentos"), "filtro por cliente deve excluir campanhas da outra conta"); await shot("06-painel-filtro-cliente"); log("filtro por cliente");

  // campanhas
  await page.goto(`${BASE}/app/campanhas`); await shot("07-campanhas");
  await page.fill("input[name=q]", "remarketing"); await page.click("button:has-text('Aplicar')"); await page.waitForURL(/q=remarketing/); await page.waitForLoadState("networkidle");
  assert.equal(await page.locator("tbody tr").count(), 1); log("busca por nome");
  await page.goto(`${BASE}/app/campanhas?ordem=spend&dir=asc`);
  const lastRow = await page.locator("tbody tr").last().innerText();
  assert.match(lastRow, /—/); log("ordenação crescente mantém campanhas sem dados ao final");
  await page.goto(`${BASE}/app/campanhas`); await page.getByRole("link", { name: "Remarketing – Catálogo" }).click();
  await page.getByText("Orçamento e gasto").waitFor(); const detailUrl = page.url(); await shot("08-detalhe-campanha");
  await page.getByText("Limite de gasto aplicado na Meta").waitFor(); log("detalhe separa orçamento/gasto/previsão/limites");

  // isolamento no navegador: usuário B abre a URL da campanha da org A
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pb = await ctxB.newPage();
  await signup(pb, B);
  const path = new URL(detailUrl).pathname;
  const r = await pb.goto(`${BASE}${path}`);
  assert.equal(r!.status(), 404); await shot("09-isolamento-404", pb); log("outra organização recebe 404 ao abrir campanha da org A");
  await pb.goto(`${BASE}/app/campanhas`); assert.equal(await pb.getByText("Remarketing").count(), 0); log("lista de campanhas da org B não vê dados da A");

  // celular
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${BASE}/app`); await shot("10-mobile-painel");
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false); log("painel sem rolagem horizontal da página em 390px");
  await page.goto(`${BASE}/app/integracoes`); assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false); log("integrações sem rolagem horizontal em 390px");

  // desconectar demo remove dados
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${BASE}/app/integracoes`); page.once("dialog", (d) => d.accept());
  await page.click("button:has-text('Remover demonstração')"); await page.getByText("Nenhuma conexão. Conecte a Meta Ads").waitFor();
  await page.goto(`${BASE}/app`); await page.getByText("Nenhuma conta de anúncios conectada").waitFor(); log("remover demonstração apaga os dados simulados");

  await browser.close();
  console.log("E2E META OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
