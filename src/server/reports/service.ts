import { createHash, randomUUID } from "node:crypto";
import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db";
import { reportExports, reportTemplates } from "@/db/schema";
import { AppError, isDuplicateKey } from "@/lib/errors";
import { logger } from "@/lib/logger";
import { audit } from "../audit";
import { assertCan, type Actor } from "../context";
import { buildReport, parseConfig } from "./builder";
import { generateCsv } from "./csv";
import { filenameFor } from "./table";
import { generatePdf } from "./pdf";
import { verifyExport, type Verification } from "./verify";
import { REPORT_TYPES, SECTIONS, type Report, type ReportConfig } from "./types";
import { generateXlsx } from "./xlsx";

export type Format = "pdf" | "xlsx" | "csv";
export const MIME: Record<Format, string> = { pdf: "application/pdf", xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", csv: "text/csv; charset=utf-8" };

export async function generateFile(format: Format, report: Report): Promise<Buffer> {
  return format === "pdf" ? generatePdf(report) : format === "xlsx" ? generateXlsx(report) : generateCsv(report);
}

// Gera → REABRE e VERIFICA → só então registra e libera. Se a verificação falhar, nada é entregue.
export async function exportReport(actor: Actor, config: ReportConfig, format: Format, opts: { report?: Report; now?: Date; tamper?: (b: Buffer) => Buffer } = {}) {
  assertCan(actor, "insights.read");
  const report = opts.report ?? (await buildReport(actor, config, opts.now));
  let buffer = await generateFile(format, report);
  if (opts.tamper) buffer = opts.tamper(buffer); // somente testes
  const verification: Verification = await verifyExport(format, buffer, report);
  const filename = filenameFor(report, format);
  const sha256 = createHash("sha256").update(buffer).digest("hex");
  await db.insert(reportExports).values({
    id: randomUUID(), organizationId: actor.organizationId, userId: actor.userId, reportType: config.type, format, config: config as unknown as Record<string, unknown>,
    filename, bytes: buffer.length, sha256, verified: verification.ok, verification: verification.ok ? verification.checks : verification.failures,
  });
  await audit({
    organizationId: actor.organizationId, userId: actor.userId, clientId: config.clientId ?? null, action: "report.export", objectType: "report", objectId: null,
    after: { type: config.type, format, bytes: buffer.length, verified: verification.ok }, result: verification.ok ? "success" : "failure",
    error: verification.ok ? null : verification.failures.join("; "), requestId: actor.requestId,
  });
  if (!verification.ok) {
    logger.error("report_export_verification_failed", { type: config.type, format, failures: verification.failures });
    throw new AppError("conflict", `A exportação foi gerada, mas falhou na verificação e não foi entregue: ${verification.failures[0]}`);
  }
  return { buffer, filename, mime: MIME[format], verification, sha256 };
}

export async function listExports(actor: Actor, limit = 20) {
  assertCan(actor, "insights.read");
  // acesso restrito: só as próprias exportações (as de outras pessoas podem conter contas fora do acesso)
  return db.select().from(reportExports).where(and(eq(reportExports.organizationId, actor.organizationId), actor.allowedAccountIds !== null ? eq(reportExports.userId, actor.userId) : undefined)).orderBy(desc(reportExports.createdAt)).limit(limit);
}

// ── Modelos reutilizáveis
const configSchema = z.object({
  type: z.enum(REPORT_TYPES), days: z.union([z.literal(7), z.literal(30), z.literal(90)]),
  clientId: z.string().uuid().optional(), accountId: z.string().uuid().optional(), sections: z.array(z.enum(SECTIONS)).min(1),
});

export async function saveTemplate(actor: Actor, name: unknown, config: unknown) {
  assertCan(actor, "reports.manage");
  const n = z.string().trim().min(2).max(120).safeParse(name);
  const c = configSchema.safeParse(config);
  if (!n.success) throw new AppError("validation", "Informe um nome para o modelo (2 a 120 caracteres).");
  if (!c.success) throw new AppError("validation", "Configuração de relatório inválida.");
  const id = randomUUID();
  try {
    await db.insert(reportTemplates).values({ id, organizationId: actor.organizationId, name: n.data, config: c.data as Record<string, unknown>, createdBy: actor.userId });
  } catch (e) {
    if (isDuplicateKey(e)) throw new AppError("conflict", "Já existe um modelo com este nome.");
    throw e;
  }
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "report.template_save", objectType: "report_template", objectId: id, after: { name: n.data, ...c.data }, result: "success", requestId: actor.requestId });
  return id;
}

export async function listTemplates(actor: Actor) {
  assertCan(actor, "insights.read");
  return db.select().from(reportTemplates).where(eq(reportTemplates.organizationId, actor.organizationId)).orderBy(reportTemplates.name);
}

export async function deleteTemplate(actor: Actor, id: string) {
  assertCan(actor, "reports.manage");
  const [r] = await db.delete(reportTemplates).where(and(eq(reportTemplates.id, id), eq(reportTemplates.organizationId, actor.organizationId)));
  if (r.affectedRows !== 1) throw new AppError("not_found", "Modelo não encontrado.");
  await audit({ organizationId: actor.organizationId, userId: actor.userId, action: "report.template_delete", objectType: "report_template", objectId: id, result: "success", requestId: actor.requestId });
}

export { parseConfig };
