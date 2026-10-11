// E2E da logo da empresa nos relatórios. Prints em docs/logo-relatorio/prints.
import { chromium } from "playwright";
import { strict as assert } from "node:assert";
import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import ExcelJS from "exceljs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/logo-relatorio/prints", AM = "docs/logo-relatorio/amostras";
const run = Date.now().toString(36);
const mk = (n: string) => ({ name: n, email: `${n.toLowerCase()}-${run}@exemplo.com`, org: `Agência ${n}`, pw: "SenhaForte2026" });
const A = mk("Marina"), B = mk("Bruno");
const log = (m: string) => console.log("✔", m);

async function signup(page: import("playwright").Page, u: typeof A) {
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", u.name); await page.fill("#organizationName", u.org); await page.fill("#email", u.email); await page.fill("#password", u.pw);
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
}

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page = await ctx.newPage();
  await signup(page, A);
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { await rows.nth(i).getByLabel("Acompanhar").check(); await rows.nth(i).getByRole("button", { name: "Salvar" }).click(); await rows.nth(i).getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();

  // sem logo
  await page.goto(`${BASE}/app/configuracoes`); await page.getByText("Nenhuma logo cadastrada.").waitFor(); await page.screenshot({ path: `${OUT}/01-configuracoes-sem-logo.png`, fullPage: true });
  assert.equal((await ctx.request.get(`${BASE}/api/logo`)).status(), 404); log("sem logo: /api/logo = 404");

  // SVG é recusado
  writeFileSync("/tmp/logo-malicioso.svg", '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
  await page.setInputFiles("#logo-file", "/tmp/logo-malicioso.svg"); await page.click("button:has-text('Enviar logo')");
  await page.getByText("Formato não suportado").waitFor(); await page.screenshot({ path: `${OUT}/02-svg-recusado.png`, fullPage: true }); log("SVG (possível script) é recusado");
  // um .png falso (texto) também
  writeFileSync("/tmp/falso.png", "isto não é uma imagem".repeat(20));
  await page.setInputFiles("#logo-file", "/tmp/falso.png"); await page.click("button:has-text('Enviar logo')"); await page.getByText("Formato não suportado").waitFor(); log("arquivo .png falso (texto) é recusado pelo conteúdo");

  // envia a logo de exemplo
  await page.setInputFiles("#logo-file", "tests/fixtures/logo-demo.png"); await page.click("button:has-text('Enviar logo')"); await page.getByText("Logo atualizada.").waitFor();
  await page.goto(`${BASE}/app/configuracoes`); await page.getByAltText(/Logo atual de/).waitFor();
  assert.ok(await page.getByAltText(/Logo atual de/).evaluate((i: HTMLImageElement) => i.naturalWidth > 0)); await page.screenshot({ path: `${OUT}/03-configuracoes-com-logo.png`, fullPage: true }); log("logo enviada e exibida em Configurações");

  // cabeçalhos da rota
  const r = await ctx.request.get(`${BASE}/api/logo`); const h = r.headers();
  assert.equal(r.status(), 200); assert.equal(h["content-type"], "image/png"); assert.equal(h["x-content-type-options"], "nosniff"); assert.match(h["content-security-policy"], /sandbox/); log("servida como image/png com nosniff e CSP sandbox");
  assert.equal((await ctx.request.get(`${BASE}/api/logo`, { headers: { "If-None-Match": h["etag"] } })).status(), 304); log("cache por ETag (304)");

  // relatório na tela
  await page.goto(`${BASE}/app/relatorios/ver?tipo=executive&dias=30`);
  const img = page.getByAltText(/Logo de Agência Marina/); await img.waitFor(); assert.ok(await img.evaluate((i: HTMLImageElement) => i.naturalWidth > 0));
  await page.screenshot({ path: `${OUT}/04-relatorio-na-tela-com-logo.png`, fullPage: false }); log("logo aparece na visualização do relatório");

  // downloads: PDF e XLSX com logo
  const get = async (label: string, ext: string) => { const [dl] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: label, exact: true }).click()]); const p = `${AM}/relatorio-com-logo.${ext}`; await dl.saveAs(p); return p; };
  const pdf = await get("PDF", "pdf"), xlsx = await get("XLSX", "xlsx");
  execFileSync("pdftoppm", ["-png", "-r", "70", "-f", "1", "-l", "2", pdf, `${OUT}/pdf-com-logo`]);
  const imgs = execFileSync("pdfimages", ["-list", pdf]).toString().split("\n").filter((l) => /^\s*1\s/.test(l)).length; assert.ok(imgs >= 1); log(`PDF baixado: pdfimages encontrou ${imgs} imagem(ns) na página 1`);
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(xlsx); assert.equal(wb.getWorksheet("Resumo")!.getImages().length, 1); log("XLSX baixado: aba Resumo contém a logo");

  // outra organização não vê a logo
  const ctxB = await browser.newContext({ viewport: { width: 1440, height: 900 } }); const pb = await ctxB.newPage();
  assert.equal((await ctxB.request.get(`${BASE}/api/logo`)).status(), 401); log("sem login: /api/logo = 401");
  await signup(pb, B); assert.equal((await ctxB.request.get(`${BASE}/api/logo`)).status(), 404); log("organização B não recebe a logo da A (404)");
  await pb.goto(`${BASE}/app/relatorios/ver?tipo=executive`); assert.equal(await pb.getByAltText(/Logo de/).count(), 0);

  // trocar por JPEG e remover
  await page.goto(`${BASE}/app/configuracoes`); await page.setInputFiles("#logo-file", "tests/fixtures/logo-demo.jpg"); await page.click("button:has-text('Trocar logo')"); await page.getByText("Logo atualizada.").waitFor(); log("troca por JPEG");
  await page.goto(`${BASE}/app/configuracoes`); page.once("dialog", (d) => d.accept()); await page.click("button:has-text('Remover logo')"); await page.getByText("Nenhuma logo cadastrada.").waitFor();
  await page.goto(`${BASE}/app/relatorios/ver?tipo=executive`); assert.equal(await page.getByAltText(/Logo de/).count(), 0); log("logo removida: relatório volta ao padrão");
  await browser.close(); console.log("E2E LOGO OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
