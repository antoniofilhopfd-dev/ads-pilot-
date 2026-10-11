import { randomUUID } from "node:crypto";
import { and, desc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { adAccounts, alertSettings, alerts, DEFAULT_ALERT_CONFIG, memberships, notifications, type AlertConfig } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { campaignFindings } from "@/lib/analysis";
import { audit } from "./audit";
import { enqueueAlertMessages } from "./notify/evolution";
import { loadFacts } from "./analysis";
import { accountCond, assertCan, getActor, type Actor } from "./context";
import { listBudgets } from "./budget";
import { evaluateGoals } from "./goals";
import { STALE_AFTER_HOURS } from "./meta/sync";
import { z } from "zod";

export async function getAlertConfig(organizationId: string): Promise<AlertConfig> {
  const [s] = await db.select().from(alertSettings).where(eq(alertSettings.organizationId, organizationId));
  return { ...DEFAULT_ALERT_CONFIG, ...(s?.config ?? {}), enabled: { ...(s?.config?.enabled ?? {}) } };
}
const cfgSchema = z.object({
  costRisePct: z.number().min(5).max(500), ctrDropPct: z.number().min(5).max(100), frequencyMax: z.number().min(1.5).max(20), minImpressions: z.number().int().min(100).max(1_000_000), minResults: z.number().int().min(1).max(10_000),
  noDeliveryDays: z.number().int().min(1).max(7), renotifyHours: z.number().int().min(1).max(720), responsibleUserIds: z.array(z.string().uuid()).max(50), enabled: z.record(z.string(), z.boolean()),
});
export async function saveAlertConfig(actor: Actor, input: unknown) {
  assertCan(actor, "budgets.manage");
  const p = cfgSchema.safeParse(input);
  if (!p.success) throw new AppError("validation", `Valor fora do intervalo permitido em “${p.error.issues[0].path.join(".")}”.`);
  const members = await db.select({ u: memberships.userId }).from(memberships).where(eq(memberships.organizationId, actor.organizationId));
  const ok = new Set(members.map((m) => m.u));
  if (p.data.responsibleUserIds.some((u) => !ok.has(u))) throw new AppError("validation", "Responsável não pertence à organização.");
  const before = await getAlertConfig(actor.organizationId);
  const cfg = p.data as unknown as AlertConfig;
  await db.insert(alertSettings).values({ organizationId: actor.organizationId, config: cfg, updatedBy: actor.userId }).onDuplicateKeyUpdate({ set: { config: cfg, updatedBy: actor.userId, updatedAt: new Date() } });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "alerts.config", objectType: "alert_settings", objectId: actor.organizationId, before: before as never, after: cfg as never, result: "success", requestId: actor.requestId });
}

const n2 = (v: number | null | undefined) => (v === null || v === undefined ? "—" : v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

type Candidate = { dedupeKey: string; type: (typeof alerts.$inferInsert)["type"]; severity: "info" | "warning" | "critical"; adAccountId: string | null; entityType: string; entityId: string; entityName: string; title: string; message: string; facts: Record<string, string | number | null>; assumptions?: string[] };

// Avalia TODAS as regras da organização e reconcilia com os alertas existentes (idempotente):
// problema novo → abre; ainda ocorrendo → atualiza (sem duplicar); deixou de ocorrer → resolve; reapareceu → reabre.
export async function evaluateAlerts(organizationId: string, now = new Date()) {
  const cfg = await getAlertConfig(organizationId);
  const on = (k: keyof AlertConfig["enabled"]) => cfg.enabled[k] !== false;
  const cands: Candidate[] = [];
  for (const f of await loadFacts(organizationId, null, now, { noDeliveryDays: cfg.noDeliveryDays }))
    for (const x of campaignFindings(f, cfg)) cands.push({ dedupeKey: `${x.type}:${f.id}`, type: x.type, severity: x.severity, adAccountId: f.accountId, entityType: "campaign", entityId: f.id, entityName: f.name, title: x.title, message: x.message, facts: x.facts, assumptions: x.assumptions });

  const [admin] = await db.select({ u: memberships.userId }).from(memberships).where(and(eq(memberships.organizationId, organizationId), eq(memberships.role, "admin"))).limit(1);
  if (admin) {
    const sys = await getActor(admin.u, organizationId);
    const period = now.toISOString().slice(0, 7);
    if (on("budget_projection") || on("budget_exceeded"))
      for (const b of await listBudgets(sys, period, now)) {
        const label = b.scope === "client" ? "Cliente" : b.scope === "account" ? "Conta" : "Campanha";
        const acct = b.scope === "account" ? b.scopeId : null;
        if (b.pacing.status === "excedido" && on("budget_exceeded")) cands.push({ dedupeKey: `budget_exceeded:${b.scope}:${b.scopeId}:${b.period}`, type: "budget_exceeded", severity: "critical", adAccountId: acct, entityType: "budget", entityId: b.id, entityName: `${label}: ${b.scopeLabel}`, title: "Orçamento planejado excedido", message: `O gasto reportado (${n2(b.pacing.spent)}) passou do planejado (${n2(b.amount)}) em ${b.period}.`, facts: { planejado: b.amount, gasto: b.pacing.spent }, assumptions: b.pacing.assumptions });
        else if (b.pacing.status === "projecao_excede" && on("budget_projection")) cands.push({ dedupeKey: `budget_projection:${b.scope}:${b.scopeId}:${b.period}`, type: "budget_projection", severity: "warning", adAccountId: acct, entityType: "budget", entityId: b.id, entityName: `${label}: ${b.scopeLabel}`, title: "Projeção excede o orçamento planejado", message: `Mantido o ritmo, o gasto fecharia em ${n2(b.pacing.projectedClose)} contra ${n2(b.amount)} planejados.`, facts: { planejado: b.amount, projecao: b.pacing.projectedClose, gasto: b.pacing.spent }, assumptions: b.pacing.assumptions });
      }
    if (on("goal_not_met"))
      for (const g of await evaluateGoals(sys, now)) if (g.status === "nao_atingida")
        cands.push({ dedupeKey: `goal_not_met:${g.id}`, type: "goal_not_met", severity: "warning", adAccountId: g.scope === "account" ? g.scopeId : null, entityType: "goal", entityId: g.id, entityName: `${g.scopeLabel} · ${g.metric.toUpperCase()}`, title: "Meta não atingida", message: `${g.metric.toUpperCase()} atual ${n2(g.current)} × meta ${n2(g.target)} (últimos ${g.windowDays} dias).`, facts: { atual: g.current, meta: g.target, distancia_pct: g.gapPct === null ? null : Math.round(g.gapPct * 10) / 10 } });
  }
  if (on("stale_sync")) {
    for (const a of await db.select().from(adAccounts).where(and(eq(adAccounts.organizationId, organizationId), eq(adAccounts.isSelected, true)))) {
      const ageH = a.lastSyncedAt ? (now.getTime() - a.lastSyncedAt.getTime()) / 3_600_000 : null;
      if (ageH === null || ageH > STALE_AFTER_HOURS) cands.push({ dedupeKey: `stale_sync:${a.id}`, type: "stale_sync", severity: "warning", adAccountId: a.id, entityType: "account", entityId: a.id, entityName: a.name, title: "Dados desatualizados", message: ageH === null ? "A conta ainda não foi sincronizada." : `Última sincronização há ${Math.floor(ageH)} h.`, facts: { horas_desde_sync: ageH === null ? null : Math.floor(ageH) } });
    }
  }

  const existing = await db.select().from(alerts).where(eq(alerts.organizationId, organizationId));
  const byKey = new Map(existing.map((e) => [e.dedupeKey, e]));
  const seen = new Set<string>();
  const toNotify: { alertId: string; row: Candidate }[] = [];
  let opened = 0, updated = 0, resolved = 0;
  for (const c of cands) {
    seen.add(c.dedupeKey);
    const detail = { message: c.message, facts: c.facts, assumptions: c.assumptions };
    const cur = byKey.get(c.dedupeKey);
    if (!cur) {
      const id = randomUUID();
      await db.insert(alerts).values({ id, organizationId, dedupeKey: c.dedupeKey, type: c.type, severity: c.severity, adAccountId: c.adAccountId, entityType: c.entityType, entityId: c.entityId, entityName: c.entityName.slice(0, 300), title: c.title, detail, firstSeenAt: now, lastSeenAt: now });
      toNotify.push({ alertId: id, row: c }); opened++;
    } else if (cur.state === "resolved") {
      await db.update(alerts).set({ state: "open", severity: c.severity, detail, title: c.title, entityName: c.entityName.slice(0, 300), occurrences: cur.occurrences + 1, lastSeenAt: now, resolvedAt: null, acknowledgedAt: null, acknowledgedBy: null }).where(eq(alerts.id, cur.id));
      toNotify.push({ alertId: cur.id, row: c }); opened++;
    } else {
      await db.update(alerts).set({ severity: c.severity, detail, title: c.title, entityName: c.entityName.slice(0, 300), occurrences: cur.occurrences + 1, lastSeenAt: now }).where(eq(alerts.id, cur.id));
      const due = cur.state === "open" && (!cur.lastNotifiedAt || now.getTime() - cur.lastNotifiedAt.getTime() >= cfg.renotifyHours * 3_600_000);
      if (due) toNotify.push({ alertId: cur.id, row: c });
      updated++;
    }
  }
  for (const e of existing) if (e.state !== "resolved" && !seen.has(e.dedupeKey)) { await db.update(alerts).set({ state: "resolved", resolvedAt: now }).where(eq(alerts.id, e.id)); resolved++; }

  // Notificações internas: responsáveis (ou admins/gestores se ninguém foi definido), só quem enxerga a conta do alerta.
  let notified = 0;
  if (toNotify.length) {
    const members = await db.select({ u: memberships.userId, role: memberships.role }).from(memberships).where(eq(memberships.organizationId, organizationId));
    const targets = cfg.responsibleUserIds.length ? members.filter((m) => cfg.responsibleUserIds.includes(m.u)) : members.filter((m) => m.role !== "analyst");
    const actors = await Promise.all(targets.map((t) => getActor(t.u, organizationId)));
    for (const n of toNotify) {
      if (n.row.severity === "info") continue;
      for (const a of actors) {
        if (a.allowedAccountIds !== null && (!n.row.adAccountId || !a.allowedAccountIds.includes(n.row.adAccountId))) continue;
        await db.insert(notifications).values({ id: randomUUID(), organizationId, userId: a.userId, alertId: n.alertId, title: n.row.title, body: `${n.row.entityName}: ${n.row.message}`.slice(0, 500), href: "/app/alertas" });
        notified++;
      }
      await db.update(alerts).set({ lastNotifiedAt: now }).where(eq(alerts.id, n.alertId));
    }
  }
  const queued = await enqueueAlertMessages(organizationId, toNotify.map((n) => ({ alertId: n.alertId, severity: n.row.severity, title: n.row.title, entityName: n.row.entityName, message: n.row.message, adAccountId: n.row.adAccountId })), now);
  return { opened, updated, resolved, notified, queued, active: cands.length };
}

// ───────────── Leitura e ação (com visibilidade por conta) ─────────────
export async function listAlerts(actor: Actor, opts: { state?: string } = {}) {
  assertCan(actor, "insights.read");
  const rows = await db.select().from(alerts).where(and(eq(alerts.organizationId, actor.organizationId), opts.state ? eq(alerts.state, opts.state as never) : inArray(alerts.state, ["open", "acknowledged"]))).orderBy(desc(alerts.lastSeenAt)).limit(300);
  const sev = { critical: 0, warning: 1, info: 2 } as const;
  return rows.filter((r) => actor.allowedAccountIds === null || (r.adAccountId !== null && actor.allowedAccountIds.includes(r.adAccountId))).sort((a, b) => sev[a.severity] - sev[b.severity] || b.lastSeenAt.getTime() - a.lastSeenAt.getTime());
}
export async function acknowledgeAlert(actor: Actor, alertId: string) {
  assertCan(actor, "campaigns.write");
  const [a] = await db.select().from(alerts).where(and(eq(alerts.id, alertId), eq(alerts.organizationId, actor.organizationId), accountCond(actor, alerts.adAccountId)));
  if (!a) throw new AppError("not_found", "Alerta não encontrado.");
  if (a.state !== "open") throw new AppError("conflict", "Só alertas abertos podem ser reconhecidos.");
  await db.update(alerts).set({ state: "acknowledged", acknowledgedBy: actor.userId, acknowledgedAt: new Date() }).where(eq(alerts.id, a.id));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "alert.ack", objectType: "alert", objectId: a.id, after: { type: a.type, entity: a.entityName }, result: "success", requestId: actor.requestId });
}

export async function listNotifications(actor: Actor, limit = 50) {
  assertCan(actor, "org.read");
  return db.select().from(notifications).where(and(eq(notifications.organizationId, actor.organizationId), eq(notifications.userId, actor.userId))).orderBy(desc(notifications.createdAt)).limit(limit);
}
export async function unreadCount(actor: Actor) {
  const rows = await db.select({ id: notifications.id, r: notifications.readAt }).from(notifications).where(and(eq(notifications.organizationId, actor.organizationId), eq(notifications.userId, actor.userId)));
  return rows.filter((r) => r.r === null).length;
}
export async function markNotificationsRead(actor: Actor) {
  const rows = await db.select({ id: notifications.id, r: notifications.readAt }).from(notifications).where(and(eq(notifications.organizationId, actor.organizationId), eq(notifications.userId, actor.userId)));
  const ids = rows.filter((r) => r.r === null).map((r) => r.id);
  if (ids.length) await db.update(notifications).set({ readAt: new Date() }).where(inArray(notifications.id, ids));
}
