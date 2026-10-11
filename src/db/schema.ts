import {
  datetime,
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
