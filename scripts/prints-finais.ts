// Prints finais do app inteiro (modo DEMONSTRAÇÃO): semeia dados pelas próprias telas e fotografa cada rota.
import { chromium, type Page } from "playwright";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/v2/etapa-07/prints";
const run = Date.now().toString(36);
const month = new Date().toISOString().slice(0, 7);
const log = (m: string) => console.log("✔", m);

function png(w = 400, h = 300) {
  const crc = (b: Buffer) => { let c, t = 0xffffffff; for (const x of b) { c = (t ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t = (t >>> 8) ^ c; } return (t ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows: Buffer[] = [];
  for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = 36 + Math.floor((x / w) * 80); row[2 + x * 3] = 59 + Math.floor((y / h) * 40); row[3 + x * 3] = 128 + Math.floor((x / w) * 80); } rows.push(row); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  mkdirSync("/tmp/prints-finais", { recursive: true }); writeFileSync("/tmp/prints-finais/logo.png", png(300, 100)); writeFileSync("/tmp/prints-finais/cri.png", png());
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const page: Page = await ctx.newPage();
  const go = async (p: string) => { await page.goto(`${BASE}${p}`); await page.waitForLoadState("networkidle"); };
  const shot = async (n: string, p?: string) => { if (p) await go(p); await page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); };

  await go("/login"); await page.screenshot({ path: `${OUT}/00-login.png` });
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", "Marina Gestora"); await page.fill("#organizationName", "Agência Horizonte"); await page.fill("#email", `final-${run}@exemplo.com`); await page.fill("#password", "SenhaForte2026");
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  await go("/app/configuracoes"); await page.setInputFiles("#logo-file", "/tmp/prints-finais/logo.png"); await page.click("button:has-text('Enviar logo')"); await page.getByText("Logo atualizada.").waitFor();
  await go("/app/clientes"); await page.fill("#name", "Loja Exemplo"); await page.click("button:has-text('Adicionar cliente')"); await page.getByText("Cliente criado.").waitFor();
  await go("/app/integracoes"); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { const row = rows.nth(i); await row.getByLabel("Acompanhar").check(); if ((await row.locator("td").first().innerText()).includes("Loja Exemplo")) await row.locator("select").selectOption({ label: "Loja Exemplo" }); await row.getByRole("button", { name: "Salvar" }).click(); await row.getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();

  // semeadura
  await go("/app/orcamentos"); await page.selectOption("select[name=alvo]", { index: 0 }); await page.fill("input[name=valor]", "9000"); await page.click("button:has-text('Salvar orçamento')"); await page.getByText("Orçamento planejado salvo.").waitFor();
  await page.selectOption("select[name=alvo]", { index: 1 }); await page.fill("input[name=valor]", "100"); await page.click("button:has-text('Salvar orçamento')"); await page.getByText("Orçamento planejado salvo.").waitFor();
  await go("/app/metas"); await page.selectOption("select[name=alvo]", { index: 0 }); await page.selectOption("select[name=metrica]", "ctr"); await page.selectOption("select[name=direcao]", "min"); await page.fill("input[name=meta]", "1"); await page.click("button:has-text('Salvar meta')"); await page.getByText("Meta salva.").waitFor();
  await page.selectOption("select[name=alvo]", { index: 0 }); await page.selectOption("select[name=metrica]", "cpc"); await page.selectOption("select[name=direcao]", "max"); await page.fill("input[name=meta]", "5"); await page.click("button:has-text('Salvar meta')"); await page.getByText("Meta salva.").waitFor();
  await go("/app/pastas"); await page.locator("form", { hasText: "Criar etiqueta" }).locator("input[name=name]").fill("Black Friday"); await page.click("button:has-text('Criar etiqueta')"); await page.getByText("Etiqueta criada.").waitFor();
  await go("/app/publicos?modelo=vendas_amplo"); await page.fill("input[name=name]", "Vendas amplo 18-65"); await page.click("button:has-text('Salvar público')"); await page.getByText(/Público salvo/).waitFor();
  await go("/app/criativos"); await page.fill("input[name=name]", "Criativo verão"); await page.setInputFiles("input[name=imagem]", "/tmp/prints-finais/cri.png"); await page.fill("input[name=titulo]", "Verão com 30% OFF"); await page.fill("input[name=url]", "https://loja.exemplo.com/verao"); await page.click("button:has-text('Salvar criativo')"); await page.getByText("Criativo salvo.").waitFor();
  await go("/app/rascunhos"); await page.click("button:has-text('Novo rascunho')"); await page.waitForURL(/rascunhos\/.+etapa=1/); await page.selectOption("select[name=adAccountId]", { index: 1 }); await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=2/);
  await go("/app/utm"); await page.fill("input[name=url]", "https://loja.exemplo.com/verao"); await page.fill("input[name=campanha]", "Promoção Verão"); await page.click("button:has-text('Gerar e salvar no histórico')"); await page.getByText(/utm_campaign=promocao_verao/).first().waitFor();
  await go("/app/canais"); await page.fill("input[name=name]", "Plantão de tráfego"); await page.fill("input[name=phone]", "5511912345678"); await page.click("button:has-text('Cadastrar')"); await page.getByText("Destinatário cadastrado.").waitFor();
  await go("/app/alertas"); await page.click("button:has-text('Reavaliar alertas agora')"); await page.getByText(/Avaliação concluída/).waitFor();
  log("dados de demonstração semeados pelas telas");

  const routes: [string, string][] = [
    ["01-painel", "/app"], ["02-campanhas", "/app/campanhas"], ["04-operacoes", "/app/operacoes"], ["05-clientes", "/app/clientes"],
    ["06-orcamentos", "/app/orcamentos"], ["07-metas", "/app/metas"], ["08-publicos", "/app/publicos"], ["09-criativos", "/app/criativos"], ["10-rascunhos", "/app/rascunhos"], ["11-pastas", "/app/pastas"],
    ["12-utm", "/app/utm"], ["13-checklists", "/app/checklists"], ["14-simuladores", "/app/simuladores?sim=e&orcf=3000&cpm=25&ctr=1,5&lead=8&fecha=20&ticketf=400"], ["15-experimentos", "/app/experimentos"],
    ["16-alertas", "/app/alertas"], ["17-diagnosticos", "/app/diagnosticos"], ["18-comparar", "/app/comparar"], ["19-notificacoes", "/app/notificacoes"],
    ["20-relatorios", "/app/relatorios"], ["21-atividades", "/app/atividades"], ["22-integracoes", "/app/integracoes"], ["23-canais", "/app/canais"], ["24-mcp", "/app/mcp"], ["25-equipe", "/app/equipe"], ["26-configuracoes", "/app/configuracoes"], ["27-conta", "/app/conta"],
  ];
  for (const [n, p] of routes) { await shot(n, p); log(`print ${n}`); }
  await go("/app/campanhas"); await page.getByRole("link", { name: /Remarketing/ }).first().click(); await page.waitForLoadState("networkidle"); await shot("03-campanha-detalhe");
  await go("/app/relatorios/ver?tipo=executive&dias=30"); await page.getByText("Resumo executivo").first().waitFor(); await shot("20b-relatorio-executivo");

  // celular
  const m = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2 });
  const cookies = await ctx.cookies(); await m.addCookies(cookies);
  const mp = await m.newPage();
  for (const [n, p] of [["m1-painel", "/app"], ["m2-campanhas", "/app/campanhas"], ["m3-alertas", "/app/alertas"], ["m4-orcamentos", "/app/orcamentos"]]) { await mp.goto(`${BASE}${p}`); await mp.waitForLoadState("networkidle"); await mp.screenshot({ path: `${OUT}/${n}.png`, fullPage: true }); }
  log("prints em tela de celular");
  await browser.close();
}
main().catch((e) => { console.error("✘", e); process.exit(1); });
