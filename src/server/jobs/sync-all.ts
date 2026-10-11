import { eq } from "drizzle-orm";
import { db } from "@/db";
import { metaConnections } from "@/db/schema";
import { logger } from "@/lib/logger";
import { getActor } from "../context";
import { syncAllSelected } from "../meta/sync";

// Sincroniza as contas selecionadas de todas as organizações com conexão ativa. Chamado pelo script
// (`npm run sync`) e pela rota `POST /api/cron/sync`. Idempotente: a trava por conta impede sobreposição.
export async function runScheduledSync() {
  const conns = await db.select().from(metaConnections).where(eq(metaConnections.status, "active"));
  const out: { organizationId: string; synced: number; failed: number; error?: string }[] = [];
  for (const c of conns) {
    if (!c.connectedBy) continue;
    try {
      const actor = await getActor(c.connectedBy, c.organizationId);
      const res = await syncAllSelected(actor, { trigger: "scheduled" });
      const failed = res.filter((r) => "error" in r || ("status" in r && r.status === "failed")).length;
      out.push({ organizationId: c.organizationId, synced: res.length - failed, failed });
    } catch (e) {
      logger.error("scheduled_sync_org_failed", { organizationId: c.organizationId, error: e instanceof Error ? e.message : String(e) });
      out.push({ organizationId: c.organizationId, synced: 0, failed: 1, error: "falha ao sincronizar a organização" });
    }
  }
  return out;
}
