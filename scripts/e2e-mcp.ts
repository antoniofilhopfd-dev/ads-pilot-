// E2E Etapa 06: cliente MCP OFICIAL (SDK) por HTTP real + navegador para as ações humanas. Prints em docs/etapa-06/prints.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { chromium } from "playwright";
import { strict as assert } from "node:assert";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const OUT = "docs/etapa-06/prints";
const run = Date.now().toString(36);
const U = { name: "Marina Souza", email: `marina6-${run}@exemplo.com`, org: "Agência Horizonte", pw: "SenhaForte2026" };
const log = (m: string) => console.log("✔", m);

const mcp = async (token: string) => {
  const c = new Client({ name: "e2e-cliente-mcp", version: "1.0.0" });
  await c.connect(new StreamableHTTPClientTransport(new URL(`${BASE}/api/mcp`), { requestInit: { headers: { Authorization: `Bearer ${token}` } } }));
  return c;
};
const call = async (c: Client, name: string, args: Record<string, unknown> = {}) => {
  const r = (await c.callTool({ name, arguments: args })) as { isError?: boolean; content: { text: string }[] };
  return { isError: !!r.isError, json: JSON.parse(r.content[0].text) };
};

async function main() {
  const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
  const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
  await page.goto(`${BASE}/cadastro`);
  await page.fill("#name", U.name); await page.fill("#organizationName", U.org); await page.fill("#email", U.email); await page.fill("#password", U.pw);
  await page.click("button[type=submit]"); await page.waitForURL(/\/app$/);
  await page.goto(`${BASE}/app/integracoes`); await page.click("button:has-text('Ativar modo demonstração')"); await page.getByText("Demonstração — dados simulados").waitFor();
  const rows = page.locator("tbody tr").filter({ hasText: "act_9000" });
  for (let i = 0; i < 2; i++) { await rows.nth(i).getByLabel("Acompanhar").check(); await rows.nth(i).getByRole("button", { name: "Salvar" }).click(); await rows.nth(i).getByText("Conta atualizada.").waitFor(); }
  await page.click("button:has-text('Sincronizar todas')"); await page.getByText("2 conta(s) sincronizada(s).").waitFor();

  // token criado pela PESSOA na interface
  await page.goto(`${BASE}/app/mcp`); await page.screenshot({ path: `${OUT}/01-assistentes-mcp.png`, fullPage: true });
  await page.fill("#mcp-name", "Claude Desktop (teste)"); await page.getByLabel("Escrita controlada").check(); await page.click("button:has-text('Criar token')");
  const msg = await page.getByText("Token criado — copie agora").innerText(); const token = /adp_mcp_[A-Za-z0-9_-]+/.exec(msg)![0];
  await page.screenshot({ path: `${OUT}/02-token-criado.png`, fullPage: true }); log("token criado na interface (mostrado uma vez)");

  // sem token → 401 (HTTP real)
  assert.equal((await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" })).status, 401); log("sem token = 401");

  const c = await mcp(token);
  const { tools } = await c.listTools(); assert.ok(tools.length >= 24); log(`cliente MCP oficial conectado; ${tools.length} ferramentas listadas`);
  const camps = await call(c, "list_campaigns", { days: 30 });
  assert.equal(camps.json.pagination.total, 6); assert.match(camps.json.context.dataSource, /DEMONSTRAÇÃO/); log("list_campaigns com contexto (origem, sincronização, limitações)");
  const rm = camps.json.data.find((x: { name: string }) => x.name.startsWith("Remarketing"));
  assert.equal((await call(c, "get_report", { type: "executive" })).json.ok, true); log("get_report devolve relatório com fatos/hipóteses");

  // escrita: assistente prepara, mas não executa
  const prep = (await call(c, "prepare_campaign_pause", { campaignId: rm.id, clientRequestId: `e2e-${run}-1` })).json.data;
  assert.equal(prep.status, "prepared");
  const blocked = await call(c, "execute_operation", { operationId: prep.operationId, confirmationCode: "AAAA-AAAA" });
  assert.equal(blocked.isError, true); log("assistente NÃO consegue executar sem o código humano");

  // a pessoa revisa e gera o código na interface
  await page.goto(`${BASE}/app/operacoes/${prep.operationId}`); await page.getByText("Preparada por um assistente de IA").waitFor();
  await page.click("button:has-text('Gerar código para o assistente')"); const cmsg = await page.getByText("Código de confirmação:").innerText();
  const code = /[A-Z2-9]{4}-[A-Z2-9]{4}/.exec(cmsg)![0]; await page.screenshot({ path: `${OUT}/03-codigo-de-confirmacao.png`, fullPage: true });
  const done = await call(c, "execute_operation", { operationId: prep.operationId, confirmationCode: code });
  assert.equal(done.json.data.status, "succeeded"); assert.equal(done.json.data.verified, true); log("execução com o código humano: concluída e VERIFICADA");
  await page.goto(`${BASE}/app/operacoes/${prep.operationId}`); await page.getByText("Confirmado no estado remoto").waitFor(); await page.screenshot({ path: `${OUT}/04-operacao-via-mcp-verificada.png`, fullPage: true });
  assert.equal((await call(c, "execute_operation", { operationId: prep.operationId, confirmationCode: code })).json.data.status, "succeeded"); log("repetir a chamada é idempotente");

  // auditoria visível ao usuário
  await page.goto(`${BASE}/app/atividades`); await page.getByText("Campanha pausada").first().waitFor(); await page.screenshot({ path: `${OUT}/05-atividades.png`, fullPage: true });

  // revogação imediata
  await page.goto(`${BASE}/app/mcp`); page.once("dialog", (d) => d.accept()); await page.click("button:has-text('Revogar')");
  await page.getByText("Revogado").waitFor(); await page.screenshot({ path: `${OUT}/06-token-revogado.png`, fullPage: true });
  await assert.rejects(() => call(c, "list_clients")); log("token revogado: o cliente perde o acesso na hora");
  assert.equal((await fetch(`${BASE}/api/mcp`, { method: "POST", headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", Accept: "application/json, text/event-stream" }, body: "{}" })).status, 401);
  await c.close().catch(() => {}); await browser.close(); console.log("E2E MCP OK");
}
main().catch((e) => { console.error("E2E FALHOU:", e.message); process.exit(1); });
