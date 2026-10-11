import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: { serverActions: { bodySizeLimit: "2mb" } },
  serverExternalPackages: ["mysql2", "pdfkit", "pdfjs-dist", "exceljs"],
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          // CSP parcial: bloqueia embutir o site, <base>, <object> e envio de formulários para outros domínios.
          // (script-src não é restringido porque o Next injeta scripts inline; endurecer com nonce é trabalho futuro.)
          { key: "Content-Security-Policy", value: "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
      // Logo enviada por usuários: CSP mais restritiva que a global (nada executa, nem se o arquivo fosse malicioso).
      { source: "/api/logo", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }] },
    ];
  },
};

export default nextConfig;
