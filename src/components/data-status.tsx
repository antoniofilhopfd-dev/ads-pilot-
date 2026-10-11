import Link from "next/link";
import { Alert } from "./ui";

export function DemoBanner() {
  return (
    <div className="mb-4">
      <Alert tone="info"><strong>MODO DEMONSTRAÇÃO</strong> — os dados abaixo são <strong>simulados</strong> para validar a plataforma. Não vêm da Meta. <Link className="underline" href="/app/integracoes">Gerenciar conexão</Link></Alert>
    </div>
  );
}

export function SyncBadge({ lastSyncedAt, stale, hasConnection }: { lastSyncedAt: Date | null; stale: boolean; hasConnection: boolean }) {
  if (!hasConnection) return null;
  const when = lastSyncedAt?.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" });
  return (
    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${stale ? "bg-[#fbf1dc] text-[#9a6c10]" : "bg-[#e3f5ee] text-ok"}`}>
      {lastSyncedAt ? `${stale ? "Desatualizado · " : ""}Última sincronização: ${when}` : "Ainda não sincronizado"}
    </span>
  );
}
