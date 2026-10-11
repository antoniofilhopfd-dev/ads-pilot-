import Link from "next/link";
import { notFound } from "next/navigation";
import { ReportView } from "@/components/report-view";
import { PageHeader, btnCls } from "@/components/ui";
import { AppError } from "@/lib/errors";
import { buildReport, parseConfig } from "@/server/reports/builder";
import type { SP } from "@/server/params";
import { requireActor } from "@/server/session";

export const metadata = { title: "Relatório — AdsPilot" };

export default async function Ver({ searchParams }: { searchParams: Promise<SP> }) {
  const { actor } = await requireActor();
  const sp = await searchParams;
  const config = parseConfig(sp);
  let report;
  try { report = await buildReport(actor, config); } catch (e) { if (e instanceof AppError && e.code === "not_found") notFound(); throw e; }
  const q = new URLSearchParams({ tipo: config.type, dias: String(config.days), ...(config.clientId ? { cliente: config.clientId } : {}), ...(config.accountId ? { conta: config.accountId } : {}) });
  for (const s of config.sections) q.append("secoes", s);
  const link = (f: string) => `/api/relatorios/exportar?${q.toString()}&formato=${f}`;
  return (
    <>
      <PageHeader title={report.title} subtitle="Visualização no aplicativo. As exportações são geradas, reabertas e verificadas antes de baixar." action={
        <div className="flex flex-wrap gap-2"><a className={btnCls.primary} href={link("pdf")} download>PDF</a><a className={btnCls.secondary} href={link("xlsx")} download>XLSX</a><a className={btnCls.secondary} href={link("csv")} download>CSV</a></div>} />
      <p className="mb-4 text-sm"><Link className="text-brand underline" href="/app/relatorios">← Relatórios</Link></p>
      <ReportView r={report} />
    </>
  );
}
