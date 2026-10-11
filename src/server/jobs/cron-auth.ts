import { timingSafeEqual } from "node:crypto";

// Autenticação das rotas de cron por segredo compartilhado (cabeçalho x-cron-secret), em tempo constante.
// Sem CRON_SECRET configurado, as rotas ficam DESATIVADAS (nunca abertas).
export function cronAuthorized(headerValue: string | null, secret = process.env.CRON_SECRET): boolean {
  if (!secret || secret.length < 24) return false;
  const a = Buffer.from(headerValue ?? ""), b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}
