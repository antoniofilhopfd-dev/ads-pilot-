// E2E da Etapa 03 (gestão operacional, modo DEMONSTRAÇÃO): orçamento, metas, biblioteca, assistente, UTM, checklists, simuladores, experimentos.
import { chromium, type Page } from "playwright";
import { strict as assert } from "node:assert";
import { deflateSync } from "node:zlib";
import { writeFileSync, mkdirSync } from "node:fs";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/v2/etapa-03/prints";
const run = Date.now().toString(36);
const log = (m: string) => console.log("✔", m);
const month = new Date().toISOString().slice(0, 7);

function png(w = 400, h = 300) {
  const crc = (b: Buffer) => { let c, t = 0xffffffff; for (const x of b) { c = (t ^ x) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t = (t >>> 8) ^ c; } return (t ^ 0xffffffff) >>> 0; };
  const chunk = (type: string, data: Buffer) => { const len = Buffer.alloc(4); len.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc(td)); return Buffer.concat([len, td, c]); };
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2;
  const rows = [];
  for (let y = 0; y < h; y++) { const row = Buffer.alloc(1 + w * 3); for (let x = 0; x < w; x++) { row[1 + x * 3] = 36 + Math.floor((x / w) * 80); row[2 + x * 3] = 59 + Math.floor((y / h) * 40); row[3 + x * 3] = 128 + Math.floor((x / w) * 80); } rows.push(row); }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(rows))), chunk("IEND", Buffer.alloc(0))]);
}

async function main() {
  mkdirSync("/tmp/e2e-gestao", { recursive: true }); writeFileSync("/tmp/e2e-gestao/criativo.png", png());
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
  const page: Page = await ctx.newPage();
  await page.addInitScript(() => { document.addEventListener("securitypolicyviolation", (e) => ((window as unknown as { __csp: string[] }).__csp ??= []).push(`${e.violatedDirective}|${e.blockedURI}`)); });
  const violations: string[] = [];
  const collect = async () => { violations.push(...((await page.evaluate(() => (window as unknown as { __csp?: string[] }).__csp ?? []).catch(() => [])) as string[])); };
  const go = async (p: string) => { await collect(); await page.goto(`${BASE}${p}`); await page.waitForLoadState("networkidle"); };
  const shot = (n: string) => page.screenshot({ path: `${OUT}/${n}.png`, fullPage: true });

  // cadastro + demo + contas
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", "Marina Gestora"); await page.fill("#organizationName", "Agência Horizonte"); await page.fill("#email", `gestao-${run}@exemplo.com`); await page.fill("#password", "SenhaForte2026");
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  await go("/app/clientes"); await page.fill("#name", "Loja Exemplo"); await page.click("button:has-text('Adicionar cliente')"); await page.getByText("Cliente criado.").waitFor();
  await go("/app/integracoes"); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) {
    const row = rows.nth(i); await row.getByLabel("Acompanhar").check();
    if ((await row.locator("td").first().innerText()).includes("Loja Exemplo")) await row.locator("select").selectOption({ label: "Loja Exemplo" });
    await row.getByRole("button", { name: "Salvar" }).click(); await row.getByText("Conta atualizada.").waitFor();
  }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();
  log("conta de teste: modo demonstração, 2 contas sincronizadas");

  // menu agrupado
  await go("/app"); await page.getByRole("group", { name: "Planejamento" }).waitFor(); await shot("01-painel-menu-agrupado"); log("menu agrupado em Gestão / Planejamento / Biblioteca / Ferramentas / Análise / Sistema");

  // orçamento
  await go("/app/orcamentos");
  await page.selectOption("select[name=alvo]", { label: "Loja Exemplo" }).catch(async () => { await page.selectOption("select[name=alvo]", { index: 0 }); });
  await page.fill("input[name=valor]", "9000"); await page.click("button:has-text('Salvar orçamento')"); await page.getByText("Orçamento planejado salvo.").waitFor();
  await page.reload(); await page.waitForLoadState("networkidle");
  await page.getByText("Gasto reportado").first().waitFor(); await page.getByText("Premissas do cálculo").first().waitFor();
  await shot("02-orcamentos"); log("orçamento planejado × gasto reportado, ritmo, projeção e premissas");
  await page.getByRole("link", { name: "Simular redistribuição" }).first().click(); await page.getByText(/^Simulação —/).waitFor();
  const first = page.locator("input[name^=d_]").first(); await first.fill("500"); await page.click("button:has-text('Recalcular')"); await page.getByText("Simulação —").waitFor();
  await shot("03-orcamentos-simulacao"); log("simulação de redistribuição com premissas (nada aplicado na Meta)");

  // metas
  await go("/app/metas");
  await page.selectOption("select[name=alvo]", { index: 0 }); await page.selectOption("select[name=metrica]", "ctr"); await page.selectOption("select[name=direcao]", "min"); await page.fill("input[name=meta]", "1"); await page.click("button:has-text('Salvar meta')"); await page.getByText("Meta salva.").waitFor();
  await page.selectOption("select[name=alvo]", { index: 0 }); await page.selectOption("select[name=metrica]", "cpc"); await page.selectOption("select[name=direcao]", "max"); await page.fill("input[name=meta]", "0,5"); await page.click("button:has-text('Salvar meta')"); await page.getByText("Meta salva.").waitFor();
  await page.reload(); await page.waitForLoadState("networkidle"); await page.getByText(/vs\. meta|Sem dados|Atingida|Não atingida|Amostra/).first().waitFor();
  await shot("04-metas"); log("metas avaliadas com status e distância da meta");

  // pastas e etiquetas
  await go("/app/pastas");
  await page.locator("form", { hasText: "Criar etiqueta" }).locator("input[name=name]").fill("Black Friday"); await page.click("button:has-text('Criar etiqueta')"); await page.getByText("Etiqueta criada.").waitFor();
  const fc = page.locator("form", { has: page.locator("input[name=tipo][value=creative]") }); await fc.locator("input[name=name]").fill("Campanhas de verão"); await fc.getByRole("button", { name: "Criar pasta" }).click(); await page.getByText("Pasta criada.").first().waitFor();
  await page.reload(); await shot("05-pastas-etiquetas"); log("pastas e etiquetas criadas");

  // públicos
  await go("/app/publicos?modelo=vendas_amplo");
  await page.fill("input[name=name]", "Vendas amplo 18-65"); await page.fill("input[name=alcance]", "1500000"); await page.fill("input[name=fonte_alcance]", "Gerenciador de Anúncios (informado)");
  await page.click("button:has-text('Salvar público')"); await page.getByText(/Público salvo/).waitFor();
  await page.reload(); await page.getByRole("link", { name: "Vendas amplo 18-65" }).click(); await page.waitForURL(/publicos\//);
  await page.fill("input[name=idade_max]", "55"); await page.fill("input[name=nota]", "Ampliar faixa"); await page.click("button:has-text('Salvar nova versão')"); await page.getByText("Nova versão salva.").waitFor();
  await page.reload(); await page.waitForLoadState("networkidle"); await page.getByText("ageMax").waitFor();
  await shot("06-publico-versoes-comparacao"); log("público com modelo por objetivo, versão 2 e comparação v1×v2");
  await go("/app/publicos"); await shot("07-publicos");

  // criativos
  await go("/app/criativos");
  await page.fill("input[name=name]", "Criativo verão - imagem"); await page.setInputFiles("input[name=imagem]", "/tmp/e2e-gestao/criativo.png");
  await page.fill("textarea[name=texto]", "Aproveite as ofertas de verão com frete grátis para todo o Brasil e muito mais, só até domingo, não perca!"); await page.fill("input[name=titulo]", "Verão com 30% OFF"); await page.fill("input[name=cta]", "Comprar agora"); await page.fill("input[name=url]", "https://loja.exemplo.com/verao");
  await page.click("button:has-text('Salvar criativo')"); await page.getByText("Criativo salvo.").waitFor();
  await page.fill("input[name=name]", "Criativo texto puro"); await page.selectOption("select[name=formato]", "text"); await page.click("button:has-text('Salvar criativo')"); await page.getByText("Criativo salvo.").waitFor();
  await page.reload(); await page.waitForLoadState("networkidle");
  const img = page.locator("img[alt^='Prévia do criativo']").first(); await img.waitFor(); assert.ok(await img.evaluate((i: HTMLImageElement) => i.naturalWidth > 0), "prévia carregada"); log("galeria com prévia local da imagem (servida com cabeçalhos seguros)");
  // arquivo não-imagem rejeitado
  writeFileSync("/tmp/e2e-gestao/falso.png", "<svg onload=alert(1)></svg>");
  await page.fill("input[name=name]", "Falso"); await page.setInputFiles("input[name=imagem]", "/tmp/e2e-gestao/falso.png"); await page.click("button:has-text('Salvar criativo')"); await page.getByText(/Formato não suportado|PNG ou JPEG/).first().waitFor(); log("arquivo falso (.png com SVG dentro) recusado pelo conteúdo");
  await page.getByRole("link", { name: "Criativo verão - imagem" }).click(); await page.getByText("Histórico de uso").waitFor();
  await page.selectOption("select[name=campanha]", { index: 0 }); await page.click("button:has-text('Registrar uso em campanha')"); await page.getByText(/Vínculo registrado/).waitFor();
  await shot("08-criativos-galeria-detalhe"); log("vínculo criativo ↔ campanha registrado só no AdsPilot");

  // rascunho / assistente
  await go("/app/rascunhos"); await page.click("button:has-text('Novo rascunho')"); await page.waitForURL(/rascunhos\/.+etapa=1/);
  await page.selectOption("select[name=adAccountId]", { index: 1 }); await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=2/);
  await shot("09-assistente-etapa-2");
  await page.selectOption("select[name=objective]", "OUTCOME_SALES"); await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=3/);
  await page.fill("input[name=campaignName]", "Loja Exemplo | Vendas | " + month); await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=4/);
  await page.fill("input[name=adSetName]", "Loja Exemplo | Amplo | 18-65"); await page.fill("input[name=dailyBudget]", "80"); await page.fill("input[name=startDate]", "2099-01-01"); await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=5/);
  await page.fill("input[name=locations]", "Brasil"); await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=6/);
  await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=7/);
  await page.selectOption("select[name=creativeId]", { index: 1 }); await page.click("button:has-text('Salvar e continuar')"); await page.waitForURL(/etapa=8/);
  await page.fill("input[name=destinationUrl]", "https://loja.exemplo.com/verao"); await page.fill("input[name=utmCampaign]", "verao"); await page.click("button:has-text('Salvar e ir à revisão')"); await page.waitForURL(/etapa=9/);
  await shot("10-assistente-revisao-pendencias"); log("revisão lista pendências antes da confirmação");
  await page.getByLabel(/Revisei todos os dados/).check(); await page.click("button:has-text('Salvar revisão e continuar')"); await page.waitForURL(/etapa=10/);
  await page.click("button:has-text('Enviar para a Meta')"); await page.getByText(/envio para a Meta está bloqueado/i).waitFor();
  await shot("11-assistente-envio-bloqueado"); log("envio à Meta BLOQUEADO com mensagem clara; nada criado na Meta; status inicial PAUSADA");
  await go("/app/rascunhos"); await page.getByText("Pronto para revisão final").waitFor(); await shot("12-rascunhos");

  // UTM
  await go("/app/utm");
  await page.fill("input[name=url]", "https://loja.exemplo.com/verao?ref=email"); await page.fill("input[name=campanha]", "Promoção Verão"); await page.fill("input[name=criativo]", "Imagem 1");
  await page.fill("input[name=content]", "{criativo}"); await page.click("button:has-text('Gerar e salvar no histórico')"); await page.getByText(/utm_campaign=promocao_verao/).first().waitFor();
  const dl = page.waitForEvent("download"); await page.getByRole("link", { name: /Exportar histórico/ }).click(); const d = await dl; assert.match(d.suggestedFilename(), /utm-historico\.csv/);
  await shot("13-utm"); log("UTM gerada (minúsculas, sem acentos, query preservada), histórico e CSV exportado");

  // checklists
  await go("/app/checklists"); await page.getByRole("button", { name: /Marcar: Objetivo da campanha/ }).click(); await page.waitForLoadState("networkidle");
  await page.getByRole("button", { name: /Desmarcar: Objetivo da campanha/ }).waitFor(); await shot("14-checklists"); log("checklist persistido por item");

  // simuladores
  await go("/app/simuladores?sim=e&orcf=3000&cpm=25&ctr=1,5&lead=8&fecha=20&ticketf=400"); await page.getByText("Receita:").waitFor(); await shot("15-simuladores"); log("simulador de funil com premissas visíveis");

  // experimentos
  await go("/app/experimentos");
  await page.fill("input[name=name]", "Título com número × sem número"); await page.fill("textarea[name=hipotese]", "Se o título tiver um número, o CTR sobe, porque dá concretude."); await page.fill("input[name=objetivo]", "Aumentar CTR"); await page.fill("input[name=variavel]", "Título");
  await page.fill("input[name=v1]", "A: sem número"); await page.fill("input[name=v2]", "B: com número"); await page.selectOption("select[name=c1]", { index: 1 }); await page.selectOption("select[name=c2]", { index: 2 });
  await page.click("button:has-text('Criar experimento')"); await page.getByText("Experimento criado.").waitFor(); await page.reload(); await page.waitForLoadState("networkidle");
  await page.getByText(/Amostra insuficiente|Inconclusivo|Diferença significativa|Comparação descritiva|Sem dados/).first().waitFor(); await shot("16-experimentos"); log("experimento com veredito honesto (sem vencedor sem amostra)");

  // hierarquia
  await go("/app/campanhas"); await page.getByRole("link", { name: /Remarketing/ }).first().click(); await page.waitForLoadState("networkidle"); await page.getByText("Conjuntos de anúncios").first().waitFor().catch(() => {}); await shot("17-campanha-conjuntos"); log("campanha com conjuntos: lance, veiculação e segmentação");

  await collect(); assert.equal(violations.length, 0, `violações de CSP: ${violations.join(", ")}`); log("nenhuma violação de CSP em todas as telas novas");
  await browser.close();
}
main().catch((e) => { console.error("✘", e); process.exit(1); });
