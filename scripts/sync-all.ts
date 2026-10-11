// Sincroniza as contas selecionadas de todas as organizações com conexão ativa.
// Para agendar (ex.: cron da hospedagem, a cada 6 h):  npm run sync
import { eq } from "drizzle-orm";
import { closeDb, db } from "../src/db";
import { metaConnections } from "../src/db/schema";
import { getActor } from "../src/server/context";
import { syncAllSelected } from "../src/server/meta/sync";

async function main() {
  const conns = await db.select().from(metaConnections).where(eq(metaConnections.status, "active"));
  for (const c of conns) {
    if (!c.connectedBy) continue;
    try {
      const actor = await getActor(c.connectedBy, c.organizationId);
      const res = await syncAllSelected(actor, { trigger: "scheduled" });
      console.log(JSON.stringify({ org: c.organizationId, results: res }));
    } catch (e) {
      console.error(JSON.stringify({ org: c.organizationId, error: e instanceof Error ? e.message : String(e) }));
    }
  }
  await closeDb();
}
main();
