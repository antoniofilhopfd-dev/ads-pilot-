// Adaptador da Evolution API (WhatsApp). NÃO validado contra uma instância real: os testes usam um servidor HTTP local de simulação.
// Lições do AdFlow aplicadas: caixa de saída com chave de idempotência, reserva atômica antes de enviar, e status "uncertain"
// quando a resposta se perde depois do envio (nunca reenviar às cegas).
import { randomUUID } from "node:crypto";
import { and, eq, inArray, lte, or, isNull } from "drizzle-orm";
import { db } from "@/db";
import { notificationRecipients, outbox } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { logger } from "@/lib/logger";

export type EvolutionConfig = { url: string; apiKey: string; instance: string };
export function evolutionConfig(env: Record<string, string | undefined> = process.env): EvolutionConfig | null {
  const url = env.EVOLUTION_API_URL?.trim().replace(/\/+$/, ""), apiKey = env.EVOLUTION_API_KEY?.trim(), instance = env.EVOLUTION_INSTANCE?.trim();
  if (!url || !apiKey || !instance) return null;
  try { const u = new URL(url); if (u.protocol !== "https:" && u.hostname !== "localhost" && u.hostname !== "127.0.0.1") return null; } catch { return null; }
  return { url, apiKey, instance };
}

// Só dígitos, com DDI. Aceita "+55 (11) 91234-5678". Brasil: 55 + DDD + 8/9 dígitos.
export function normalizePhone(raw: string): string {
  const d = raw.replace(/[\s().+-]/g, "");
  if (!/^\d{10,15}$/.test(d)) throw new AppError("validation", "Telefone inválido. Use DDI+DDD+número, ex.: 5511912345678.");
  if (d.startsWith("55") && (d.length < 12 || d.length > 13)) throw new AppError("validation", "Número brasileiro inválido (55 + DDD + 8 ou 9 dígitos).");
  return d;
}

export type SendResult = { ok: true; messageId: string | null } | { ok: false; uncertain: boolean; error: string; permanent: boolean };

export async function sendText(cfg: EvolutionConfig, phone: string, text: string, fetchImpl: typeof fetch = fetch, timeoutMs = 10_000): Promise<SendResult> {
  let res: Response;
  try {
    res = await fetchImpl(`${cfg.url}/message/sendText/${encodeURIComponent(cfg.instance)}`, {
      method: "POST", headers: { "Content-Type": "application/json", apikey: cfg.apiKey }, body: JSON.stringify({ number: phone, text }), signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    // Não sabemos se a requisição chegou: pode ter sido entregue. Não reenviar automaticamente.
    const refused = (e as { cause?: { code?: string } })?.cause?.code === "ECONNREFUSED";
    return { ok: false, uncertain: !refused, permanent: false, error: refused ? "Evolution API indisponível (conexão recusada)." : "Sem resposta da Evolution API (a mensagem pode ter sido enviada)." };
  }
  const body = (await res.json().catch(() => undefined)) as { key?: { id?: string }; message?: string; response?: { message?: unknown } } | undefined;
  if (res.ok) return { ok: true, messageId: body?.key?.id ?? null };
  const msg = `Evolution API respondeu ${res.status}.`;
  if (res.status === 401 || res.status === 403) return { ok: false, uncertain: false, permanent: true, error: `${msg} Verifique a chave da API.` };
  if (res.status === 400 || res.status === 404) return { ok: false, uncertain: false, permanent: true, error: `${msg} Verifique o número e a instância.` };
  return { ok: false, uncertain: res.status >= 500 && res.status !== 503, permanent: false, error: msg };
}

const ymd = (d: Date) => d.toISOString().slice(0, 10);
const SEV = { info: 0, warning: 1, critical: 2 } as const;

export async function enqueueAlertMessages(organizationId: string, items: { alertId: string; severity: keyof typeof SEV; title: string; entityName: string; message: string; adAccountId: string | null }[], now = new Date()) {
  const recipients = await db.select().from(notificationRecipients).where(and(eq(notificationRecipients.organizationId, organizationId), eq(notificationRecipients.active, true)));
  let queued = 0;
  for (const it of items) for (const r of recipients) {
    if (SEV[it.severity] < SEV[r.minSeverity]) continue;
    const body = `AdsPilot — ${it.title}\n${it.entityName}\n${it.message}`.slice(0, 1000);
    try {
      await db.insert(outbox).values({ id: randomUUID(), organizationId, channel: "whatsapp", recipientId: r.id, idempotencyKey: `alert:${it.alertId}:${r.id}:${ymd(now)}`, body, nextAttemptAt: now });
      queued++;
    } catch (e) { const code = (e as { cause?: { code?: string } })?.cause?.code; if (code !== "ER_DUP_ENTRY") throw e; }
  }
  return queued;
}

export async function enqueueTest(organizationId: string, recipientId: string, now = new Date()) {
  const [r] = await db.select().from(notificationRecipients).where(and(eq(notificationRecipients.id, recipientId), eq(notificationRecipients.organizationId, organizationId)));
  if (!r) throw new AppError("not_found", "Destinatário não encontrado.");
  const id = randomUUID();
  await db.insert(outbox).values({ id, organizationId, channel: "whatsapp", recipientId: r.id, idempotencyKey: `test:${r.id}:${now.getTime()}`, body: "AdsPilot — mensagem de teste. Se você recebeu isto, o canal WhatsApp está funcionando.", nextAttemptAt: now });
  return id;
}

const MAX_ATTEMPTS = 5;
// Envia as mensagens pendentes. Cada mensagem é RESERVADA por atualização condicional (pending/failed → sending): dois processos nunca enviam a mesma.
export async function dispatchOutbox(opts: { organizationId?: string; fetchImpl?: typeof fetch; now?: Date; env?: Record<string, string | undefined>; limit?: number } = {}) {
  const now = opts.now ?? new Date();
  const cfg = evolutionConfig(opts.env);
  const due = await db.select().from(outbox).where(and(
    opts.organizationId ? eq(outbox.organizationId, opts.organizationId) : undefined,
    inArray(outbox.status, ["pending", "failed", "blocked"]), or(isNull(outbox.nextAttemptAt), lte(outbox.nextAttemptAt, now)),
  )).limit(opts.limit ?? 50);
  const out = { sent: 0, failed: 0, blocked: 0, uncertain: 0 };
  for (const m of due) {
    if (!cfg) { await db.update(outbox).set({ status: "blocked", lastError: "Canal WhatsApp não configurado (EVOLUTION_API_URL/KEY/INSTANCE)." }).where(eq(outbox.id, m.id)); out.blocked++; continue; }
    if (m.attempts >= MAX_ATTEMPTS) continue;
    const [claim] = await db.update(outbox).set({ status: "sending", attempts: m.attempts + 1 }).where(and(eq(outbox.id, m.id), inArray(outbox.status, ["pending", "failed", "blocked"])));
    if (claim.affectedRows !== 1) continue; // outro processo reservou
    const [r] = await db.select().from(notificationRecipients).where(eq(notificationRecipients.id, m.recipientId));
    if (!r || !r.active) { await db.update(outbox).set({ status: "failed", lastError: "Destinatário inativo ou removido.", nextAttemptAt: null, attempts: MAX_ATTEMPTS }).where(eq(outbox.id, m.id)); out.failed++; continue; }
    const res = await sendText(cfg, r.phone, m.body, opts.fetchImpl);
    if (res.ok) { await db.update(outbox).set({ status: "sent", sentAt: new Date(), providerMessageId: res.messageId, lastError: null, nextAttemptAt: null }).where(eq(outbox.id, m.id)); out.sent++; }
    else if (res.uncertain) { await db.update(outbox).set({ status: "uncertain", lastError: res.error, nextAttemptAt: null }).where(eq(outbox.id, m.id)); out.uncertain++; }
    else {
      const giveUp = res.permanent || m.attempts + 1 >= MAX_ATTEMPTS;
      await db.update(outbox).set({ status: "failed", lastError: res.error, nextAttemptAt: giveUp ? null : new Date(now.getTime() + Math.pow(2, m.attempts + 1) * 60_000), attempts: giveUp ? MAX_ATTEMPTS : m.attempts + 1 }).where(eq(outbox.id, m.id));
      out.failed++; logger.warn("outbox_send_failed", { id: m.id, permanent: res.permanent });
    }
  }
  return out;
}

export async function listOutbox(organizationId: string, limit = 30) {
  return db.select({ o: outbox, name: notificationRecipients.name }).from(outbox).innerJoin(notificationRecipients, eq(notificationRecipients.id, outbox.recipientId)).where(eq(outbox.organizationId, organizationId)).orderBy(outbox.createdAt).limit(limit);
}
