// Auditoria automatizada de acessibilidade (axe-core, WCAG 2.0/2.1 A e AA) nas telas principais. App em :3000.
// Cobre só o que ferramenta automática detecta (~30–40% dos problemas); não substitui teste manual com leitor de tela.
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const run = Date.now().toString(36);
const extra = (process.env.A11Y_EXTRA_PATHS ?? "").split(",").filter(Boolean);

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 900 } })).newPage();
  const results: { path: string; violations: { id: string; impact: string | null | undefined; help: string; nodes: number; sample: string }[] }[] = [];
  const check = async (path: string) => {
    await page.goto(`${BASE}${path}`);
    await page.waitForLoadState("networkidle");
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const dup = await page.evaluate(() => { const ids = [...document.querySelectorAll("[id]")].map((e) => e.id); return [...new Set(ids.filter((i, k) => ids.indexOf(i) !== k))]; });
    const violations = r.violations.map((v) => ({ id: v.id, impact: v.impact as string | null | undefined, help: v.help, nodes: v.nodes.length, sample: v.nodes[0]?.html.slice(0, 120) ?? "" }));
    if (dup.length) violations.push({ id: "duplicate-id", impact: "serious", help: `IDs duplicados: ${dup.join(", ")}`, nodes: dup.length, sample: "" });
    results.push({ path, violations });
  };

  for (const p of ["/login", "/cadastro", "/recuperar-senha", "/privacidade", "/termos"]) await check(p);
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", "Axe Teste"); await page.fill("#organizationName", "Org Axe"); await page.fill("#email", `axe-${run}@exemplo.com`); await page.fill("#password", "SenhaForte2026");
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { await rows.nth(i).getByLabel("Acompanhar").check(); await rows.nth(i).getByRole("button", { name: "Salvar" }).click(); await rows.nth(i).getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();
  const camp = await (async () => { await page.goto(`${BASE}/app/campanhas`); return page.getByRole("link", { name: "Remarketing – Catálogo" }).getAttribute("href"); })();
  for (const p of ["/app", "/app/campanhas", camp!, "/app/clientes", "/app/equipe", "/app/atividades", "/app/configuracoes", "/app/integracoes", "/app/conta", ...extra]) await check(p);
  await browser.close();

  let total = 0;
  for (const r of results) {
    if (r.violations.length) console.log(`✘ ${r.path}`);
    for (const v of r.violations) { total++; console.log(`   [${v.impact}] ${v.id}: ${v.help} (${v.nodes}×) ${v.sample}`); }
    if (!r.violations.length) console.log(`✔ ${r.path}`);
  }
  console.log(total ? `\n${total} tipo(s) de violação` : "\nAXE OK: nenhuma violação detectável automaticamente");
  process.exit(total ? 1 : 0);
}
main();
