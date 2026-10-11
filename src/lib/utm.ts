// Construtor de UTMs. Regras: só http(s); parâmetros em minúsculas sem espaços; não duplica utm_* já existentes (substitui); preserva query existente.
import { AppError } from "./errors";

export const UTM_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_content", "utm_term"] as const;
export type UtmParams = Partial<Record<(typeof UTM_KEYS)[number], string>>;

export const slug = (s: string) =>
  s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim().replace(/[^a-z0-9_{}.-]+/g, "_").replace(/^_+|_+$/g, "");

export function buildUtmUrl(baseUrl: string, params: UtmParams): { url: string; params: Record<string, string>; warnings: string[] } {
  let u: URL;
  try { u = new URL(baseUrl.trim()); } catch { throw new AppError("validation", "URL de destino inválida. Inclua https://"); }
  if (u.protocol !== "https:" && u.protocol !== "http:") throw new AppError("validation", "Use uma URL http(s).");
  const warnings: string[] = [];
  if (u.protocol === "http:") warnings.push("A URL usa http (sem criptografia). Prefira https.");
  const out: Record<string, string> = {};
  for (const k of UTM_KEYS) {
    const raw = params[k]?.trim();
    if (!raw) continue;
    const v = slug(raw);
    if (!v) throw new AppError("validation", `${k} contém apenas caracteres inválidos.`);
    if (u.searchParams.has(k)) warnings.push(`${k} já existia na URL e foi substituído.`);
    u.searchParams.set(k, v);
    out[k] = v;
  }
  for (const req of ["utm_source", "utm_medium", "utm_campaign"] as const) if (!out[req]) throw new AppError("validation", `${req} é obrigatório.`);
  const url = u.toString();
  if (url.length > 2000) throw new AppError("validation", "URL final passa de 2000 caracteres.");
  return { url, params: out, warnings };
}

// Padrões: {campanha} {cliente} {data} {criativo}
export function applyPattern(pattern: string, vars: Record<string, string>) {
  return pattern.replace(/\{(\w+)\}/g, (_, k: string) => vars[k] ?? "");
}

const csvCell = (v: string) => {
  // Neutraliza injeção de fórmula em planilhas.
  const s = /^[=+\-@\t\r]/.test(v) ? `'${v}` : v;
  return /[";\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};
export function utmCsv(rows: { createdAt: Date; baseUrl: string; params: Record<string, string>; finalUrl: string }[]) {
  const head = ["data", "url_base", ...UTM_KEYS, "url_final"];
  const lines = rows.map((r) => [r.createdAt.toISOString().slice(0, 10), r.baseUrl, ...UTM_KEYS.map((k) => r.params[k] ?? ""), r.finalUrl].map(csvCell).join(";"));
  return "﻿" + [head.join(";"), ...lines].join("\r\n") + "\r\n";
}
