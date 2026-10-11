import { randomUUID } from "node:crypto";
import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type AuditInput = {
  organizationId?: string | null;
  userId?: string | null;
  clientId?: string | null;
  action: string;
  objectType: string;
  objectId?: string | null;
  before?: unknown;
  after?: unknown;
  result: "success" | "failure";
  error?: string | null;
  requestId?: string | null;
};

const SENSITIVE = /pass|token|secret|hash/i;
function scrub(v: unknown): unknown {
  if (v === null || typeof v !== "object") return v;
  if (Array.isArray(v)) return v.map(scrub);
  return Object.fromEntries(Object.entries(v).filter(([k]) => !SENSITIVE.test(k)).map(([k, x]) => [k, scrub(x)]));
}

export async function audit(e: AuditInput) {
  await db.insert(auditLog).values({
    id: randomUUID(),
    organizationId: e.organizationId ?? null,
    userId: e.userId ?? null,
    clientId: e.clientId ?? null,
    action: e.action,
    objectType: e.objectType,
    objectId: e.objectId ?? null,
    before: e.before === undefined ? null : scrub(e.before),
    after: e.after === undefined ? null : scrub(e.after),
    result: e.result,
    error: e.error?.slice(0, 300) ?? null,
    requestId: e.requestId ?? null,
  });
}
