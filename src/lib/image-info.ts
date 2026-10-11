import PDFDocument from "pdfkit";
import { AppError } from "./errors";

export const LOGO_MAX_BYTES = 1_000_000;
export const LOGO_MIN_PX = 64;
export const LOGO_MAX_PX = 4000;

export type ImageInfo = { mime: "image/png" | "image/jpeg"; ext: "png" | "jpeg"; width: number; height: number };

const bad = (m: string) => new AppError("validation", m);

// Valida pelo CONTEÚDO (assinatura e cabeçalho), nunca pela extensão/Content-Type enviados pelo usuário.
// Aceita só PNG e JPEG. SVG é recusado de propósito (pode conter script).
export function inspectImage(buf: Buffer): ImageInfo {
  if (buf.length === 0) throw bad("Arquivo vazio.");
  if (buf.length > LOGO_MAX_BYTES) throw bad(`Arquivo grande demais (máximo ${(LOGO_MAX_BYTES / 1_000_000).toFixed(0)} MB).`);
  let info: ImageInfo;
  if (buf.length > 33 && buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    if (buf.subarray(12, 16).toString("ascii") !== "IHDR" || buf.readUInt32BE(8) !== 13) throw bad("PNG inválido.");
    if (buf[28] !== 0) throw bad("PNG entrelaçado (interlaced) não é suportado. Salve o PNG sem entrelaçamento.");
    info = { mime: "image/png", ext: "png", width: buf.readUInt32BE(16), height: buf.readUInt32BE(20) };
  } else if (buf.length > 4 && buf[0] === 0xff && buf[1] === 0xd8) {
    let i = 2, found: { w: number; h: number; comps: number } | null = null;
    while (i + 9 < buf.length) {
      if (buf[i] !== 0xff) throw bad("JPEG inválido.");
      const m = buf[i + 1];
      if (m === 0xff) { i++; continue; }
      if ((m >= 0xc0 && m <= 0xcf) && m !== 0xc4 && m !== 0xc8 && m !== 0xcc) { found = { h: buf.readUInt16BE(i + 5), w: buf.readUInt16BE(i + 7), comps: buf[i + 9] }; break; }
      if (m === 0xda || m === 0xd9) break;
      i += 2 + buf.readUInt16BE(i + 2);
    }
    if (!found) throw bad("JPEG inválido.");
    if (found.comps === 4) throw bad("JPEG em CMYK não é suportado. Exporte em RGB.");
    info = { mime: "image/jpeg", ext: "jpeg", width: found.w, height: found.h };
  } else {
    throw bad("Formato não suportado. Envie uma imagem PNG ou JPEG (SVG, GIF e WebP não são aceitos).");
  }
  if (info.width < LOGO_MIN_PX || info.height < LOGO_MIN_PX) throw bad(`Imagem pequena demais (mínimo ${LOGO_MIN_PX}×${LOGO_MIN_PX} pixels).`);
  if (info.width > LOGO_MAX_PX || info.height > LOGO_MAX_PX) throw bad(`Imagem grande demais (máximo ${LOGO_MAX_PX}×${LOGO_MAX_PX} pixels).`);
  return info;
}

// Garante que o gerador de PDF consegue embutir a imagem (evita aceitar um arquivo que quebraria todo relatório).
export async function assertEmbeddable(buf: Buffer): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    try {
      const doc = new PDFDocument({ size: "A4" });
      doc.on("data", () => {});
      doc.on("end", () => resolve());
      doc.on("error", reject);
      doc.image(buf, 0, 0, { fit: [50, 50] });
      doc.end();
    } catch { reject(bad("Não foi possível processar esta imagem. Tente salvá-la novamente como PNG ou JPEG padrão.")); }
  }).catch(() => { throw bad("Não foi possível processar esta imagem. Tente salvá-la novamente como PNG ou JPEG padrão."); });
}
