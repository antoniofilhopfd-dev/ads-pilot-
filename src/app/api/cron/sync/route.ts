import { NextResponse } from "next/server";
import { logger } from "@/lib/logger";
import { cronAuthorized } from "@/server/jobs/cron-auth";
import { runScheduledSync } from "@/server/jobs/sync-all";

// Para hospedagens sem shell: agende `curl -X POST -H "x-cron-secret: $CRON_SECRET" https://dominio/api/cron/sync`.
export async function POST(req: Request) {
  if (!cronAuthorized(req.headers.get("x-cron-secret"))) return NextResponse.json({ error: "não autorizado" }, { status: 401 });
  const started = Date.now();
  const results = await runScheduledSync();
  logger.info("cron_sync_done", { organizations: results.length, ms: Date.now() - started });
  return NextResponse.json({ ok: true, results }, { headers: { "Cache-Control": "no-store" } });
}
