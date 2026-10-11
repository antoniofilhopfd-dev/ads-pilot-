import { readFileSync } from "node:fs";
import { deflateSync } from "node:zlib";
import { describe, expect, it } from "vitest";
import { inspectImage } from "@/lib/image-info";
import { configureAccount, connectDemo, listAccounts } from "@/server/meta/connection";
import { syncAccount } from "@/server/meta/sync";
import { buildReport } from "@/server/reports/builder";
import { generatePdf } from "@/server/reports/pdf";
import { exportReport } from "@/server/reports/service";
import { DEFAULT_SECTIONS } from "@/server/reports/types";
import { verifyPdf, verifyXlsx } from "@/server/reports/verify";
import { generateXlsx } from "@/server/reports/xlsx";
import { deleteLogo, getLogo, saveLogo } from "@/server/services/logo";
import { addUserWithRole, newOrg } from "./helpers";

const PNG = readFileSync("tests/fixtures/logo-demo.png"), JPG = readFileSync("tests/fixtures/logo-demo.jpg");
const NOW = new Date();
const cfg = { type: "executive" as const, days: 30 as const, sections: DEFAULT_SECTIONS.executive };

function crc32(b: Buffer) { let c, crc = 0xffffffff; for (let n = 0; n < b.length; n++) { c = (crc ^ b[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type: string, data: Buffer) { const l = Buffer.alloc(4); l.writeUInt32BE(data.length); const td = Buffer.concat([Buffer.from(type), data]); const c = Buffer.alloc(4); c.writeUInt32BE(crc32(td)); return Buffer.concat([l, td, c]); }
// PNG sintético (RGB 8 bits, cor sólida). interlace=1 gera PNG entrelaçado (cabeçalho), usado só para testar a recusa.
function makePng(w: number, h: number, interlace = 0) {
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[12] = interlace;
  const row = Buffer.concat([Buffer.from([0]), Buffer.alloc(w * 3, 0x55)]);
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", ihdr), chunk("IDAT", deflateSync(Buffer.concat(Array.from({ length: h }, () => row)))), chunk("IEND", Buffer.alloc(0))]);
}

async function demoOrg(label = "Lg") {
  const o = await newOrg(label);
  await connectDemo(o.admin);
  const [a] = await listAccounts(o.admin);
  await configureAccount(o.admin, a.id, { selected: true, clientId: null });
  await syncAccount(o.admin, a.id, { now: NOW, sleep: async () => {} });
  return o;
}

describe("validação da imagem (pelo conteúdo)", () => {
  it("aceita PNG e JPEG válidos e lê as dimensões", () => {
    expect(inspectImage(PNG)).toMatchObject({ mime: "image/png", width: 360, height: 120 });
    expect(inspectImage(JPG)).toMatchObject({ mime: "image/jpeg", width: 360, height: 120 });
    expect(inspectImage(makePng(200, 100))).toMatchObject({ width: 200, height: 100 });
  });

  it("recusa SVG, GIF, WebP, HTML, texto, vazio, truncado e arquivos disfarçados", () => {
    const svg = Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><script>alert(1)</script></svg>');
    for (const bad of [svg, Buffer.from("GIF89a" + "x".repeat(40)), Buffer.from("RIFF0000WEBPVP8 " + "x".repeat(40)), Buffer.from("<html><script>alert(1)</script></html>"), Buffer.alloc(0), Buffer.from("texto qualquer".repeat(10)), PNG.subarray(0, 20), JPG.subarray(0, 3)])
      expect(() => inspectImage(bad)).toThrow();
    // PNG que na verdade é HTML com assinatura falsa no início do texto
    expect(() => inspectImage(Buffer.concat([Buffer.from("<script>alert(1)</script>"), PNG]))).toThrow();
  });

  it("recusa tamanho, dimensões, PNG entrelaçado e JPEG CMYK", () => {
    expect(() => inspectImage(Buffer.concat([PNG, Buffer.alloc(1_100_000)]))).toThrow(/grande demais/);
    expect(() => inspectImage(makePng(32, 32))).toThrow(/pequena demais/);
    expect(() => inspectImage(makePng(5000, 70))).toThrow(/grande demais/);
    expect(() => inspectImage(makePng(100, 100, 1))).toThrow(/entrelaçado/);
    // JPEG com SOF de 4 componentes (CMYK)
    const sof = Buffer.from([0xff, 0xd8, 0xff, 0xc0, 0x00, 0x14, 0x08, 0x00, 0x80, 0x00, 0x80, 0x04, 1, 0x11, 0, 2, 0x11, 0, 3, 0x11, 0, 4, 0x11, 0, 0xff, 0xd9]);
    expect(() => inspectImage(sof)).toThrow(/CMYK/);
  });
});

describe("logo da organização", () => {
  it("só administrador altera; qualquer membro lê; cada organização vê a sua; remoção funciona", async () => {
    const a = await demoOrg("A"), b = await demoOrg("B");
    const mg = await addUserWithRole(a, "manager"), an = await addUserWithRole(a, "analyst");
    await expect(saveLogo(mg.actor, PNG)).rejects.toMatchObject({ code: "forbidden" });
    await expect(saveLogo(an.actor, PNG)).rejects.toMatchObject({ code: "forbidden" });
    expect((await saveLogo(a.admin, PNG)).mime).toBe("image/png");
    expect((await getLogo(an.actor))?.width).toBe(360);
    expect(await getLogo(b.admin)).toBeNull(); // organização B não enxerga a logo da A
    await saveLogo(b.admin, JPG);
    expect((await getLogo(a.admin))?.mime).toBe("image/png"); expect((await getLogo(b.admin))?.mime).toBe("image/jpeg");
    await saveLogo(a.admin, JPG); expect((await getLogo(a.admin))?.mime).toBe("image/jpeg"); // trocar substitui
    await expect(saveLogo(a.admin, Buffer.from("<svg onload=alert(1)>"))).rejects.toMatchObject({ code: "validation" });
    await deleteLogo(a.admin); expect(await getLogo(a.admin)).toBeNull();
    await expect(deleteLogo(a.admin)).rejects.toMatchObject({ code: "not_found" });
  });

  it("acesso restrito a contas não altera a logo (ação organizacional)", async () => {
    const a = await demoOrg("R");
    const m = await addUserWithRole(a, "manager");
    const { setMemberAccess } = await import("@/server/services/organizations");
    const { getActor } = await import("@/server/context");
    await setMemberAccess(a.admin, m.userId, { scope: "restricted", accountIds: [] });
    await expect(saveLogo(await getActor(m.userId, a.organizationId), PNG)).rejects.toMatchObject({ code: "forbidden" });
  });
});

describe("a logo entra nos relatórios e a verificação confere", () => {
  it("PDF e XLSX com logo (PNG e JPEG): imagem presente e verificada; sem logo: nenhuma imagem", async () => {
    const o = await demoOrg("Rel");
    const semLogo = await buildReport(o.admin, cfg, NOW);
    expect(semLogo.meta.logo).toBeNull();
    expect((await verifyPdf(await generatePdf(semLogo), semLogo)).failures).toEqual([]);
    expect((await verifyXlsx(await generateXlsx(semLogo), semLogo)).failures).toEqual([]);
    for (const img of [PNG, JPG]) {
      await saveLogo(o.admin, img);
      const r = await buildReport(o.admin, cfg, NOW);
      expect(r.meta.logo?.sha256).toBeTruthy();
      const pdf = await verifyPdf(await generatePdf(r), r), xlsx = await verifyXlsx(await generateXlsx(r), r);
      expect(pdf.failures).toEqual([]); expect(pdf.checks.join(" ")).toMatch(/Logo da empresa desenhada/);
      expect(xlsx.failures).toEqual([]); expect(xlsx.checks.join(" ")).toMatch(/Logo da empresa presente/);
      // exportação completa (gerar + verificar + registrar)
      for (const f of ["pdf", "xlsx", "csv"] as const) expect((await exportReport(o.admin, cfg, f, { now: NOW })).verification.ok).toBe(true);
    }
  }, 90_000);

  it("o verificador reprova arquivo SEM a logo quando a organização tem logo (e o inverso)", async () => {
    const o = await demoOrg("Neg");
    const sem = await buildReport(o.admin, cfg, NOW);
    await saveLogo(o.admin, PNG);
    const com = await buildReport(o.admin, cfg, NOW);
    const pdfSem = await generatePdf(sem), xlsxSem = await generateXlsx(sem), pdfCom = await generatePdf(com), xlsxCom = await generateXlsx(com);
    expect((await verifyPdf(pdfSem, com)).ok).toBe(false); expect((await verifyXlsx(xlsxSem, com)).ok).toBe(false);
    expect((await verifyPdf(pdfCom, sem)).ok).toBe(false); expect((await verifyXlsx(xlsxCom, sem)).ok).toBe(false);
  }, 60_000);

  it("PDF de várias páginas leva a logo grande na 1ª página e a pequena nas demais", async () => {
    const o = await demoOrg("Pg");
    await saveLogo(o.admin, PNG);
    const r = await buildReport(o.admin, { ...cfg, sections: DEFAULT_SECTIONS.campaigns }, NOW);
    const many = { ...r, campaigns: Array.from({ length: 120 }, (_, i) => ({ ...r.campaigns[i % r.campaigns.length], id: `x${i}`, name: `Campanha número ${i + 1}` })) };
    const pdf = await generatePdf(many);
    const pdfjs = await import("pdfjs-dist/legacy/build/pdf.mjs");
    const doc = await pdfjs.getDocument({ data: new Uint8Array(pdf), verbosity: 0 }).promise;
    expect(doc.numPages).toBeGreaterThanOrEqual(3);
    for (let i = 1; i <= doc.numPages; i++) {
      const ops = await (await doc.getPage(i)).getOperatorList();
      expect(ops.fnArray.some((f: number) => f === pdfjs.OPS.paintImageXObject), `página ${i} sem logo`).toBe(true);
    }
    expect((await verifyPdf(pdf, many)).failures).toEqual([]);
  }, 60_000);
});
