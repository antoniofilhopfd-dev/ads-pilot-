import { randomBytes, randomUUID } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { mcpTokens, MCP_SCOPES } from "@/db/schema";
import { hashToken } from "@/lib/crypto";
import { AppError } from "@/lib/errors";
import { audit } from "../audit";
import { assertCan, canActor, getActor, type Actor } from "../context";

export const TOKEN_PREFIX = "adp_mcp_";
const createSchema = z.object({ name: z.string().trim().min(2).max(80), scopes: z.array(z.enum(MCP_SCOPES)).min(1), ttlDays: z.union([z.literal(30), z.literal(90), z.literal(365)]) });

// O valor do token é mostrado UMA vez; no banco só existe o hash. O token herda as permissões do usuário
// (papel) e nunca excede o escopo concedido. Escopo "write" só é concedido a quem tem permissão de escrita.
export async function createMcpToken(actor: Actor, input: unknown) {
  assertCan(actor, "insights.read");
  const p = createSchema.safeParse(input);
  if (!p.success) throw new AppError("validation", "Informe um nome (2 a 80 caracteres), ao menos um escopo e uma validade (30, 90 ou 365 dias).");
  if (p.data.scopes.includes("write") && !canActor(actor, "campaigns.write")) throw new AppError("forbidden", "Seu perfil não pode conceder escopo de escrita a assistentes.");
  const token = TOKEN_PREFIX + randomBytes(32).toString("base64url");
  const id = randomUUID();
  await db.insert(mcpTokens).values({
    id, organizationId: actor.organizationId, userId: actor.userId, name: p.data.name, tokenHash: hashToken(token), tokenPrefix: token.slice(0, 12),
    scopes: [...new Set(p.data.scopes)], expiresAt: new Date(Date.now() + p.data.ttlDays * 86_400_000),
  });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "mcp.token_create", objectType: "mcp_token", objectId: id, after: { name: p.data.name, scopes: p.data.scopes, ttlDays: p.data.ttlDays }, result: "success", requestId: actor.requestId });
  return { id, token };
}

export async function listMcpTokens(actor: Actor) {
  assertCan(actor, "insights.read");
  const rows = await db.select().from(mcpTokens).where(and(eq(mcpTokens.organizationId, actor.organizationId), actor.role === "admin" ? undefined : eq(mcpTokens.userId, actor.userId))).orderBy(desc(mcpTokens.createdAt));
  return rows.map(({ tokenHash, ...t }) => { void tokenHash; return t; });
}

export async function revokeMcpToken(actor: Actor, tokenId: string) {
  assertCan(actor, "insights.read");
  const [t] = await db.select().from(mcpTokens).where(and(eq(mcpTokens.id, tokenId), eq(mcpTokens.organizationId, actor.organizationId))).limit(1);
  if (!t || (t.userId !== actor.userId && actor.role !== "admin")) throw new AppError("not_found", "Token não encontrado.");
  await db.update(mcpTokens).set({ revokedAt: new Date() }).where(and(eq(mcpTokens.id, tokenId), isNull(mcpTokens.revokedAt)));
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "mcp.token_revoke", objectType: "mcp_token", objectId: tokenId, result: "success", requestId: actor.requestId });
}

export type McpAuth = { actor: Actor; tokenId: string; tokenName: string; scopes: ("read" | "write")[] };

// Autorização POR REQUISIÇÃO: token válido, não revogado/expirado E usuário ainda membro da organização.
export async function authenticateMcp(authorization: string | null, requestId: string, now = new Date()): Promise<McpAuth> {
  const m = /^Bearer\s+(adp_mcp_[A-Za-z0-9_-]{20,100})$/.exec(authorization ?? "");
  if (!m) throw new AppError("unauthenticated", "Token MCP ausente ou em formato inválido.");
  const [t] = await db.select().from(mcpTokens).where(eq(mcpTokens.tokenHash, hashToken(m[1]))).limit(1);
  if (!t || t.revokedAt || t.expiresAt.getTime() < now.getTime()) throw new AppError("unauthenticated", "Token MCP inválido, revogado ou expirado.");
  let actor: Actor;
  try { actor = await getActor(t.userId, t.organizationId, requestId); } catch { throw new AppError("unauthenticated", "Token MCP inválido, revogado ou expirado."); }
  if (!t.lastUsedAt || now.getTime() - t.lastUsedAt.getTime() > 60_000) await db.update(mcpTokens).set({ lastUsedAt: now }).where(eq(mcpTokens.id, t.id));
  return { actor, tokenId: t.id, tokenName: t.name, scopes: t.scopes };
}
