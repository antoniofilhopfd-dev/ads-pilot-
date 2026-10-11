// Convenção de nomes: partes separadas por " | ". Aplicada na criação de campanhas/conjuntos/anúncios (rascunhos).
// Referência de ideia (AdFlow): nomes padronizados facilitam filtros e relatórios. Implementação própria.
export const NAME_SEP = " | ";
export const NAME_MAX = 200;

const clean = (s: string) => s.replace(/[|\r\n\t]+/g, " ").replace(/\s+/g, " ").trim();

export type NameParts = { cliente?: string; objetivo?: string; publico?: string; oferta?: string; periodo?: string; extra?: string };

export function buildName(parts: NameParts): string {
  return [parts.cliente, parts.objetivo, parts.publico, parts.oferta, parts.periodo, parts.extra].map((p) => clean(p ?? "")).filter(Boolean).join(NAME_SEP);
}

export function validateName(name: string, opts: { minParts?: number } = {}): string | null {
  const n = name.trim();
  if (!n) return "Informe um nome.";
  if (n.length > NAME_MAX) return `O nome passa de ${NAME_MAX} caracteres.`;
  if (/[\r\n\t]/.test(n)) return "O nome não pode ter quebras de linha.";
  const parts = n.split("|").map((p) => p.trim()).filter(Boolean);
  if (opts.minParts && parts.length < opts.minParts) return `Use a convenção com ao menos ${opts.minParts} partes separadas por " | " (ex.: Cliente | Objetivo | Público | 2026-03).`;
  return null;
}
