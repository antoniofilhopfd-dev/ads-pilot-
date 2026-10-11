import { randomUUID } from "node:crypto";
import { and, asc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { ALERT_SEVERITY, notificationRecipients } from "@/db/schema";
import { AppError, isDuplicateKey } from "@/lib/errors";
import { audit } from "../audit";
import { assertCan, type Actor } from "../context";
import { normalizePhone } from "./evolution";

const schema = z.object({ name: z.string().trim().min(2, "Informe o nome.").max(80), phone: z.string(), minSeverity: z.enum(ALERT_SEVERITY).default("critical") });

export async function addRecipient(actor: Actor, input: unknown) {
  assertCan(actor, "budgets.manage");
  const p = schema.safeParse(input); if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  const phone = normalizePhone(p.data.phone);
  const id = randomUUID();
  try { await db.insert(notificationRecipients).values({ id, organizationId: actor.organizationId, name: p.data.name, phone, minSeverity: p.data.minSeverity, createdBy: actor.userId }); }
  catch (e) { if (isDuplicateKey(e)) throw new AppError("conflict", "Este número já está cadastrado."); throw e; }
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "recipient.add", objectType: "recipient", objectId: id, after: { name: p.data.name, phoneLast4: phone.slice(-4), minSeverity: p.data.minSeverity }, result: "success", requestId: actor.requestId });
  return id;
}
export async function listRecipients(actor: Actor) {
  assertCan(actor, "org.read");
  const rows = await db.select().from(notificationRecipients).where(eq(notificationRecipients.organizationId, actor.organizationId)).orderBy(asc(notificationRecipients.name));
  return rows.map((r) => ({ ...r, phoneMasked: `${r.phone.slice(0, 4)}${"•".repeat(Math.max(r.phone.length - 6, 2))}${r.phone.slice(-2)}` })); // número completo nunca vai para a tela
}
export async function removeRecipient(actor: Actor, id: string) {
  assertCan(actor, "budgets.manage");
  const [r] = await db.delete(notificationRecipients).where(and(eq(notificationRecipients.id, id), eq(notificationRecipients.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Destinatário não encontrado.");
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "recipient.remove", objectType: "recipient", objectId: id, result: "success", requestId: actor.requestId });
}
export async function setRecipientActive(actor: Actor, id: string, active: boolean) {
  assertCan(actor, "budgets.manage");
  const [r] = await db.update(notificationRecipients).set({ active }).where(and(eq(notificationRecipients.id, id), eq(notificationRecipients.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Destinatário não encontrado.");
}
