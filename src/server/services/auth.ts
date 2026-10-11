import { randomUUID } from "node:crypto";
import { and, eq, gt, isNull } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { emailOutbox, memberships, organizations, passwordResetTokens, sessions, users } from "@/db/schema";
import { hashPassword, hashToken, newToken, verifyPassword } from "@/lib/crypto";
import { AppError, isDuplicateKey } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { checkRateLimit } from "@/lib/rate-limit";
import { audit } from "../audit";

const SESSION_DAYS = 14;
const RESET_MINUTES = 60;
const DUMMY_HASH = "scrypt$AAAAAAAAAAAAAAAAAAAAAA==$AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA==";

export const passwordSchema = z
  .string()
  .min(10, "A senha deve ter pelo menos 10 caracteres.")
  .max(200)
  .refine((p) => /[A-Za-z]/.test(p) && /\d/.test(p), "A senha deve ter letras e números.");

const registerSchema = z.object({
  name: z.string().trim().min(2, "Informe seu nome.").max(120),
  email: z.string().trim().toLowerCase().email("E-mail inválido.").max(254),
  password: passwordSchema,
  organizationName: z.string().trim().min(2, "Informe o nome da organização.").max(120),
});

export async function register(input: unknown, requestId?: string) {
  const parsed = registerSchema.safeParse(input);
  if (!parsed.success) throw new AppError("validation", parsed.error.issues[0].message);
  const d = parsed.data;
  const [existing] = await db.select({ id: users.id }).from(users).where(eq(users.email, d.email)).limit(1);
  if (existing) throw new AppError("conflict", "Não foi possível criar a conta com estes dados.");

  const userId = randomUUID();
  const orgId = randomUUID();
  const passwordHash = await hashPassword(d.password);
  try {
    await db.transaction(async (tx) => {
      await tx.insert(users).values({ id: userId, email: d.email, name: d.name, passwordHash });
      await tx.insert(organizations).values({ id: orgId, name: d.organizationName });
      await tx.insert(memberships).values({ id: randomUUID(), organizationId: orgId, userId, role: "admin" });
    });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError("conflict", "Não foi possível criar a conta com estes dados.");
    throw e;
  }
  await audit({ organizationId: orgId, userId, action: "user.register", objectType: "user", objectId: userId, result: "success", requestId });
  return { userId, organizationId: orgId };
}

export async function login(emailRaw: string, password: string, requestId?: string) {
  const email = String(emailRaw).trim().toLowerCase();
  if (!checkRateLimit(`login:${email}`, 10, 15 * 60_000)) {
    throw new AppError("rate_limited", "Muitas tentativas. Tente novamente em alguns minutos.");
  }
  const [u] = await db.select().from(users).where(eq(users.email, email)).limit(1);
  // Mesmo custo e mesma mensagem para usuário inexistente ou senha errada.
  const ok = await verifyPassword(String(password), u ? u.passwordHash : DUMMY_HASH);
  if (!u || !ok) {
    await audit({ userId: u?.id ?? null, action: "user.login", objectType: "user", objectId: u?.id ?? null, result: "failure", error: "credenciais inválidas", requestId });
    throw new AppError("unauthenticated", "E-mail ou senha incorretos.");
  }
  const token = await createSession(u.id);
  await audit({ userId: u.id, action: "user.login", objectType: "user", objectId: u.id, result: "success", requestId });
  return { token, userId: u.id };
}

export async function createSession(userId: string) {
  const token = newToken();
  await db.insert(sessions).values({
    tokenHash: hashToken(token),
    userId,
    expiresAt: new Date(Date.now() + SESSION_DAYS * 86_400_000),
  });
  return token;
}

export async function getSessionUser(token: string | undefined) {
  if (!token) return null;
  const [row] = await db
    .select({ id: users.id, name: users.name, email: users.email })
    .from(sessions)
    .innerJoin(users, eq(users.id, sessions.userId))
    .where(and(eq(sessions.tokenHash, hashToken(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return row ?? null;
}

export async function destroySession(token: string | undefined) {
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
}

// Resposta idêntica exista ou não o e-mail (evita enumeração de contas).
export async function requestPasswordReset(emailRaw: string) {
  const email = String(emailRaw).trim().toLowerCase();
  if (!checkRateLimit(`reset:${email}`, 5, 60 * 60_000)) return;
  const [u] = await db.select({ id: users.id }).from(users).where(eq(users.email, email)).limit(1);
  if (!u) return;
  const token = newToken();
  await db.insert(passwordResetTokens).values({
    tokenHash: hashToken(token),
    userId: u.id,
    expiresAt: new Date(Date.now() + RESET_MINUTES * 60_000),
  });
  const link = `${process.env.APP_URL ?? "http://localhost:3000"}/redefinir-senha?token=${token}`;
  // DESENVOLVIMENTO: sem SMTP ainda; o e-mail fica na tabela email_outbox.
  await db.insert(emailOutbox).values({
    id: randomUUID(),
    toEmail: email,
    subject: "Redefinição de senha — AdsPilot",
    body: `Use o link para redefinir sua senha (válido por ${RESET_MINUTES} min): ${link}`,
  });
  logger.info("password_reset_requested", { userId: u.id });
  await audit({ userId: u.id, action: "user.password_reset_request", objectType: "user", objectId: u.id, result: "success" });
}

export async function resetPassword(token: string, newPassword: unknown) {
  const pw = passwordSchema.safeParse(newPassword);
  if (!pw.success) throw new AppError("validation", pw.error.issues[0].message);
  const th = hashToken(String(token));
  const [t] = await db
    .select()
    .from(passwordResetTokens)
    .where(and(eq(passwordResetTokens.tokenHash, th), isNull(passwordResetTokens.usedAt), gt(passwordResetTokens.expiresAt, new Date())))
    .limit(1);
  if (!t) throw new AppError("validation", "Link inválido ou expirado. Solicite um novo.");
  const passwordHash = await hashPassword(pw.data);
  await db.transaction(async (tx) => {
    // UPDATE condicional impede uso concorrente do mesmo token.
    const [r] = await tx
      .update(passwordResetTokens)
      .set({ usedAt: new Date() })
      .where(and(eq(passwordResetTokens.tokenHash, th), isNull(passwordResetTokens.usedAt)));
    if (r.affectedRows !== 1) throw new AppError("validation", "Link inválido ou expirado. Solicite um novo.");
    await tx.update(users).set({ passwordHash }).where(eq(users.id, t.userId));
    await tx.delete(sessions).where(eq(sessions.userId, t.userId)); // encerra todas as sessões
  });
  await audit({ userId: t.userId, action: "user.password_reset", objectType: "user", objectId: t.userId, result: "success" });
}
