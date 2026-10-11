import { createHash } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { organizationLogos } from "@/db/schema";
import { AppError } from "@/lib/errors";
import { assertEmbeddable, inspectImage } from "@/lib/image-info";
import { audit } from "../audit";
import { assertCan, type Actor } from "../context";

export type Logo = { mime: "image/png" | "image/jpeg"; ext: "png" | "jpeg"; data: Buffer; width: number; height: number; sha256: string; bytes: number };

// Qualquer membro pode LER a logo da própria organização (ela aparece nos relatórios); só quem gerencia a organização altera.
export async function getLogo(actor: Actor): Promise<Logo | null> {
  assertCan(actor, "org.read");
  const [l] = await db.select().from(organizationLogos).where(eq(organizationLogos.organizationId, actor.organizationId)).limit(1);
  return l ? { mime: l.mime, ext: l.mime === "image/png" ? "png" : "jpeg", data: l.data, width: l.width, height: l.height, sha256: l.sha256, bytes: l.bytes } : null;
}

export async function saveLogo(actor: Actor, bytes: Buffer) {
  assertCan(actor, "org.settings");
  const info = inspectImage(bytes);
  await assertEmbeddable(bytes);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  const row = { organizationId: actor.organizationId, mime: info.mime, data: bytes, width: info.width, height: info.height, bytes: bytes.length, sha256, updatedBy: actor.userId, updatedAt: new Date() };
  await db.insert(organizationLogos).values(row).onDuplicateKeyUpdate({ set: { mime: row.mime, data: row.data, width: row.width, height: row.height, bytes: row.bytes, sha256, updatedBy: row.updatedBy, updatedAt: row.updatedAt } });
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "org.logo_update", objectType: "organization", objectId: actor.organizationId, after: { mime: info.mime, width: info.width, height: info.height, bytes: bytes.length }, result: "success", requestId: actor.requestId });
  return { ...info, sha256 };
}

export async function deleteLogo(actor: Actor) {
  assertCan(actor, "org.settings");
  const [r] = await db.delete(organizationLogos).where(eq(organizationLogos.organizationId, actor.organizationId));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Nenhuma logo cadastrada.");
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "org.logo_delete", objectType: "organization", objectId: actor.organizationId, result: "success", requestId: actor.requestId });
}
