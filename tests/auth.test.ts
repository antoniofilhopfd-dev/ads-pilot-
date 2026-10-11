import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { emailOutbox, passwordResetTokens, users } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { resetRateLimits } from "@/lib/rate-limit";
import { destroySession, getSessionUser, login, register, requestPasswordReset, resetPassword } from "@/server/services/auth";
import { PW, uniq } from "./helpers";

const mk = () => ({ name: "Ana", email: `ana-${uniq()}@teste.com`, password: PW, organizationName: "Agência" });
beforeEach(() => resetRateLimits());

describe("autenticação", () => {
  it("cadastra, nunca guarda a senha em texto e faz login", async () => {
    const d = mk();
    await register(d);
    const [u] = await db.select().from(users).where(eq(users.email, d.email));
    expect(u.passwordHash).not.toContain(PW);
    expect(u.passwordHash.startsWith("scrypt$")).toBe(true);
    const { token } = await login(d.email, PW);
    expect((await getSessionUser(token))?.email).toBe(d.email);
  });

  it("rejeita senha fraca e e-mail duplicado", async () => {
    await expect(register({ ...mk(), password: "curta1" })).rejects.toThrow(AppError);
    await expect(register({ ...mk(), password: "somenteletrasaqui" })).rejects.toThrow(/letras e números/);
    const d = mk();
    await register(d);
    await expect(register(d)).rejects.toMatchObject({ code: "conflict" });
  });

  it("login errado dá a mesma mensagem para usuário inexistente e senha errada", async () => {
    const d = mk();
    await register(d);
    const a = await login(d.email, "errada12345").catch((e) => e);
    const b = await login("naoexiste@teste.com", "errada12345").catch((e) => e);
    expect(a.message).toBe(b.message);
    expect(a.code).toBe("unauthenticated");
  });

  it("bloqueia força bruta após 10 tentativas", async () => {
    const d = mk();
    await register(d);
    for (let i = 0; i < 10; i++) await login(d.email, "errada12345").catch(() => {});
    await expect(login(d.email, PW)).rejects.toMatchObject({ code: "rate_limited" });
  });

  it("logout invalida a sessão e token inválido não autentica", async () => {
    const d = mk();
    await register(d);
    const { token } = await login(d.email, PW);
    await destroySession(token);
    expect(await getSessionUser(token)).toBeNull();
    expect(await getSessionUser("token-falso")).toBeNull();
    expect(await getSessionUser(undefined)).toBeNull();
  });

  it("recuperação de senha: token de uso único, encerra sessões e não vaza existência", async () => {
    const d = mk();
    await register(d);
    const { token: sess } = await login(d.email, PW);
    await requestPasswordReset("naoexiste@teste.com"); // não deve lançar nem criar e-mail
    expect((await db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, "naoexiste@teste.com"))).length).toBe(0);
    await requestPasswordReset(d.email);
    const [mail] = await db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, d.email));
    const token = new URL(/(http\S+)/.exec(mail.body)![1]).searchParams.get("token")!;
    // o banco só guarda hash do token
    const stored = await db.select().from(passwordResetTokens);
    expect(stored.some((t) => t.tokenHash === token)).toBe(false);
    await resetPassword(token, "NovaSenha456xx");
    await expect(resetPassword(token, "OutraSenha789xx")).rejects.toThrow(/inválido ou expirado/);
    expect(await getSessionUser(sess)).toBeNull();
    await expect(login(d.email, PW)).rejects.toThrow();
    expect((await login(d.email, "NovaSenha456xx")).token).toBeTruthy();
  });

  it("token de redefinição expirado é recusado", async () => {
    const d = mk();
    await register(d);
    await requestPasswordReset(d.email);
    await db.update(passwordResetTokens).set({ expiresAt: new Date(Date.now() - 1000) });
    const [mail] = await db.select().from(emailOutbox).where(eq(emailOutbox.toEmail, d.email));
    const token = new URL(/(http\S+)/.exec(mail.body)![1]).searchParams.get("token")!;
    await expect(resetPassword(token, "NovaSenha456xx")).rejects.toThrow(/inválido ou expirado/);
  });
});
