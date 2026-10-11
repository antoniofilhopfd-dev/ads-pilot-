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
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
          ...(process.env.NODE_ENV === "production" ? [{ key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains" }] : []),
        ],
      },
      // APIs (JSON/arquivos): nada carrega nem executa. As páginas recebem CSP com nonce em src/proxy.ts.
      { source: "/api/:path*", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; frame-ancestors 'none'" }] },
      // Logo enviada por usuários: CSP mais restritiva que a global (nada executa, nem se o arquivo fosse malicioso).
      { source: "/api/logo", headers: [{ key: "Content-Security-Policy", value: "default-src 'none'; sandbox" }] },
    ];
  },
};

export default nextConfig;
