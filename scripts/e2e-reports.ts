// E2E Etapa 05 (modo DEMONSTRAÇÃO). Baixa PDF/XLSX/CSV pelo navegador, confere e renderiza o PDF em PNG.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/etapa-05/prints", AM = "docs/etapa-05/amostras";
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
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  const log = (m: string) => console.log("✔", m);
  await signup(page, A);
  await page.goto(`${BASE}/app/clientes`); await page.fill("#name", "Loja Exemplo"); await page.click("button:has-text('Adicionar cliente')"); await page.getByText("Cliente criado.").waitFor();
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i); await row.getByLabel("Acompanhar").check();
    if ((await row.locator("td").first().innerText()).includes("Loja Exemplo")) await row.locator("select").selectOption({ label: "Loja Exemplo" });
    await row.getByRole("button", { name: "Salvar" }).click(); await row.getByText("Conta atualizada.").waitFor();
  }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();

  await page.goto(`${BASE}/app/relatorios`); await page.screenshot({ path: `${OUT}/01-relatorios.png`, fullPage: true });
  await page.selectOption("select[name=tipo]", "executive"); await page.click("button:has-text('Visualizar relatório')"); await page.waitForURL(/relatorios\/ver/);
  await page.getByText("Resumo executivo").first().waitFor(); await page.getByText("Hipótese").first().waitFor().catch(() => {});
  await page.screenshot({ path: `${OUT}/02-relatorio-executivo-tela.png`, fullPage: true }); log("relatório executivo visualizado no aplicativo");

  // downloads reais pelo navegador
  const get = async (label: string, ext: string) => {
    const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: label, exact: true }).click()]);
    const path = `${AM}/relatorio-executivo.${ext}`; await dl.saveAs(path); return path;
  };
  const pdf = await get("PDF", "pdf"), xlsx = await get("XLSX", "xlsx"), csv = await get("CSV", "csv");
  assert.equal(readFileSync(pdf).subarray(0, 5).toString(), "%PDF-"); assert.equal(readFileSync(xlsx).subarray(0, 2).toString(), "PK");
  assert.equal(readFileSync(csv).subarray(0, 3).toString("hex"), "efbbbf"); log("PDF, XLSX e CSV baixados com assinatura válida");

  // verificação independente (poppler) do PDF
  const info = execFileSync("pdfinfo", [pdf]).toString(); const pages = Number(/Pages:\s+(\d+)/.exec(info)![1]);
  const text = execFileSync("pdftotext", ["-layout", pdf, "-"]).toString();
  assert.ok(text.includes("Agência Marina") && text.includes("DADOS SIMULADOS") && text.includes(`Página ${pages} de ${pages}`)); log(`PDF conferido com pdfinfo/pdftotext (${pages} páginas)`);
  execFileSync("pdftoppm", ["-png", "-r", "60", "-f", "1", "-l", "3", pdf, `${OUT}/pdf-pagina`]);

  // cabeçalhos da rota: verificado
  const resp = await page.request.get(`${BASE}/api/relatorios/exportar?tipo=campaigns&dias=30&formato=csv`);
  assert.equal(resp.status(), 200); assert.equal(resp.headers()["x-export-verified"], "true"); log("rota de exportação devolve X-Export-Verified");
  assert.equal((await page.request.get(`${BASE}/api/relatorios/exportar?tipo=campaigns&formato=exe`)).status(), 400); log("formato inválido recusado");

  // modelos e histórico
  await page.goto(`${BASE}/app/relatorios`);
  await page.fill("#tpl-name", "Resumo mensal — Loja"); await page.locator("form", { hasText: "Salvar como modelo" }).locator("select[name=cliente]").selectOption({ label: "Loja Exemplo" });
  await page.click("button:has-text('Salvar como modelo')"); await page.getByText("Modelo salvo.").waitFor();
  await page.goto(`${BASE}/app/relatorios`); await page.getByRole("link", { name: "Resumo mensal — Loja" }).waitFor();
  await page.getByText("Verificado (").first().waitFor(); await page.screenshot({ path: `${OUT}/03-modelos-e-historico.png`, fullPage: true }); log("modelo salvo e exportações listadas como verificadas");

  // outros tipos de relatório na tela
  for (const t of ["client", "spend_budget", "health", "changes"]) { await page.goto(`${BASE}/app/relatorios/ver?tipo=${t}&dias=30`); await page.getByRole("heading", { level: 1 }).waitFor(); }
  await page.goto(`${BASE}/app/relatorios/ver?tipo=spend_budget&dias=30`); await page.screenshot({ path: `${OUT}/04-gastos-orcamentos.png`, fullPage: true });

  // isolamento e permissão
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pb = await ctxB.newPage();
  assert.equal((await ctxB.request.get(`${BASE}/api/relatorios/exportar?tipo=campaigns&formato=csv`)).status(), 401); log("exportação sem login = 401");
  await signup(pb, B);
  const clientsPage = await page.goto(`${BASE}/app/clientes`); void clientsPage;
  const cid = (await page.locator("form input[name=clientId]").first().getAttribute("value"))!;
  const r404 = await pb.request.get(`${BASE}/api/relatorios/exportar?tipo=campaigns&cliente=${cid}&formato=csv`); assert.equal(r404.status(), 404); log("cliente de outra organização na exportação = 404");
  const b = await pb.request.get(`${BASE}/api/relatorios/exportar?tipo=campaigns&formato=csv`); assert.equal(b.status(), 200);
  assert.ok(!(await b.text()).includes("Remarketing")); log("exportação da org B não contém campanhas da org A");
  await pb.goto(`${BASE}/app/relatorios/ver?tipo=executive`); await pb.screenshot({ path: `${OUT}/05-org-b-sem-dados.png`, fullPage: true });

  // celular
  await page.setViewportSize({ width: 390, height: 844 }); await page.goto(`${BASE}/app/relatorios/ver?tipo=executive&dias=30`);
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth), false); await page.screenshot({ path: `${OUT}/06-mobile-relatorio.png`, fullPage: true }); log("relatório sem rolagem horizontal da página em 390px");
  await browser.close(); console.log("E2E RELATÓRIOS OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
