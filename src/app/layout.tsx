import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"], weight: ["400", "500", "600", "700"], variable: "--font-inter" });

// CSP com nonce exige renderização dinâmica (o nonce muda a cada requisição).
export const dynamic = "force-dynamic";

export const metadata: Metadata = { title: "AdsPilot", description: "Gestão, análise e otimização de campanhas publicitárias." };
export const viewport: Viewport = { width: "device-width", initialScale: 1 };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="font-sans antialiased">{children}</body>
    </html>
  );
}
