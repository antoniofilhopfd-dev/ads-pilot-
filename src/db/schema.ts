import {
  bigint,
  boolean,
  datetime,
  decimal,
  int,
  primaryKey,
  index,
  json,
  mysqlEnum,
  mysqlTable,
  text,
  uniqueIndex,
  varchar,
} from "drizzle-orm/mysql-core";
import { sql } from "drizzle-orm";

export const ROLES = ["admin", "manager", "analyst"] as const;
export type Role = (typeof ROLES)[number];

const id = () => varchar("id", { length: 36 }).primaryKey();
const createdAt = () =>
  datetime("created_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`);

export const users = mysqlTable(
  "users",
  {
    id: id(),
    email: varchar("email", { length: 254 }).notNull(),
    name: varchar("name", { length: 120 }).notNull(),
    passwordHash: varchar("password_hash", { length: 255 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("users_email_uq").on(t.email)],
);

// Guardamos apenas o hash SHA-256 do token; o token em si só existe no cookie.
export const sessions = mysqlTable(
  "sessions",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("sessions_user_idx").on(t.userId)],
);

export const passwordResetTokens = mysqlTable(
  "password_reset_tokens",
  {
    tokenHash: varchar("token_hash", { length: 64 }).primaryKey(),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    usedAt: datetime("used_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
  },
  (t) => [index("prt_user_idx").on(t.userId)],
);

export const organizations = mysqlTable("organizations", {
  id: id(),
  name: varchar("name", { length: 120 }).notNull(),
  createdAt: createdAt(),
});

export const memberships = mysqlTable(
  "memberships",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    role: mysqlEnum("role", ROLES).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_org_user_uq").on(t.organizationId, t.userId), index("memberships_user_idx").on(t.userId)],
);

export const clients = mysqlTable(
  "clients",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    notes: text("notes"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("clients_org_name_uq").on(t.organizationId, t.name)],
);

// Histórico de atividades. Nunca grave tokens, senhas ou segredos em before/after.
export const auditLog = mysqlTable(
  "audit_log",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }),
    userId: varchar("user_id", { length: 36 }),
    clientId: varchar("client_id", { length: 36 }),
    action: varchar("action", { length: 60 }).notNull(),
    objectType: varchar("object_type", { length: 40 }).notNull(),
    objectId: varchar("object_id", { length: 36 }),
    before: json("before"),
    after: json("after"),
    result: mysqlEnum("result", ["success", "failure"]).notNull(),
    error: varchar("error", { length: 300 }),
    requestId: varchar("request_id", { length: 36 }),
    createdAt: createdAt(),
  },
  (t) => [index("audit_org_created_idx").on(t.organizationId, t.createdAt)],
);

// Somente desenvolvimento: ainda não há envio real de e-mail (SMTP).
export const emailOutbox = mysqlTable("email_outbox", {
  id: id(),
  toEmail: varchar("to_email", { length: 254 }).notNull(),
  subject: varchar("subject", { length: 200 }).notNull(),
  body: text("body").notNull(),
  createdAt: createdAt(),
});

// ───────────── Etapa 03: Meta e dados reais ─────────────

export const CONNECTION_MODES = ["demo", "meta"] as const;
export const CONNECTION_STATUS = ["active", "needs_reconnect", "revoked", "error"] as const;

// mode "demo" = dados SIMULADOS (sem token). mode "meta" = Graph API oficial.
export const metaConnections = mysqlTable(
  "meta_connections",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    mode: mysqlEnum("mode", CONNECTION_MODES).notNull(),
    status: mysqlEnum("status", CONNECTION_STATUS).notNull().default("active"),
    metaUserId: varchar("meta_user_id", { length: 40 }),
    tokenEnc: text("token_enc"), // AES-256-GCM; nunca sai do servidor
    tokenExpiresAt: datetime("token_expires_at", { mode: "date", fsp: 3 }),
    grantedScopes: json("granted_scopes").$type<string[]>(),
    lastError: varchar("last_error", { length: 300 }),
    connectedBy: varchar("connected_by", { length: 36 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("meta_conn_org_uq").on(t.organizationId)],
);

export const adAccounts = mysqlTable(
  "ad_accounts",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    connectionId: varchar("connection_id", { length: 36 }).notNull().references(() => metaConnections.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 }).references(() => clients.id, { onDelete: "set null" }),
    externalId: varchar("external_id", { length: 40 }).notNull(), // act_123...
    name: varchar("name", { length: 200 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull(),
    timezone: varchar("timezone", { length: 60 }),
    remoteStatus: varchar("remote_status", { length: 40 }),
    isSelected: boolean("is_selected").notNull().default(false),
    lastSyncedAt: datetime("last_synced_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("ad_accounts_org_ext_uq").on(t.organizationId, t.externalId), index("ad_accounts_client_idx").on(t.clientId)],
);

export const campaigns = mysqlTable(
  "campaigns",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    adAccountId: varchar("ad_account_id", { length: 36 }).notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 40 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    objective: varchar("objective", { length: 60 }),
    status: varchar("status", { length: 30 }),
    effectiveStatus: varchar("effective_status", { length: 30 }),
    dailyBudget: decimal("daily_budget", { precision: 14, scale: 2 }), // orçamento CONFIGURADO na Meta (null = não definido)
    lifetimeBudget: decimal("lifetime_budget", { precision: 14, scale: 2 }),
    startTime: datetime("start_time", { mode: "date", fsp: 3 }),
    stopTime: datetime("stop_time", { mode: "date", fsp: 3 }),
    syncedAt: datetime("synced_at", { mode: "date", fsp: 3 }).notNull(),
  },
  (t) => [uniqueIndex("campaigns_acct_ext_uq").on(t.adAccountId, t.externalId), index("campaigns_org_idx").on(t.organizationId)],
);

export const adSets = mysqlTable(
  "ad_sets",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    campaignId: varchar("campaign_id", { length: 36 }).notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 40 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    status: varchar("status", { length: 30 }),
    effectiveStatus: varchar("effective_status", { length: 30 }),
    optimizationGoal: varchar("optimization_goal", { length: 60 }),
    dailyBudget: decimal("daily_budget", { precision: 14, scale: 2 }),
    lifetimeBudget: decimal("lifetime_budget", { precision: 14, scale: 2 }),
    syncedAt: datetime("synced_at", { mode: "date", fsp: 3 }).notNull(),
  },
  (t) => [uniqueIndex("ad_sets_camp_ext_uq").on(t.campaignId, t.externalId), index("ad_sets_org_idx").on(t.organizationId)],
);

export const ads = mysqlTable(
  "ads",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    adSetId: varchar("ad_set_id", { length: 36 }).notNull().references(() => adSets.id, { onDelete: "cascade" }),
    externalId: varchar("external_id", { length: 40 }).notNull(),
    name: varchar("name", { length: 300 }).notNull(),
    status: varchar("status", { length: 30 }),
    effectiveStatus: varchar("effective_status", { length: 30 }),
    syncedAt: datetime("synced_at", { mode: "date", fsp: 3 }).notNull(),
  },
  (t) => [uniqueIndex("ads_set_ext_uq").on(t.adSetId, t.externalId), index("ads_org_idx").on(t.organizationId)],
);

// Métricas diárias por campanha. Colunas NULL = a Meta não informou (nunca convertido para 0).
export const insightsDaily = mysqlTable(
  "insights_daily",
  {
    campaignId: varchar("campaign_id", { length: 36 }).notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    date: varchar("date", { length: 10 }).notNull(), // YYYY-MM-DD no fuso da conta de anúncios
    organizationId: varchar("organization_id", { length: 36 }).notNull(),
    adAccountId: varchar("ad_account_id", { length: 36 }).notNull(),
    spend: decimal("spend", { precision: 14, scale: 2 }),
    impressions: bigint("impressions", { mode: "number" }),
    reach: bigint("reach", { mode: "number" }),
    clicks: bigint("clicks", { mode: "number" }),
    results: bigint("results", { mode: "number" }),
    resultType: varchar("result_type", { length: 60 }),
    purchaseValue: decimal("purchase_value", { precision: 14, scale: 2 }),
    syncedAt: datetime("synced_at", { mode: "date", fsp: 3 }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.campaignId, t.date] }), index("insights_org_date_idx").on(t.organizationId, t.date), index("insights_acct_date_idx").on(t.adAccountId, t.date)],
);

export const SYNC_STATUS = ["running", "success", "partial", "failed", "interrupted"] as const;

export const syncRuns = mysqlTable(
  "sync_runs",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    adAccountId: varchar("ad_account_id", { length: 36 }).notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    status: mysqlEnum("status", SYNC_STATUS).notNull(),
    trigger: mysqlEnum("trigger_type", ["manual", "scheduled"]).notNull(),
    // Trava de concorrência: preenchida (= adAccountId) só enquanto "running"; UNIQUE impede 2 syncs simultâneos da mesma conta.
    lockKey: varchar("lock_key", { length: 36 }),
    startedAt: datetime("started_at", { mode: "date", fsp: 3 }).notNull(),
    heartbeatAt: datetime("heartbeat_at", { mode: "date", fsp: 3 }).notNull(),
    finishedAt: datetime("finished_at", { mode: "date", fsp: 3 }),
    rangeSince: varchar("range_since", { length: 10 }).notNull(),
    rangeUntil: varchar("range_until", { length: 10 }).notNull(),
    attempts: int("attempts").notNull().default(1),
    counts: json("counts").$type<Record<string, number>>(),
    errorCode: varchar("error_code", { length: 40 }),
    errorMessage: varchar("error_message", { length: 300 }),
  },
  (t) => [uniqueIndex("sync_runs_lock_uq").on(t.lockKey), index("sync_runs_acct_idx").on(t.adAccountId, t.startedAt)],
);

// ───────────── Etapa 04: operações de campanha ─────────────

// Estado "remoto" do ambiente de DEMONSTRAÇÃO (simula a Meta). Não existe para conexões reais.
export const demoRemoteState = mysqlTable(
  "demo_remote_state",
  {
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    accountExternalId: varchar("account_external_id", { length: 40 }).notNull(),
    campaignExternalId: varchar("campaign_external_id", { length: 40 }).notNull(),
    status: varchar("status", { length: 30 }),
    dailyBudget: decimal("daily_budget", { precision: 14, scale: 2 }),
  },
  (t) => [primaryKey({ name: "demo_state_pk", columns: [t.organizationId, t.accountExternalId, t.campaignExternalId] })],
);

export const OP_TYPES = ["pause", "activate", "set_daily_budget"] as const;
export const OP_STATUS = ["prepared", "executing", "succeeded", "failed", "ambiguous", "expired", "cancelled"] as const;

export const operations = mysqlTable(
  "operations",
  {
    id: id(), // também é o identificador de idempotência da operação
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    adAccountId: varchar("ad_account_id", { length: 36 }).notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    campaignId: varchar("campaign_id", { length: 36 }).notNull().references(() => campaigns.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 }),
    type: mysqlEnum("type", OP_TYPES).notNull(),
    mode: mysqlEnum("mode", CONNECTION_MODES).notNull(),
    params: json("params").$type<{ dailyBudget?: number; acknowledgedLargeChange?: boolean }>().notNull(),
    before: json("before").$type<{ status: string | null; effectiveStatus: string | null; dailyBudget: number | null }>().notNull(),
    after: json("after").$type<{ status: string | null; effectiveStatus: string | null; dailyBudget: number | null }>(), // estado remoto verificado
    warnings: json("warnings").$type<string[]>().notNull(),
    status: mysqlEnum("status", OP_STATUS).notNull(),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    confirmedBy: varchar("confirmed_by", { length: 36 }),
    createdAt: createdAt(),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    executedAt: datetime("executed_at", { mode: "date", fsp: 3 }),
    verifiedAt: datetime("verified_at", { mode: "date", fsp: 3 }),
    resultMessage: varchar("result_message", { length: 400 }),
  },
  (t) => [index("operations_org_idx").on(t.organizationId, t.createdAt), index("operations_campaign_idx").on(t.campaignId)],
);
