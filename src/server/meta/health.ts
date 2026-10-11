import { and, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, syncRuns } from "@/db/schema";
import { accountCond, assertCan, type Actor } from "../context";
import { getConnection, REQUIRED_SCOPES } from "./connection";
import { STALE_AFTER_HOURS } from "./sync";

export type Health = Awaited<ReturnType<typeof getHealth>>;

// Conexão ativa ≠ dados atualizados: os dois são avaliados separadamente.
export async function getHealth(actor: Actor, now = new Date()) {
  assertCan(actor, "insights.read");
  const conn = await getConnection(actor);
  if (!conn) return { state: "none" as const, connection: null, accounts: [], instructions: ["Conecte a Meta (ou ative o modo demonstração) para começar."] };

  const accts = await db.select().from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), accountCond(actor, adAccounts.id))).orderBy(adAccounts.name);
  const accounts = [];
  for (const a of accts) {
    const runs = await db.select().from(syncRuns).where(eq(syncRuns.adAccountId, a.id)).orderBy(desc(syncRuns.startedAt)).limit(20);
    const lastAttempt = runs[0] ?? null;
    const lastSuccess = runs.find((r) => r.status === "success" || r.status === "partial") ?? null;
    const running = runs.some((r) => r.status === "running");
    const ageH = a.lastSyncedAt ? (now.getTime() - a.lastSyncedAt.getTime()) / 3_600_000 : null;
    accounts.push({
      id: a.id, name: a.name, selected: a.isSelected, lastSyncedAt: a.lastSyncedAt, running,
      stale: a.isSelected && (ageH === null || ageH > STALE_AFTER_HOURS),
      neverSynced: a.lastSyncedAt === null,
      lastSuccess: lastSuccess ? { at: lastSuccess.finishedAt, status: lastSuccess.status } : null,
      lastAttempt: lastAttempt ? { at: lastAttempt.startedAt, status: lastAttempt.status, errorCode: lastAttempt.errorCode, errorMessage: lastAttempt.errorMessage } : null,
    });
  }

  const missingScopes = conn.mode === "meta" ? REQUIRED_SCOPES.filter((s) => !(conn.grantedScopes ?? []).includes(s)) : [];
  const daysToExpire = conn.tokenExpiresAt ? Math.floor((conn.tokenExpiresAt.getTime() - now.getTime()) / 86_400_000) : null;
  const instructions: string[] = [];
  let state: "ok" | "attention" | "critical" = "ok";
  const bump = (s: "attention" | "critical") => { if (s === "critical" || state === "ok") state = s; };

  if (conn.status === "needs_reconnect") { bump("critical"); instructions.push("O acesso à Meta expirou ou foi revogado. Reconecte a conta para voltar a sincronizar."); }
  if (conn.status === "revoked") { bump("critical"); instructions.push("A conexão foi desconectada. Conecte novamente para atualizar os dados."); }
  if (missingScopes.length) { bump("critical"); instructions.push(`Permissões ausentes: ${missingScopes.join(", ")}. Reconecte e conceda as permissões.`); }
  if (daysToExpire !== null && daysToExpire <= 7 && conn.status === "active") { bump("attention"); instructions.push(`O token de acesso expira em ${Math.max(daysToExpire, 0)} dia(s). Reconecte antes disso.`); }
  for (const a of accounts) {
    if (a.lastAttempt && (a.lastAttempt.status === "failed" || a.lastAttempt.status === "interrupted")) { bump("attention"); instructions.push(`Última sincronização de “${a.name}” falhou (${a.lastAttempt.errorMessage ?? a.lastAttempt.status}). Tente novamente.`); }
    if (a.lastAttempt?.status === "partial") { bump("attention"); instructions.push(`Sincronização de “${a.name}” foi parcial: ${a.lastAttempt.errorMessage}`); }
    if (a.stale) { bump("attention"); instructions.push(a.neverSynced ? `“${a.name}” ainda não foi sincronizada.` : `Dados de “${a.name}” estão desatualizados (mais de ${STALE_AFTER_HOURS} h).`); }
  }
  if (!accounts.some((a) => a.selected)) { bump("attention"); instructions.push("Nenhuma conta de anúncios selecionada. Selecione as contas que o AdsPilot deve acompanhar."); }

  return { state, connection: { mode: conn.mode, status: conn.status, lastError: conn.lastError, tokenExpiresAt: conn.tokenExpiresAt, grantedScopes: conn.grantedScopes, missingScopes, daysToExpire }, accounts, instructions };
}
