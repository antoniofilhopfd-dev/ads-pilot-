import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, inArray, isNull, or } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import {
  adAccounts, audienceVersions, audiences, campaignDrafts, checklistRuns, clients, creativeAssets, creativeLinks, creatives, entityLabels, experiments,
  ENTITY_TYPES, folders, FOLDER_KINDS, labels, utmLinks, utmTemplates,
} from "@/db/schema";
import { AppError } from "@/lib/errors";
import { assertEmbeddable, inspectImage } from "@/lib/image-info";
import { BORN_STATUS, SEND_BLOCKED_REASON, validateDraft, type DraftData } from "@/lib/draft";
import { CHECKLISTS, checklistByKey } from "@/lib/checklists";
import { buildUtmUrl, type UtmParams } from "@/lib/utm";
import { audit } from "./audit";
import { assertCan, isRestricted, type Actor } from "./context";

type Entity = (typeof ENTITY_TYPES)[number];
const A = (actor: Actor, action: string, objectType: string, objectId: string, before?: unknown, after?: unknown) =>
  audit({ organizationId: actor.organizationId, userId: actor.userId, action, objectType, objectId, before: before as never, after: after as never, result: "success", requestId: actor.requestId });
const nameSchema = (max: number) => z.string().trim().min(1, "Informe um nome.").max(max, `Nome passa de ${max} caracteres.`);
const dupMsg = (e: unknown, msg: string): never => { if ((e as { cause?: { code?: string }; code?: string })?.cause?.code === "ER_DUP_ENTRY" || (e as { code?: string })?.code === "ER_DUP_ENTRY") throw new AppError("conflict", msg); throw e; };

// Cliente visível? Sem restrição: qualquer um da organização. Restrito: só clientes com conta liberada; itens sem cliente são da organização e visíveis.
async function visibleClientIds(actor: Actor): Promise<string[] | null> {
  if (!isRestricted(actor)) return null;
  const ids = actor.allowedAccountIds ?? [];
  if (!ids.length) return [];
  const rows = await db.select({ c: adAccounts.clientId }).from(adAccounts).where(and(eq(adAccounts.organizationId, actor.organizationId), inArray(adAccounts.id, ids)));
  return [...new Set(rows.map((r) => r.c).filter((c): c is string => !!c))];
}
async function clientCond(actor: Actor, col: Parameters<typeof isNull>[0]) {
  const v = await visibleClientIds(actor);
  if (v === null) return undefined;
  return v.length ? or(isNull(col), inArray(col as never, v)) : isNull(col);
}
async function assertClient(actor: Actor, clientId: string | null | undefined) {
  if (!clientId) return null;
  const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, clientId), eq(clients.organizationId, actor.organizationId)));
  if (!c) throw new AppError("not_found", "Cliente não encontrado.");
  return c.id;
}
async function assertFolder(actor: Actor, folderId: string | null | undefined, kind: (typeof FOLDER_KINDS)[number]) {
  if (!folderId) return null;
  const [f] = await db.select({ id: folders.id }).from(folders).where(and(eq(folders.id, folderId), eq(folders.organizationId, actor.organizationId), eq(folders.kind, kind)));
  if (!f) throw new AppError("not_found", "Pasta não encontrada.");
  return f.id;
}

// ───────────── Pastas e etiquetas ─────────────
export async function createFolder(actor: Actor, kind: string, name: string) {
  assertCan(actor, "library.write");
  const k = z.enum(FOLDER_KINDS).safeParse(kind); const n = nameSchema(80).safeParse(name);
  if (!k.success) throw new AppError("validation", "Tipo de pasta inválido."); if (!n.success) throw new AppError("validation", n.error.issues[0].message);
  const id = randomUUID();
  try { await db.insert(folders).values({ id, organizationId: actor.organizationId, kind: k.data, name: n.data }); } catch (e) { dupMsg(e, "Já existe uma pasta com esse nome."); }
  await A(actor, "folder.create", "folder", id, null, { kind: k.data, name: n.data });
  return id;
}
export async function listFolders(actor: Actor, kind: string) {
  assertCan(actor, "org.read");
  return db.select().from(folders).where(and(eq(folders.organizationId, actor.organizationId), eq(folders.kind, kind as never))).orderBy(asc(folders.name));
}
export async function deleteFolder(actor: Actor, folderId: string) {
  assertCan(actor, "library.write");
  const [f] = await db.select().from(folders).where(and(eq(folders.id, folderId), eq(folders.organizationId, actor.organizationId)));
  if (!f) throw new AppError("not_found", "Pasta não encontrada.");
  await db.delete(folders).where(eq(folders.id, folderId)); // itens ficam sem pasta (set null)
  await A(actor, "folder.delete", "folder", folderId, { name: f.name, kind: f.kind });
}

export async function createLabel(actor: Actor, name: string) {
  assertCan(actor, "library.write");
  const n = nameSchema(40).safeParse(name); if (!n.success) throw new AppError("validation", n.error.issues[0].message);
  const id = randomUUID();
  try { await db.insert(labels).values({ id, organizationId: actor.organizationId, name: n.data }); } catch (e) { dupMsg(e, "Já existe uma etiqueta com esse nome."); }
  await A(actor, "label.create", "label", id, null, { name: n.data });
  return id;
}
export async function listLabels(actor: Actor) { assertCan(actor, "org.read"); return db.select().from(labels).where(eq(labels.organizationId, actor.organizationId)).orderBy(asc(labels.name)); }
export async function deleteLabel(actor: Actor, labelId: string) {
  assertCan(actor, "library.write");
  const [r] = await db.delete(labels).where(and(eq(labels.id, labelId), eq(labels.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Etiqueta não encontrada.");
  await A(actor, "label.delete", "label", labelId);
}
const ENTITY_TABLE = { creative: creatives, audience: audiences, draft: campaignDrafts, experiment: experiments } as const;
export async function setEntityLabels(actor: Actor, entityType: Entity, entityId: string, labelIds: string[]) {
  assertCan(actor, "library.write");
  if (entityType in ENTITY_TABLE) {
    const t = ENTITY_TABLE[entityType as keyof typeof ENTITY_TABLE];
    const [e] = await db.select({ id: t.id }).from(t).where(and(eq(t.id, entityId), eq(t.organizationId, actor.organizationId)));
    if (!e) throw new AppError("not_found", "Item não encontrado.");
  }
  const valid = labelIds.length ? await db.select({ id: labels.id }).from(labels).where(and(eq(labels.organizationId, actor.organizationId), inArray(labels.id, labelIds))) : [];
  await db.delete(entityLabels).where(and(eq(entityLabels.organizationId, actor.organizationId), eq(entityLabels.entityType, entityType), eq(entityLabels.entityId, entityId)));
  if (valid.length) await db.insert(entityLabels).values(valid.map((l) => ({ organizationId: actor.organizationId, labelId: l.id, entityType, entityId })));
  await A(actor, "label.assign", entityType, entityId, null, { labels: valid.length });
}
export async function labelsFor(actor: Actor, entityType: Entity, ids: string[]) {
  if (!ids.length) return new Map<string, { id: string; name: string }[]>();
  const rows = await db.select({ entityId: entityLabels.entityId, id: labels.id, name: labels.name }).from(entityLabels).innerJoin(labels, eq(labels.id, entityLabels.labelId))
    .where(and(eq(entityLabels.organizationId, actor.organizationId), eq(entityLabels.entityType, entityType), inArray(entityLabels.entityId, ids)));
  return Map.groupBy(rows.map((r) => ({ eid: r.entityId, id: r.id, name: r.name })), (r) => r.eid) as unknown as Map<string, { id: string; name: string }[]>;
}

// ───────────── Públicos ─────────────
export const AUDIENCE_PRESETS: Record<string, { label: string; objective: string; config: Record<string, unknown> }> = {
  vendas_amplo: { label: "Vendas — público amplo (Brasil, 18–65)", objective: "OUTCOME_SALES", config: { locations: "Brasil", ageMin: 18, ageMax: 65, genders: "todos", interests: "", exclusions: "compradores dos últimos 30 dias" } },
  leads_local: { label: "Leads — local (raio de cidade, 25–55)", objective: "OUTCOME_LEADS", config: { locations: "Cidade + 15 km", ageMin: 25, ageMax: 55, genders: "todos", interests: "", exclusions: "leads existentes" } },
  remarketing: { label: "Remarketing — visitantes 30 dias", objective: "OUTCOME_SALES", config: { locations: "Brasil", ageMin: 18, ageMax: 65, genders: "todos", source: "visitantes do site (30 dias)", exclusions: "compradores" } },
  trafego: { label: "Tráfego — interesses relacionados", objective: "OUTCOME_TRAFFIC", config: { locations: "Brasil", ageMin: 18, ageMax: 55, genders: "todos", interests: "definir", exclusions: "" } },
};
const audCfg = z.object({
  locations: z.string().trim().max(300).default(""), ageMin: z.number().int().min(13).max(65).default(18), ageMax: z.number().int().min(13).max(65).default(65),
  genders: z.string().trim().max(20).default("todos"), interests: z.string().trim().max(500).default(""), exclusions: z.string().trim().max(500).default(""), source: z.string().trim().max(300).optional(),
}).refine((c) => c.ageMax >= c.ageMin, "Idade máxima menor que a mínima.");
export function validateAudience(config: unknown): string[] {
  const p = audCfg.safeParse(config); const out: string[] = [];
  if (!p.success) return p.error.issues.map((i) => i.message);
  if (!p.data.locations) out.push("Informe a localização.");
  if (p.data.ageMax - p.data.ageMin < 5) out.push("Faixa de idade muito estreita (< 5 anos): pode limitar a entrega.");
  return out;
}

export async function saveAudience(actor: Actor, input: { id?: string; name: string; clientId?: string | null; folderId?: string | null; objective?: string | null; config: unknown; reachEstimate?: number | null; reachSource?: string; note?: string }) {
  assertCan(actor, "library.write");
  const n = nameSchema(120).safeParse(input.name); if (!n.success) throw new AppError("validation", n.error.issues[0].message);
  const cfg = audCfg.safeParse(input.config); if (!cfg.success) throw new AppError("validation", cfg.error.issues[0].message);
  const clientId = await assertClient(actor, input.clientId); const folderId = await assertFolder(actor, input.folderId, "audience");
  const reach = input.reachEstimate != null ? { value: input.reachEstimate, source: (input.reachSource || "informado manualmente").slice(0, 100), date: new Date().toISOString().slice(0, 10) } : null;
  if (reach && !(reach.value > 0)) throw new AppError("validation", "Estimativa de alcance deve ser maior que zero.");
  if (input.id) {
    const [cur] = await db.select().from(audiences).where(and(eq(audiences.id, input.id), eq(audiences.organizationId, actor.organizationId)));
    if (!cur) throw new AppError("not_found", "Público não encontrado.");
    const version = cur.version + 1;
    try { await db.update(audiences).set({ name: n.data, clientId, folderId, objective: input.objective ?? null, config: cfg.data, reachEstimate: reach, version, updatedAt: new Date() }).where(eq(audiences.id, cur.id)); } catch (e) { dupMsg(e, "Já existe um público com esse nome."); }
    await db.insert(audienceVersions).values({ audienceId: cur.id, version, organizationId: actor.organizationId, config: cfg.data, note: input.note?.slice(0, 300) ?? null, changedBy: actor.userId });
    await A(actor, "audience.update", "audience", cur.id, { version: cur.version, config: cur.config }, { version, config: cfg.data });
    return cur.id;
  }
  const id = randomUUID();
  try { await db.insert(audiences).values({ id, organizationId: actor.organizationId, clientId, folderId, name: n.data, objective: input.objective ?? null, config: cfg.data, reachEstimate: reach, createdBy: actor.userId }); } catch (e) { dupMsg(e, "Já existe um público com esse nome."); }
  await db.insert(audienceVersions).values({ audienceId: id, version: 1, organizationId: actor.organizationId, config: cfg.data, note: input.note?.slice(0, 300) ?? "Versão inicial", changedBy: actor.userId });
  await A(actor, "audience.create", "audience", id, null, { name: n.data, config: cfg.data });
  return id;
}
export async function listAudiences(actor: Actor, opts: { includeArchived?: boolean } = {}) {
  assertCan(actor, "org.read");
  return db.select().from(audiences).where(and(eq(audiences.organizationId, actor.organizationId), opts.includeArchived ? undefined : eq(audiences.archived, false), await clientCond(actor, audiences.clientId))).orderBy(desc(audiences.updatedAt));
}
export async function getAudience(actor: Actor, id: string) {
  assertCan(actor, "org.read");
  const [a] = await db.select().from(audiences).where(and(eq(audiences.id, id), eq(audiences.organizationId, actor.organizationId), await clientCond(actor, audiences.clientId)));
  if (!a) throw new AppError("not_found", "Público não encontrado.");
  const versions = await db.select().from(audienceVersions).where(and(eq(audienceVersions.audienceId, id), eq(audienceVersions.organizationId, actor.organizationId))).orderBy(desc(audienceVersions.version));
  return { ...a, versions };
}
export async function archiveAudience(actor: Actor, id: string, archived: boolean) {
  assertCan(actor, "library.write");
  const [r] = await db.update(audiences).set({ archived }).where(and(eq(audiences.id, id), eq(audiences.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Público não encontrado.");
  await A(actor, archived ? "audience.archive" : "audience.restore", "audience", id);
}
// Compara duas versões campo a campo.
export function diffConfig(a: Record<string, unknown>, b: Record<string, unknown>) {
  return [...new Set([...Object.keys(a), ...Object.keys(b)])].sort().filter((k) => JSON.stringify(a[k] ?? null) !== JSON.stringify(b[k] ?? null)).map((k) => ({ field: k, from: a[k] ?? null, to: b[k] ?? null }));
}
export async function compareAudienceVersions(actor: Actor, id: string, v1: number, v2: number) {
  const a = await getAudience(actor, id);
  const x = a.versions.find((v) => v.version === v1), y = a.versions.find((v) => v.version === v2);
  if (!x || !y) throw new AppError("not_found", "Versão não encontrada.");
  return diffConfig(x.config, y.config);
}

// ───────────── Criativos ─────────────
const urlOk = (u: string) => { try { return ["http:", "https:"].includes(new URL(u).protocol); } catch { return false; } };
const creativeSchema = z.object({
  name: nameSchema(120), format: z.enum(["image", "video", "text"]),
  primaryText: z.string().trim().max(2200).optional(), headline: z.string().trim().max(120).optional(), description: z.string().trim().max(200).optional(), cta: z.string().trim().max(40).optional(),
  url: z.string().trim().max(1000).optional().refine((u) => !u || urlOk(u), "URL de destino inválida (use http/https)."),
  videoUrl: z.string().trim().max(500).optional().refine((u) => !u || urlOk(u), "URL do vídeo inválida (use http/https)."),
  notes: z.string().trim().max(2000).optional(),
  variants: z.object({ primaryTexts: z.array(z.string().trim().max(2200)).max(5).default([]), headlines: z.array(z.string().trim().max(120)).max(5).default([]), descriptions: z.array(z.string().trim().max(200)).max(5).default([]) }).default({ primaryTexts: [], headlines: [], descriptions: [] }),
});
// Avisos de qualidade (não bloqueiam): limites recomendados e itens faltantes.
export function creativeWarnings(c: { format: string; primaryText?: string | null; headline?: string | null; url?: string | null; hasImage: boolean; videoUrl?: string | null }) {
  const w: string[] = [];
  if (c.format === "image" && !c.hasImage) w.push("Criativo de imagem sem arquivo enviado.");
  if (c.format === "video" && !c.videoUrl) w.push("Criativo de vídeo sem URL do vídeo.");
  if ((c.primaryText?.length ?? 0) > 125) w.push("Texto principal com mais de 125 caracteres: pode ser truncado no feed.");
  if ((c.headline?.length ?? 0) > 40) w.push("Título com mais de 40 caracteres: pode ser truncado.");
  if (!c.url) w.push("Sem URL de destino.");
  return w;
}
export async function saveCreative(actor: Actor, input: { id?: string; clientId?: string | null; folderId?: string | null; status?: "draft" | "active" | "archived"; image?: Buffer | null; [k: string]: unknown }) {
  assertCan(actor, "library.write");
  const p = creativeSchema.safeParse(input); if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  const d = p.data;
  if (d.format === "video" && d.videoUrl === undefined && !input.id) { /* permitido como rascunho; aviso na listagem */ }
  const clientId = await assertClient(actor, input.clientId); const folderId = await assertFolder(actor, input.folderId, "creative");
  let assetId: string | null | undefined;
  if (input.image && input.image.length) {
    const info = inspectImage(input.image); await assertEmbeddable(input.image);
    assetId = randomUUID();
    await db.insert(creativeAssets).values({ id: assetId, organizationId: actor.organizationId, mime: info.mime, data: input.image, width: info.width, height: info.height, bytes: input.image.length, sha256: createHash("sha256").update(input.image).digest("hex") });
  }
  const row = { clientId, folderId, name: d.name, format: d.format, videoUrl: d.videoUrl || null, primaryText: d.primaryText || null, headline: d.headline || null, description: d.description || null, cta: d.cta || null, url: d.url || null, variants: d.variants, notes: d.notes || null, status: input.status ?? "draft" };
  if (input.id) {
    const [cur] = await db.select().from(creatives).where(and(eq(creatives.id, input.id), eq(creatives.organizationId, actor.organizationId)));
    if (!cur) throw new AppError("not_found", "Criativo não encontrado.");
    try { await db.update(creatives).set({ ...row, ...(assetId ? { assetId } : {}), updatedAt: new Date() }).where(eq(creatives.id, cur.id)); } catch (e) { dupMsg(e, "Já existe um criativo com esse nome."); }
    await A(actor, "creative.update", "creative", cur.id, { name: cur.name, status: cur.status }, { name: row.name, status: row.status });
    return cur.id;
  }
  const id = randomUUID();
  try { await db.insert(creatives).values({ id, organizationId: actor.organizationId, ...row, assetId: assetId ?? null, createdBy: actor.userId }); } catch (e) { dupMsg(e, "Já existe um criativo com esse nome."); }
  await A(actor, "creative.create", "creative", id, null, { name: row.name, format: row.format });
  return id;
}
export async function listCreatives(actor: Actor, f: { q?: string; format?: string; folderId?: string; status?: string } = {}) {
  assertCan(actor, "org.read");
  const rows = await db.select().from(creatives).where(and(eq(creatives.organizationId, actor.organizationId), await clientCond(actor, creatives.clientId), f.format ? eq(creatives.format, f.format as never) : undefined, f.folderId ? eq(creatives.folderId, f.folderId) : undefined, f.status ? eq(creatives.status, f.status as never) : undefined)).orderBy(desc(creatives.updatedAt));
  return f.q ? rows.filter((r) => `${r.name} ${r.headline ?? ""} ${r.primaryText ?? ""}`.toLowerCase().includes(f.q!.toLowerCase())) : rows;
}
export async function getCreative(actor: Actor, id: string) {
  assertCan(actor, "org.read");
  const [c] = await db.select().from(creatives).where(and(eq(creatives.id, id), eq(creatives.organizationId, actor.organizationId), await clientCond(actor, creatives.clientId)));
  if (!c) throw new AppError("not_found", "Criativo não encontrado.");
  const links = await db.select().from(creativeLinks).where(and(eq(creativeLinks.creativeId, id), eq(creativeLinks.organizationId, actor.organizationId)));
  return { ...c, links };
}
// Bytes da imagem de um criativo (para a rota de prévia); respeita visibilidade.
export async function creativeImage(actor: Actor, id: string) {
  const c = await getCreative(actor, id);
  if (!c.assetId) return null;
  const [a] = await db.select().from(creativeAssets).where(and(eq(creativeAssets.id, c.assetId), eq(creativeAssets.organizationId, actor.organizationId)));
  return a ? { mime: a.mime, data: a.data } : null;
}
export async function setCreativeStatus(actor: Actor, id: string, status: "draft" | "active" | "archived") {
  assertCan(actor, "library.write");
  const [r] = await db.update(creatives).set({ status, updatedAt: new Date() }).where(and(eq(creatives.id, id), eq(creatives.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Criativo não encontrado.");
  await A(actor, "creative.status", "creative", id, null, { status });
}
// Vínculo manual criativo ↔ campanha/anúncio (histórico de uso). Não altera nada na Meta.
export async function linkCreative(actor: Actor, creativeId: string, campaignId: string, adId: string | null, usedFrom?: string, note?: string) {
  assertCan(actor, "library.write");
  const { campaigns, ads, adSets } = await import("@/db/schema");
  const [c] = await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.id, creativeId), eq(creatives.organizationId, actor.organizationId)));
  const [camp] = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.id, campaignId), eq(campaigns.organizationId, actor.organizationId)));
  if (!c || !camp) throw new AppError("not_found", "Criativo ou campanha não encontrado.");
  if (adId) { const [ad] = await db.select({ id: ads.id }).from(ads).innerJoin(adSets, eq(adSets.id, ads.adSetId)).where(and(eq(ads.id, adId), eq(adSets.campaignId, campaignId), eq(ads.organizationId, actor.organizationId))); if (!ad) throw new AppError("not_found", "Anúncio não encontrado nessa campanha."); }
  if (usedFrom && !/^\d{4}-\d{2}-\d{2}$/.test(usedFrom)) throw new AppError("validation", "Data inválida.");
  try { await db.insert(creativeLinks).values({ id: randomUUID(), organizationId: actor.organizationId, creativeId, campaignId, adId, linkKey: `${campaignId}:${adId ?? ""}`, usedFrom: usedFrom || null, note: note?.slice(0, 300) ?? null }); } catch (e) { dupMsg(e, "Este criativo já está vinculado a essa campanha/anúncio."); }
  await A(actor, "creative.link", "creative", creativeId, null, { campaignId, adId });
}

// ───────────── Rascunhos de campanha (assistente) ─────────────
const stepSchema = z.number().int().min(1).max(10);
export async function createDraft(actor: Actor, name?: string) {
  assertCan(actor, "library.write");
  const id = randomUUID(); const n = (name ?? "").trim().slice(0, 200) || "Rascunho sem nome";
  await db.insert(campaignDrafts).values({ id, organizationId: actor.organizationId, name: n, data: { initialStatus: BORN_STATUS }, issues: [], createdBy: actor.userId });
  await A(actor, "draft.create", "draft", id, null, { name: n });
  return id;
}
export async function getDraft(actor: Actor, id: string) {
  assertCan(actor, "org.read");
  const [d] = await db.select().from(campaignDrafts).where(and(eq(campaignDrafts.id, id), eq(campaignDrafts.organizationId, actor.organizationId)));
  if (!d) throw new AppError("not_found", "Rascunho não encontrado.");
  if (isRestricted(actor) && d.adAccountId && !(actor.allowedAccountIds ?? []).includes(d.adAccountId)) throw new AppError("not_found", "Rascunho não encontrado.");
  return d;
}
export async function listDrafts(actor: Actor) {
  assertCan(actor, "org.read");
  const rows = await db.select().from(campaignDrafts).where(and(eq(campaignDrafts.organizationId, actor.organizationId), await clientCond(actor, campaignDrafts.clientId))).orderBy(desc(campaignDrafts.updatedAt));
  return isRestricted(actor) ? rows.filter((r) => !r.adAccountId || (actor.allowedAccountIds ?? []).includes(r.adAccountId)) : rows;
}
// Salva um trecho dos dados (mescla), recalcula pendências e status. Nunca envia nada à Meta.
export async function saveDraftStep(actor: Actor, id: string, step: number, patch: Partial<DraftData>) {
  assertCan(actor, "library.write");
  const s = stepSchema.safeParse(step); if (!s.success) throw new AppError("validation", "Etapa inválida.");
  const d = await getDraft(actor, id);
  const data: DraftData & Record<string, unknown> = { ...d.data, ...patch, initialStatus: BORN_STATUS };
  let adAccountId = d.adAccountId, clientId = d.clientId;
  if (patch.adAccountId !== undefined) {
    const [a] = await db.select().from(adAccounts).where(and(eq(adAccounts.id, patch.adAccountId), eq(adAccounts.organizationId, actor.organizationId)));
    if (!a) throw new AppError("not_found", "Conta não encontrada.");
    adAccountId = a.id; clientId = a.clientId;
  }
  if (patch.creativeId) { const [c] = await db.select({ id: creatives.id }).from(creatives).where(and(eq(creatives.id, patch.creativeId), eq(creatives.organizationId, actor.organizationId))); if (!c) throw new AppError("not_found", "Criativo não encontrado."); }
  if (patch.audienceId) { const [c] = await db.select({ id: audiences.id }).from(audiences).where(and(eq(audiences.id, patch.audienceId), eq(audiences.organizationId, actor.organizationId))); if (!c) throw new AppError("not_found", "Público não encontrado."); }
  const issues = validateDraft(data);
  const name = (data.campaignName?.trim() || d.name).slice(0, 200);
  await db.update(campaignDrafts).set({ data, adAccountId, clientId, name, step: Math.max(d.step, s.data), issues, status: issues.length === 0 && data.reviewed ? "ready" : "draft", updatedAt: new Date() }).where(eq(campaignDrafts.id, id));
  await A(actor, "draft.save", "draft", id, null, { step: s.data, issues: issues.length });
  return { issues };
}
export async function deleteDraft(actor: Actor, id: string) {
  assertCan(actor, "library.write");
  const [r] = await db.delete(campaignDrafts).where(and(eq(campaignDrafts.id, id), eq(campaignDrafts.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Rascunho não encontrado.");
  await A(actor, "draft.delete", "draft", id);
}
// Envio à Meta: BLOQUEADO nesta versão. Registra a tentativa em auditoria como bloqueada e não cria nada.
export async function sendDraft(actor: Actor, id: string) {
  assertCan(actor, "campaigns.write");
  assertCan(actor, "library.write");
  const d = await getDraft(actor, id);
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "draft.send_blocked", objectType: "draft", objectId: id, after: { reason: "meta_write_not_enabled", status: d.status }, result: "failure", requestId: actor.requestId });
  throw new AppError("unavailable", SEND_BLOCKED_REASON);
}

// ───────────── UTMs ─────────────
export async function saveUtmTemplate(actor: Actor, t: { name: string; source: string; medium: string; campaignPattern: string; contentPattern?: string; termPattern?: string }) {
  assertCan(actor, "library.write");
  const n = nameSchema(80).safeParse(t.name); if (!n.success) throw new AppError("validation", n.error.issues[0].message);
  if (!t.source.trim() || !t.medium.trim() || !t.campaignPattern.trim()) throw new AppError("validation", "Origem, mídia e campanha são obrigatórios.");
  const id = randomUUID();
  try { await db.insert(utmTemplates).values({ id, organizationId: actor.organizationId, name: n.data, source: t.source.trim().slice(0, 100), medium: t.medium.trim().slice(0, 100), campaignPattern: t.campaignPattern.trim().slice(0, 200), contentPattern: t.contentPattern?.trim().slice(0, 200) || null, termPattern: t.termPattern?.trim().slice(0, 200) || null, createdBy: actor.userId }); } catch (e) { dupMsg(e, "Já existe um modelo com esse nome."); }
  await A(actor, "utm.template_create", "utm_template", id, null, { name: n.data });
  return id;
}
export async function listUtmTemplates(actor: Actor) { assertCan(actor, "org.read"); return db.select().from(utmTemplates).where(eq(utmTemplates.organizationId, actor.organizationId)).orderBy(asc(utmTemplates.name)); }
export async function deleteUtmTemplate(actor: Actor, id: string) {
  assertCan(actor, "library.write");
  const [r] = await db.delete(utmTemplates).where(and(eq(utmTemplates.id, id), eq(utmTemplates.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Modelo não encontrado.");
  await A(actor, "utm.template_delete", "utm_template", id);
}
export async function createUtmLink(actor: Actor, input: { baseUrl: string; params: UtmParams; clientId?: string | null }) {
  assertCan(actor, "library.write");
  const clientId = await assertClient(actor, input.clientId);
  const b = buildUtmUrl(input.baseUrl, input.params);
  const id = randomUUID();
  await db.insert(utmLinks).values({ id, organizationId: actor.organizationId, clientId, baseUrl: input.baseUrl.trim().slice(0, 1000), params: b.params, finalUrl: b.url, createdBy: actor.userId });
  await A(actor, "utm.link_create", "utm", id, null, { finalUrl: b.url });
  return { id, ...b };
}
export async function listUtmLinks(actor: Actor, limit = 200) {
  assertCan(actor, "org.read");
  return db.select().from(utmLinks).where(and(eq(utmLinks.organizationId, actor.organizationId), await clientCond(actor, utmLinks.clientId))).orderBy(desc(utmLinks.createdAt)).limit(limit);
}

// ───────────── Checklists ─────────────
// O alvo precisa existir na organização e estar no acesso do ator (mesma resposta para inexistente e proibido).
async function assertChecklistTarget(actor: Actor, targetType: string, targetId: string) {
  const { campaigns } = await import("@/db/schema");
  let ok = false;
  if (targetType === "account") { const [a] = await db.select({ id: adAccounts.id }).from(adAccounts).where(and(eq(adAccounts.id, targetId), eq(adAccounts.organizationId, actor.organizationId))); ok = !!a && (!isRestricted(actor) || (actor.allowedAccountIds ?? []).includes(a.id)); }
  else if (targetType === "campaign") { const [c] = await db.select({ a: campaigns.adAccountId }).from(campaigns).where(and(eq(campaigns.id, targetId), eq(campaigns.organizationId, actor.organizationId))); ok = !!c && (!isRestricted(actor) || (actor.allowedAccountIds ?? []).includes(c.a)); }
  else if (targetType === "draft") ok = !!(await getDraft(actor, targetId).catch(() => null));
  else if (targetType === "client") { const [c] = await db.select({ id: clients.id }).from(clients).where(and(eq(clients.id, targetId), eq(clients.organizationId, actor.organizationId))); ok = !!c && (await visibleClientIds(actor))?.includes(c.id) !== false; }
  if (!ok) throw new AppError("not_found", "Item não encontrado.");
}
export async function getChecklist(actor: Actor, key: string, targetType: string, targetId: string) {
  assertCan(actor, "org.read");
  await assertChecklistTarget(actor, targetType, targetId);
  const t = checklistByKey(key); if (!t) throw new AppError("not_found", "Checklist não encontrado.");
  const [run] = await db.select().from(checklistRuns).where(and(eq(checklistRuns.organizationId, actor.organizationId), eq(checklistRuns.templateKey, key), eq(checklistRuns.targetType, targetType as never), eq(checklistRuns.targetId, targetId)));
  const done = new Map((run?.items ?? []).map((i) => [i.id, i]));
  return { template: t, completedAt: run?.completedAt ?? null, items: t.items.map((i) => ({ ...i, done: done.get(i.id)?.done ?? false, note: done.get(i.id)?.note, by: done.get(i.id)?.by, at: done.get(i.id)?.at })) };
}
export async function setChecklistItem(actor: Actor, key: string, targetType: "campaign" | "draft" | "account" | "client", targetId: string, itemId: string, done: boolean, note?: string) {
  assertCan(actor, "library.write");
  const t = checklistByKey(key); if (!t || !t.items.some((i) => i.id === itemId)) throw new AppError("not_found", "Item não encontrado.");
  const cur = await getChecklist(actor, key, targetType, targetId);
  const items = cur.items.map((i) => ({ id: i.id, done: i.id === itemId ? done : i.done, note: i.id === itemId ? note?.slice(0, 200) : i.note, by: i.id === itemId ? actor.userId : i.by, at: i.id === itemId ? new Date().toISOString() : i.at }));
  const completedAt = items.every((i) => i.done) ? new Date() : null;
  await db.insert(checklistRuns).values({ id: randomUUID(), organizationId: actor.organizationId, templateKey: key, targetType, targetId, items, completedAt, createdBy: actor.userId }).onDuplicateKeyUpdate({ set: { items, completedAt, updatedAt: new Date() } });
  await A(actor, "checklist.item", "checklist", targetId, null, { key, targetType, itemId, done });
}
export { CHECKLISTS };

// ───────────── Experimentos ─────────────
const expSchema = z.object({
  name: nameSchema(150), hypothesis: z.string().trim().min(10, "Descreva a hipótese (mín. 10 caracteres).").max(1000), objective: z.string().trim().min(1, "Informe o objetivo.").max(200), variable: z.string().trim().min(1, "Informe a variável testada.").max(150),
  primaryMetric: z.enum(["ctr", "cpa", "cpl", "roas", "cpc", "conversion_rate"]), guardMetrics: z.array(z.string().max(30)).max(5).default([]),
  budget: z.number().positive().max(1e9).optional(), startsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(), endsOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  variants: z.array(z.object({ name: z.string().trim().min(1).max(60), campaignId: z.string().uuid().nullable().default(null), note: z.string().max(200).optional() })).min(2, "Informe ao menos 2 variantes.").max(5),
});
export async function saveExperiment(actor: Actor, input: Record<string, unknown> & { clientId?: string | null }) {
  assertCan(actor, "library.write");
  const p = expSchema.safeParse(input); if (!p.success) throw new AppError("validation", p.error.issues[0].message);
  const d = p.data;
  if (d.startsOn && d.endsOn && d.endsOn < d.startsOn) throw new AppError("validation", "A data final é anterior à inicial.");
  if (new Set(d.variants.map((v) => v.name.toLowerCase())).size !== d.variants.length) throw new AppError("validation", "Os nomes das variantes devem ser diferentes.");
  const clientId = await assertClient(actor, input.clientId);
  const { campaigns } = await import("@/db/schema");
  const cids = d.variants.map((v) => v.campaignId).filter((c): c is string => !!c);
  if (cids.length) { const ok = await db.select({ id: campaigns.id }).from(campaigns).where(and(eq(campaigns.organizationId, actor.organizationId), inArray(campaigns.id, cids))); if (ok.length !== new Set(cids).size) throw new AppError("not_found", "Campanha de variante não encontrada."); }
  const id = randomUUID();
  await db.insert(experiments).values({ id, organizationId: actor.organizationId, clientId, name: d.name, hypothesis: d.hypothesis, objective: d.objective, variable: d.variable, primaryMetric: d.primaryMetric, guardMetrics: d.guardMetrics, budget: d.budget?.toFixed(2) ?? null, startsOn: d.startsOn ?? null, endsOn: d.endsOn ?? null, variants: d.variants, createdBy: actor.userId });
  await A(actor, "experiment.create", "experiment", id, null, { name: d.name, metric: d.primaryMetric });
  return id;
}
export async function listExperiments(actor: Actor) {
  assertCan(actor, "org.read");
  return db.select().from(experiments).where(and(eq(experiments.organizationId, actor.organizationId), await clientCond(actor, experiments.clientId))).orderBy(desc(experiments.createdAt));
}
export async function setExperimentStatus(actor: Actor, id: string, status: "planned" | "running" | "concluded" | "cancelled", conclusion?: string, nextAction?: string) {
  assertCan(actor, "library.write");
  if (status === "concluded" && !conclusion?.trim()) throw new AppError("validation", "Registre a conclusão (com base nos dados) antes de concluir.");
  const [r] = await db.update(experiments).set({ status, conclusion: conclusion?.trim().slice(0, 2000) ?? null, nextAction: nextAction?.trim().slice(0, 300) ?? null, updatedAt: new Date() }).where(and(eq(experiments.id, id), eq(experiments.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Experimento não encontrado.");
  await A(actor, "experiment.status", "experiment", id, null, { status });
}
