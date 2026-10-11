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
import { customType } from "drizzle-orm/mysql-core";

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
    // "restricted": o membro só enxerga as contas de anúncios listadas em member_account_access (administradores são sempre "all").
    accessScope: mysqlEnum("access_scope", ["all", "restricted"]).notNull().default("all"),
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
    // Configuração do conjunto lida da Meta (null = não informado/não sincronizado)
    bidStrategy: varchar("bid_strategy", { length: 40 }),
    startTime: datetime("start_time", { mode: "date", fsp: 3 }),
    endTime: datetime("end_time", { mode: "date", fsp: 3 }),
    targeting: json("targeting").$type<Record<string, unknown>>(),
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
    // Etapa 06: operações preparadas por assistente (MCP) só executam pelo MCP com um código que o HUMANO gera na interface web.
    origin: mysqlEnum("origin", ["web", "mcp"]).notNull().default("web"),
    mcpTokenId: varchar("mcp_token_id", { length: 36 }),
    clientRequestId: varchar("client_request_id", { length: 64 }), // deduplica "preparar" repetido
    confirmationCodeHash: varchar("confirmation_code_hash", { length: 64 }),
    confirmationExpiresAt: datetime("confirmation_expires_at", { mode: "date", fsp: 3 }),
    confirmationAttempts: int("confirmation_attempts").notNull().default(0),
  },
  (t) => [index("operations_org_idx").on(t.organizationId, t.createdAt), index("operations_campaign_idx").on(t.campaignId), uniqueIndex("operations_client_req_uq").on(t.organizationId, t.clientRequestId)],
);

// ───────────── Etapa 05: relatórios ─────────────
export const reportTemplates = mysqlTable(
  "report_templates",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 120 }).notNull(),
    config: json("config").$type<Record<string, unknown>>().notNull(),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("report_templates_org_name_uq").on(t.organizationId, t.name)],
);

// Metadados de cada exportação (o arquivo em si não é guardado). `verified` = o arquivo foi reaberto e conferido.
export const reportExports = mysqlTable(
  "report_exports",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }),
    reportType: varchar("report_type", { length: 30 }).notNull(),
    format: mysqlEnum("format", ["pdf", "xlsx", "csv"]).notNull(),
    config: json("config").$type<Record<string, unknown>>().notNull(),
    filename: varchar("filename", { length: 200 }).notNull(),
    bytes: int("bytes").notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    verified: boolean("verified").notNull(),
    verification: json("verification").$type<string[]>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("report_exports_org_idx").on(t.organizationId, t.createdAt)],
);

// ───────────── Etapa 06: MCP ─────────────
export const MCP_SCOPES = ["read", "write"] as const;

// Token de acesso MCP: vinculado a UM usuário e UMA organização. Só o hash é guardado; o valor aparece uma única vez.
export const mcpTokens = mysqlTable(
  "mcp_tokens",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    tokenHash: varchar("token_hash", { length: 64 }).notNull(),
    tokenPrefix: varchar("token_prefix", { length: 16 }).notNull(), // só para o usuário reconhecer o token na lista
    scopes: json("scopes").$type<("read" | "write")[]>().notNull(),
    expiresAt: datetime("expires_at", { mode: "date", fsp: 3 }).notNull(),
    lastUsedAt: datetime("last_used_at", { mode: "date", fsp: 3 }),
    revokedAt: datetime("revoked_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("mcp_tokens_hash_uq").on(t.tokenHash), index("mcp_tokens_org_idx").on(t.organizationId)],
);

// ───────────── Acesso por conta de anúncios ─────────────
export const memberAccountAccess = mysqlTable(
  "member_account_access",
  {
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    adAccountId: varchar("ad_account_id", { length: 36 }).notNull().references(() => adAccounts.id, { onDelete: "cascade" }),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ name: "member_acct_access_pk", columns: [t.organizationId, t.userId, t.adAccountId] }), index("member_acct_access_acct_idx").on(t.adAccountId)],
);

// ───────────── Logo da organização (usada em relatórios) ─────────────
const mediumblob = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "mediumblob" });

export const organizationLogos = mysqlTable("organization_logos", {
  organizationId: varchar("organization_id", { length: 36 }).primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  mime: mysqlEnum("mime", ["image/png", "image/jpeg"]).notNull(),
  data: mediumblob("data").notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  bytes: int("bytes").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  updatedBy: varchar("updated_by", { length: 36 }),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

// ═════════════ v2 · Etapa 03: gestão operacional ═════════════

export const FOLDER_KINDS = ["creative", "audience", "draft", "campaign", "experiment"] as const;
// Pastas e etiquetas são organização LOCAL do AdsPilot (não existem na Meta).
export const folders = mysqlTable(
  "folders",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    kind: mysqlEnum("kind", FOLDER_KINDS).notNull(),
    name: varchar("name", { length: 80 }).notNull(),
    color: varchar("color", { length: 12 }).notNull().default("violet"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("folders_org_kind_name_uq").on(t.organizationId, t.kind, t.name)],
);

export const ENTITY_TYPES = ["creative", "audience", "draft", "campaign", "experiment", "utm"] as const;
export const labels = mysqlTable(
  "labels",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 40 }).notNull(),
    color: varchar("color", { length: 12 }).notNull().default("sky"),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("labels_org_name_uq").on(t.organizationId, t.name)],
);

export const entityLabels = mysqlTable(
  "entity_labels",
  {
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    labelId: varchar("label_id", { length: 36 }).notNull().references(() => labels.id, { onDelete: "cascade" }),
    entityType: mysqlEnum("entity_type", ENTITY_TYPES).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
  },
  (t) => [primaryKey({ name: "entity_labels_pk", columns: [t.labelId, t.entityType, t.entityId] }), index("entity_labels_entity_idx").on(t.organizationId, t.entityType, t.entityId)],
);

export const BUDGET_SCOPES = ["client", "account", "campaign"] as const;
// Orçamento PLANEJADO no AdsPilot (≠ orçamento configurado na Meta ≠ gasto reportado ≠ limite de cobrança).
export const budgetPlans = mysqlTable(
  "budget_plans",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    scope: mysqlEnum("scope", BUDGET_SCOPES).notNull(),
    scopeId: varchar("scope_id", { length: 36 }).notNull(),
    period: varchar("period", { length: 7 }).notNull(), // YYYY-MM
    amount: decimal("amount", { precision: 14, scale: 2 }).notNull(),
    currency: varchar("currency", { length: 3 }).notNull().default("BRL"),
    milestones: json("milestones").$type<number[]>().notNull(), // % do orçamento que dispara marco (ex.: 50, 80, 100)
    note: varchar("note", { length: 300 }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [uniqueIndex("budget_plans_uq").on(t.organizationId, t.scope, t.scopeId, t.period)],
);

export const GOAL_METRICS = ["cpa", "cpl", "roas", "ctr", "cpc", "cpm", "spend", "results"] as const;
export const GOAL_SCOPES = ["org", "client", "account", "campaign"] as const;
// Meta de desempenho: direction "max" = o valor deve ficar ATÉ o alvo (custos); "min" = no MÍNIMO o alvo (roas, ctr, resultados).
export const goals = mysqlTable(
  "goals",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    scope: mysqlEnum("scope", GOAL_SCOPES).notNull(),
    scopeId: varchar("scope_id", { length: 36 }).notNull().default(""), // "" para escopo "org"
    metric: mysqlEnum("metric", GOAL_METRICS).notNull(),
    direction: mysqlEnum("direction", ["max", "min"]).notNull(),
    target: decimal("target", { precision: 14, scale: 4 }).notNull(),
    windowDays: int("window_days").notNull().default(30),
    note: varchar("note", { length: 300 }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("goals_uq").on(t.organizationId, t.scope, t.scopeId, t.metric)],
);

// Biblioteca de públicos (configuração LOCAL versionada; a criação na Meta é etapa de integração).
export const audiences = mysqlTable(
  "audiences",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 }).references(() => clients.id, { onDelete: "set null" }),
    folderId: varchar("folder_id", { length: 36 }).references(() => folders.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    objective: varchar("objective", { length: 40 }),
    config: json("config").$type<Record<string, unknown>>().notNull(),
    reachEstimate: json("reach_estimate").$type<{ value: number; source: string; date: string } | null>(),
    version: int("version").notNull().default(1),
    archived: boolean("archived").notNull().default(false),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [uniqueIndex("audiences_org_name_uq").on(t.organizationId, t.name), index("audiences_client_idx").on(t.clientId)],
);

export const audienceVersions = mysqlTable(
  "audience_versions",
  {
    audienceId: varchar("audience_id", { length: 36 }).notNull().references(() => audiences.id, { onDelete: "cascade" }),
    version: int("version").notNull(),
    organizationId: varchar("organization_id", { length: 36 }).notNull(),
    config: json("config").$type<Record<string, unknown>>().notNull(),
    note: varchar("note", { length: 300 }),
    changedBy: varchar("changed_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ name: "audience_versions_pk", columns: [t.audienceId, t.version] })],
);

export const creativeAssets = mysqlTable("creative_assets", {
  id: id(),
  organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
  mime: mysqlEnum("mime", ["image/png", "image/jpeg"]).notNull(),
  data: mediumblob("data").notNull(),
  width: int("width").notNull(),
  height: int("height").notNull(),
  bytes: int("bytes").notNull(),
  sha256: varchar("sha256", { length: 64 }).notNull(),
  createdAt: createdAt(),
});

export const CREATIVE_FORMATS = ["image", "video", "text"] as const;
export const creatives = mysqlTable(
  "creatives",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 }).references(() => clients.id, { onDelete: "set null" }),
    folderId: varchar("folder_id", { length: 36 }).references(() => folders.id, { onDelete: "set null" }),
    assetId: varchar("asset_id", { length: 36 }).references(() => creativeAssets.id, { onDelete: "set null" }),
    name: varchar("name", { length: 120 }).notNull(),
    format: mysqlEnum("format", CREATIVE_FORMATS).notNull(),
    videoUrl: varchar("video_url", { length: 500 }), // vídeo é referenciado por URL (não armazenamos arquivos de vídeo)
    primaryText: text("primary_text"),
    headline: varchar("headline", { length: 120 }),
    description: varchar("description", { length: 200 }),
    cta: varchar("cta", { length: 40 }),
    url: varchar("url", { length: 1000 }),
    variants: json("variants").$type<{ primaryTexts: string[]; headlines: string[]; descriptions: string[] }>().notNull(),
    notes: text("notes"),
    status: mysqlEnum("status", ["draft", "active", "archived"]).notNull().default("draft"),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [uniqueIndex("creatives_org_name_uq").on(t.organizationId, t.name), index("creatives_client_idx").on(t.clientId)],
);

export const creativeLinks = mysqlTable(
  "creative_links",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    creativeId: varchar("creative_id", { length: 36 }).notNull().references(() => creatives.id, { onDelete: "cascade" }),
    campaignId: varchar("campaign_id", { length: 36 }).references(() => campaigns.id, { onDelete: "cascade" }),
    adId: varchar("ad_id", { length: 36 }).references(() => ads.id, { onDelete: "cascade" }),
    linkKey: varchar("link_key", { length: 80 }).notNull(), // campaignId:adId (evita duplicar o mesmo vínculo)
    usedFrom: varchar("used_from", { length: 10 }), // YYYY-MM-DD (data de início de uso)
    note: varchar("note", { length: 300 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("creative_links_uq").on(t.creativeId, t.linkKey)],
);

export const DRAFT_STATUS = ["draft", "ready", "archived"] as const;
// Rascunho de campanha do assistente. NÃO cria nada na Meta; o envio só existe com a Meta conectada e escrita habilitada.
export const campaignDrafts = mysqlTable(
  "campaign_drafts",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 }).references(() => clients.id, { onDelete: "set null" }),
    adAccountId: varchar("ad_account_id", { length: 36 }).references(() => adAccounts.id, { onDelete: "set null" }),
    folderId: varchar("folder_id", { length: 36 }).references(() => folders.id, { onDelete: "set null" }),
    name: varchar("name", { length: 200 }).notNull(),
    step: int("step").notNull().default(1),
    data: json("data").$type<Record<string, unknown>>().notNull(),
    status: mysqlEnum("status", DRAFT_STATUS).notNull().default("draft"),
    issues: json("issues").$type<{ step: number; field: string; message: string }[]>().notNull(),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("drafts_org_idx").on(t.organizationId, t.updatedAt)],
);

export const utmTemplates = mysqlTable(
  "utm_templates",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    name: varchar("name", { length: 80 }).notNull(),
    source: varchar("source", { length: 100 }).notNull(),
    medium: varchar("medium", { length: 100 }).notNull(),
    campaignPattern: varchar("campaign_pattern", { length: 200 }).notNull(),
    contentPattern: varchar("content_pattern", { length: 200 }),
    termPattern: varchar("term_pattern", { length: 200 }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("utm_templates_uq").on(t.organizationId, t.name)],
);

export const utmLinks = mysqlTable(
  "utm_links",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 }).references(() => clients.id, { onDelete: "set null" }),
    campaignId: varchar("campaign_id", { length: 36 }).references(() => campaigns.id, { onDelete: "set null" }),
    creativeId: varchar("creative_id", { length: 36 }).references(() => creatives.id, { onDelete: "set null" }),
    baseUrl: varchar("base_url", { length: 1000 }).notNull(),
    params: json("params").$type<Record<string, string>>().notNull(),
    finalUrl: varchar("final_url", { length: 2000 }).notNull(),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [index("utm_links_org_idx").on(t.organizationId, t.createdAt)],
);

export const checklistRuns = mysqlTable(
  "checklist_runs",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    templateKey: varchar("template_key", { length: 40 }).notNull(),
    targetType: mysqlEnum("target_type", ["campaign", "draft", "account", "client"]).notNull(),
    targetId: varchar("target_id", { length: 36 }).notNull(),
    items: json("items").$type<{ id: string; done: boolean; note?: string; by?: string; at?: string }[]>().notNull(),
    completedAt: datetime("completed_at", { mode: "date", fsp: 3 }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [uniqueIndex("checklist_runs_uq").on(t.organizationId, t.templateKey, t.targetType, t.targetId)],
);

export const EXPERIMENT_STATUS = ["planned", "running", "concluded", "cancelled"] as const;
export const experiments = mysqlTable(
  "experiments",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    clientId: varchar("client_id", { length: 36 }).references(() => clients.id, { onDelete: "set null" }),
    folderId: varchar("folder_id", { length: 36 }).references(() => folders.id, { onDelete: "set null" }),
    name: varchar("name", { length: 150 }).notNull(),
    hypothesis: text("hypothesis").notNull(),
    objective: varchar("objective", { length: 200 }).notNull(),
    variable: varchar("variable", { length: 150 }).notNull(),
    primaryMetric: mysqlEnum("primary_metric", ["ctr", "cpa", "cpl", "roas", "cpc", "conversion_rate"]).notNull(),
    guardMetrics: json("guard_metrics").$type<string[]>().notNull(),
    budget: decimal("budget", { precision: 14, scale: 2 }),
    startsOn: varchar("starts_on", { length: 10 }),
    endsOn: varchar("ends_on", { length: 10 }),
    status: mysqlEnum("status", EXPERIMENT_STATUS).notNull().default("planned"),
    variants: json("variants").$type<{ name: string; campaignId: string | null; note?: string }[]>().notNull(),
    conclusion: text("conclusion"),
    nextAction: varchar("next_action", { length: 300 }),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
    updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
  },
  (t) => [index("experiments_org_idx").on(t.organizationId, t.createdAt)],
);

// ═════════════ v2 · Etapa 04: inteligência ═════════════
export const ALERT_TYPES = ["budget_projection", "budget_exceeded", "goal_not_met", "no_delivery", "cost_rise", "ctr_drop", "frequency_high", "stale_sync"] as const;
export const ALERT_SEVERITY = ["info", "warning", "critical"] as const;
export const ALERT_STATE = ["open", "acknowledged", "resolved"] as const;

// Configuração de alertas por organização (limiares, mínimos de amostra, responsáveis, reaviso).
export type AlertConfig = {
  enabled: Partial<Record<(typeof ALERT_TYPES)[number], boolean>>;
  costRisePct: number; ctrDropPct: number; frequencyMax: number; minImpressions: number; minResults: number; noDeliveryDays: number;
  responsibleUserIds: string[]; renotifyHours: number;
};
export const DEFAULT_ALERT_CONFIG: AlertConfig = { enabled: {}, costRisePct: 25, ctrDropPct: 25, frequencyMax: 3.5, minImpressions: 1000, minResults: 10, noDeliveryDays: 1, responsibleUserIds: [], renotifyHours: 24 };

export const alertSettings = mysqlTable("alert_settings", {
  organizationId: varchar("organization_id", { length: 36 }).primaryKey().references(() => organizations.id, { onDelete: "cascade" }),
  config: json("config").$type<AlertConfig>().notNull(),
  updatedBy: varchar("updated_by", { length: 36 }),
  updatedAt: datetime("updated_at", { mode: "date", fsp: 3 }).notNull().default(sql`CURRENT_TIMESTAMP(3)`),
});

// Um alerta = (tipo + entidade) em um estado. dedupeKey impede repetição: o mesmo problema atualiza o mesmo alerta.
export const alerts = mysqlTable(
  "alerts",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    dedupeKey: varchar("dedupe_key", { length: 120 }).notNull(),
    type: mysqlEnum("type", ALERT_TYPES).notNull(),
    severity: mysqlEnum("severity", ALERT_SEVERITY).notNull(),
    state: mysqlEnum("state", ALERT_STATE).notNull().default("open"),
    adAccountId: varchar("ad_account_id", { length: 36 }), // para visibilidade por conta (acesso restrito)
    entityType: varchar("entity_type", { length: 20 }).notNull(),
    entityId: varchar("entity_id", { length: 36 }).notNull(),
    entityName: varchar("entity_name", { length: 300 }).notNull(),
    title: varchar("title", { length: 200 }).notNull(),
    detail: json("detail").$type<{ message: string; facts: Record<string, string | number | null>; assumptions?: string[] }>().notNull(),
    occurrences: int("occurrences").notNull().default(1),
    firstSeenAt: datetime("first_seen_at", { mode: "date", fsp: 3 }).notNull(),
    lastSeenAt: datetime("last_seen_at", { mode: "date", fsp: 3 }).notNull(),
    lastNotifiedAt: datetime("last_notified_at", { mode: "date", fsp: 3 }),
    acknowledgedBy: varchar("acknowledged_by", { length: 36 }),
    acknowledgedAt: datetime("acknowledged_at", { mode: "date", fsp: 3 }),
    resolvedAt: datetime("resolved_at", { mode: "date", fsp: 3 }),
  },
  (t) => [uniqueIndex("alerts_dedupe_uq").on(t.organizationId, t.dedupeKey), index("alerts_org_state_idx").on(t.organizationId, t.state, t.lastSeenAt)],
);

export const notifications = mysqlTable(
  "notifications",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    userId: varchar("user_id", { length: 36 }).notNull().references(() => users.id, { onDelete: "cascade" }),
    alertId: varchar("alert_id", { length: 36 }).references(() => alerts.id, { onDelete: "cascade" }),
    title: varchar("title", { length: 200 }).notNull(),
    body: varchar("body", { length: 500 }).notNull(),
    href: varchar("href", { length: 200 }),
    readAt: datetime("read_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
  },
  (t) => [index("notifications_user_idx").on(t.organizationId, t.userId, t.readAt, t.createdAt)],
);

// ═════════════ v2 · Etapa 05: canais de notificação externos ═════════════
export const OUTBOX_STATUS = ["pending", "sending", "sent", "failed", "blocked", "uncertain"] as const;

export const notificationRecipients = mysqlTable(
  "notification_recipients",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    channel: mysqlEnum("channel", ["whatsapp"]).notNull().default("whatsapp"),
    name: varchar("name", { length: 80 }).notNull(),
    phone: varchar("phone", { length: 20 }).notNull(), // somente dígitos com DDI (E.164 sem "+")
    minSeverity: mysqlEnum("min_severity", ALERT_SEVERITY).notNull().default("critical"),
    active: boolean("active").notNull().default(true),
    createdBy: varchar("created_by", { length: 36 }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("recipients_org_phone_uq").on(t.organizationId, t.channel, t.phone)],
);

// Caixa de saída: cada mensagem tem chave de idempotência (a mesma notificação nunca é enviada duas vezes).
export const outbox = mysqlTable(
  "outbox",
  {
    id: id(),
    organizationId: varchar("organization_id", { length: 36 }).notNull().references(() => organizations.id, { onDelete: "cascade" }),
    channel: mysqlEnum("channel", ["whatsapp"]).notNull(),
    recipientId: varchar("recipient_id", { length: 36 }).notNull().references(() => notificationRecipients.id, { onDelete: "cascade" }),
    idempotencyKey: varchar("idempotency_key", { length: 120 }).notNull(),
    body: varchar("body", { length: 1000 }).notNull(),
    status: mysqlEnum("status", OUTBOX_STATUS).notNull().default("pending"),
    attempts: int("attempts").notNull().default(0),
    lastError: varchar("last_error", { length: 300 }),
    providerMessageId: varchar("provider_message_id", { length: 100 }),
    nextAttemptAt: datetime("next_attempt_at", { mode: "date", fsp: 3 }),
    sentAt: datetime("sent_at", { mode: "date", fsp: 3 }),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("outbox_idem_uq").on(t.organizationId, t.idempotencyKey), index("outbox_status_idx").on(t.status, t.nextAttemptAt)],
);
