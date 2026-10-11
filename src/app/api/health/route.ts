import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { db } from "@/db";

// Verificação de saúde para monitoramento/pós-publicação. Retorna só booleanos (nunca valores de configuração).
export async function GET() {
  const checks: Record<string, boolean> = {};
  try { await db.execute(sql`select 1`); checks.database = true; } catch { checks.database = false; }
  checks.encryptionKey = Buffer.from(process.env.ENCRYPTION_KEY ?? "", "base64").length === 32;
  checks.appUrlHttps = (process.env.APP_URL ?? "").startsWith("https://");
  checks.metaAppConfigured = !!process.env.META_APP_ID && !!process.env.META_APP_SECRET;
  checks.emailProviderConfigured = false; // envio de e-mail (SMTP) ainda não implementado
  const ok = checks.database && checks.encryptionKey;
  return NextResponse.json({ status: ok ? "ok" : "degraded", checks, time: new Date().toISOString() }, { status: ok ? 200 : 503, headers: { "Cache-Control": "no-store" } });
}
