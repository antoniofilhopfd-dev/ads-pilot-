// Cria, no banco de DEV, um usuário com senha conhecida e uma conexão Meta (fake) com token cifrado — para o teste de restauração.
import { register } from "../src/server/services/auth";
import { getActor } from "../src/server/context";
import { connectWithToken, configureAccount, listAccounts } from "../src/server/meta/connection";
import { syncAccount } from "../src/server/meta/sync";
import { closeDb } from "../src/db";
import type { MetaProvider } from "../src/server/meta/types";

(async () => {
  const email = `restore-${Date.now().toString(36)}@exemplo.com`;
  const { userId, organizationId } = await register({ name: "Teste Restore", email, password: "SenhaRestore2026", organizationName: "Org Restore" });
  const actor = await getActor(userId, organizationId);
  const fake: MetaProvider = { mode: "meta", listAdAccounts: async () => [{ externalId: "act_5", name: "Conta Teste", currency: "BRL", timezone: null, status: "1" }],
    listCampaigns: async () => [{ externalId: "c1", name: "Camp", objective: "OUTCOME_SALES", status: "ACTIVE", effectiveStatus: "ACTIVE", dailyBudget: 50, lifetimeBudget: null, startTime: null, stopTime: null }],
    listAdSets: async () => [], listAds: async () => [], getDailyInsights: async () => [{ campaignExternalId: "c1", date: new Date().toISOString().slice(0, 10), spend: 10, impressions: 1000, reach: null, clicks: 20, results: 2, resultType: "purchase", purchaseValue: null }] };
  await connectWithToken(actor, "EAAB-token-de-teste-restore", 5_000_000, fake);
  const [a] = await listAccounts(actor); await configureAccount(actor, a.id, { selected: true, clientId: null }); await syncAccount(actor, a.id, { provider: fake, sleep: async () => {} });
  console.log(email); await closeDb();
})();
