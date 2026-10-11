import Link from "next/link";
import { notFound } from "next/navigation";
import { Form } from "@/components/form";
import { Alert, Badge, Card, PageHeader, inputCls } from "@/components/ui";
import { BID_STRATEGIES, OBJECTIVES, SPECIAL_CATEGORIES, WIZARD_STEPS, type DraftData } from "@/lib/draft";
import { buildName } from "@/lib/naming";
import { buildUtmUrl } from "@/lib/utm";
import { AppError } from "@/lib/errors";
import { canActor } from "@/server/context";
import { getDraft, listAudiences, listCreatives } from "@/server/library";
import { filterOptions, one, type SP } from "@/server/params";
import { requireActor } from "@/server/session";
import { saveDraftStepAction, sendDraftAction } from "../../../actions";

export const metadata = { title: "Assistente de campanha — AdsPilot" };
const L = ({ label, children }: { label: string; children: React.ReactNode }) => <label className="block text-sm font-medium">{label}<div className="mt-1">{children}</div></label>;

export default async function Assistente({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<SP> }) {
  const { id } = await params; const sp = await searchParams;
  const { actor } = await requireActor();
  let draft;
  try { draft = await getDraft(actor, id); } catch (e) { if (e instanceof AppError) notFound(); throw e; }
  const step = Math.min(Math.max(Number(one(sp.etapa)) || 1, 1), 10);
  const d = draft.data as DraftData;
  const write = canActor(actor, "library.write");
  const [opts, auds, crs] = await Promise.all([filterOptions(actor), listAudiences(actor), listCreatives(actor)]);
  const client = opts.clients.find((c) => c.id === draft.clientId)?.name;
  const suggest = buildName({ cliente: client, objetivo: d.objective ? OBJECTIVES[d.objective as keyof typeof OBJECTIVES] : undefined, periodo: new Date().toISOString().slice(0, 7) });
  const fieldIssues = draft.issues.filter((i) => i.step === step);
  let utmUrl: string | null = null;
  if (d.destinationUrl) { try { utmUrl = buildUtmUrl(d.destinationUrl, { utm_source: d.utmSource || "meta", utm_medium: d.utmMedium || "paid_social", utm_campaign: d.utmCampaign || d.campaignName || "campanha", utm_content: d.utmContent }).url; } catch { /* mostrado como pendência */ } }
  const reviewed = d.reviewed === true;
  return (
    <>
      <PageHeader title={draft.name} subtitle="Assistente de criação — rascunho local. Nada é enviado à Meta." action={<Link href="/app/rascunhos" className="text-sm text-brand hover:underline">← Rascunhos</Link>} />
      <nav aria-label="Etapas do assistente" className="mb-4 flex flex-wrap gap-1">
        {WIZARD_STEPS.map((s) => (
          <Link key={s.n} href={`/app/rascunhos/${id}?etapa=${s.n}`} aria-current={s.n === step ? "step" : undefined}
            className={`rounded-full border px-3 py-1 text-xs ${s.n === step ? "border-brand bg-brand text-white" : draft.issues.some((i) => i.step === s.n) ? "border-[#e0b869] bg-[#fbf1dc] text-[#7a5200]" : "border-line bg-surface text-muted"}`}>{s.n}. {s.title}</Link>))}
      </nav>
      <Card className="max-w-3xl">
        <h2 className="mb-1 text-lg font-semibold">Etapa {step}: {WIZARD_STEPS[step - 1].title}</h2>
        {fieldIssues.length > 0 && <div className="mb-3"><Alert tone="info"><ul className="list-disc pl-4">{fieldIssues.map((i) => <li key={i.field}>{i.message}</li>)}</ul></Alert></div>}
        {step === 10 ? (
          <div className="space-y-3">
            <Alert tone="info">Rascunho {draft.status === "ready" ? "revisado e pronto" : `com ${draft.issues.length} pendência(s)`}. Toda campanha criada pelo AdsPilot nasce <strong>PAUSADA</strong>.</Alert>
            <Form action={sendDraftAction} submit="Enviar para a Meta" variant="secondary"><input type="hidden" name="draftId" value={id} /></Form>
            <p className="text-sm text-muted">O envio permanece bloqueado até existir uma conexão real com a Meta com permissão de escrita validada. Clicar acima registra a tentativa na auditoria e não cria nada na Meta.</p>
          </div>
        ) : step === 9 ? (
          <Form action={saveDraftStepAction} submit="Salvar revisão e continuar">
            <input type="hidden" name="draftId" value={id} /><input type="hidden" name="etapa" value="9" />
            <dl className="grid gap-2 text-sm sm:grid-cols-2">
              {([["Conta", opts.accounts.find((a) => a.id === draft.adAccountId)?.name], ["Objetivo", d.objective ? OBJECTIVES[d.objective as keyof typeof OBJECTIVES] : undefined], ["Campanha", d.campaignName], ["Orçamento", d.budgetMode === "cbo" ? `Campanha: ${d.campaignDailyBudget ?? "—"}/dia` : `Conjunto: ${d.dailyBudget ?? "—"}/dia`],
                ["Conjunto", d.adSetName], ["Lance", d.bidStrategy ? BID_STRATEGIES[d.bidStrategy as keyof typeof BID_STRATEGIES] : undefined], ["Período", `${d.startDate ?? "—"} → ${d.endDate ?? "sem fim"}`], ["Público", auds.find((a) => a.id === d.audienceId)?.name ?? d.locations],
                ["Posicionamentos", d.placements === "manual" ? d.placementList : d.placements === "automatic" ? "Automáticos" : undefined], ["Criativo", crs.find((c) => c.id === d.creativeId)?.name], ["URL final", utmUrl ?? undefined], ["Status inicial", "PAUSADA (regra fixa)"]] as [string, string | undefined][]).map(([k, v]) => (
                <div key={k}><dt className="text-xs text-muted">{k}</dt><dd className={v ? "break-all" : "text-danger"}>{v || "pendente"}</dd></div>))}
            </dl>
            {draft.issues.length > 0 && <Alert tone="error"><p className="font-medium">Pendências:</p><ul className="list-disc pl-4">{draft.issues.map((i) => <li key={`${i.step}${i.field}`}><Link className="underline" href={`/app/rascunhos/${id}?etapa=${i.step}`}>Etapa {i.step}</Link>: {i.message}</li>)}</ul></Alert>}
            <label className="flex items-center gap-2 text-sm"><input type="checkbox" name="reviewed" defaultChecked={reviewed} />Revisei todos os dados acima e confirmo que a campanha deve ser criada pausada.</label>
          </Form>
        ) : (
          <Form action={saveDraftStepAction} submit={step === 8 ? "Salvar e ir à revisão" : "Salvar e continuar"}>
            <input type="hidden" name="draftId" value={id} /><input type="hidden" name="etapa" value={step} />
            {step === 1 && <L label="Conta de anúncios"><select name="adAccountId" required defaultValue={draft.adAccountId ?? ""} className={inputCls}><option value="">Escolha…</option>{opts.accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}</select></L>}
            {step === 2 && <L label="Objetivo da campanha"><select name="objective" required defaultValue={d.objective ?? ""} className={inputCls}><option value="">Escolha…</option>{Object.entries(OBJECTIVES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>}
            {step === 3 && <>
              <L label="Nome da campanha (convenção: Cliente | Objetivo | Período)"><input name="campaignName" required defaultValue={d.campaignName ?? suggest} maxLength={200} className={inputCls} /></L>
              <p className="text-xs text-muted">Sugestão: {suggest || "preencha conta e objetivo"}</p>
              <L label="Onde fica o orçamento"><select name="budgetMode" defaultValue={d.budgetMode ?? "abo"} className={inputCls}><option value="abo">No conjunto de anúncios</option><option value="cbo">Na campanha (otimização automática entre conjuntos)</option></select></L>
              <L label="Orçamento diário da campanha (se na campanha)"><input name="campaignDailyBudget" inputMode="decimal" defaultValue={d.campaignDailyBudget ?? ""} className={inputCls} /></L>
              <L label="Categoria especial de anúncio"><select name="specialCategory" defaultValue={d.specialCategory ?? "NONE"} className={inputCls}>{Object.entries(SPECIAL_CATEGORIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L></>}
            {step === 4 && <>
              <L label="Nome do conjunto (Cliente | Público | Faixa)"><input name="adSetName" required defaultValue={d.adSetName ?? ""} maxLength={200} className={inputCls} /></L>
              <L label="Orçamento diário do conjunto (se no conjunto)"><input name="dailyBudget" inputMode="decimal" defaultValue={d.dailyBudget ?? ""} className={inputCls} /></L>
              <L label="Estratégia de lance"><select name="bidStrategy" defaultValue={d.bidStrategy ?? "LOWEST_COST_WITHOUT_CAP"} className={inputCls}>{Object.entries(BID_STRATEGIES).map(([k, v]) => <option key={k} value={k}>{v}</option>)}</select></L>
              <L label="Valor do limite/ROAS (se a estratégia exigir)"><input name="bidAmount" inputMode="decimal" defaultValue={d.bidAmount ?? ""} className={inputCls} /></L>
              <div className="grid grid-cols-2 gap-2"><L label="Início"><input name="startDate" type="date" defaultValue={d.startDate ?? ""} className={inputCls} /></L><L label="Fim (opcional)"><input name="endDate" type="date" defaultValue={d.endDate ?? ""} className={inputCls} /></L></div></>}
            {step === 5 && <>
              <L label="Público salvo (opcional)"><select name="audienceId" defaultValue={d.audienceId ?? ""} className={inputCls}><option value="">Definir aqui</option>{auds.map((a) => <option key={a.id} value={a.id}>{a.name} (v{a.version})</option>)}</select></L>
              <L label="Localização"><input name="locations" defaultValue={d.locations ?? ""} className={inputCls} /></L>
              <div className="grid grid-cols-2 gap-2"><L label="Idade mín."><input name="ageMin" type="number" defaultValue={d.ageMin ?? 18} className={inputCls} /></L><L label="Idade máx."><input name="ageMax" type="number" defaultValue={d.ageMax ?? 65} className={inputCls} /></L></div></>}
            {step === 6 && <>
              <L label="Posicionamentos"><select name="placements" defaultValue={d.placements ?? "automatic"} className={inputCls}><option value="automatic">Automáticos (recomendado)</option><option value="manual">Manuais</option></select></L>
              <L label="Lista de posicionamentos manuais"><input name="placementList" defaultValue={d.placementList ?? ""} placeholder="Feed do Instagram, Reels…" className={inputCls} /></L></>}
            {step === 7 && <>
              <L label="Criativo da biblioteca"><select name="creativeId" required defaultValue={d.creativeId ?? ""} className={inputCls}><option value="">Escolha…</option>{crs.filter((c) => c.status !== "archived").map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</select></L>
              <L label="Nome do anúncio"><input name="adName" defaultValue={d.adName ?? ""} className={inputCls} /></L>
              {crs.length === 0 && <p className="text-sm text-muted">Cadastre um criativo em <Link href="/app/criativos" className="text-brand underline">Criativos</Link>.</p>}</>}
            {step === 8 && <>
              <L label="URL de destino"><input name="destinationUrl" required defaultValue={d.destinationUrl ?? ""} placeholder="https://" className={inputCls} /></L>
              <div className="grid grid-cols-2 gap-2"><L label="utm_source"><input name="utmSource" defaultValue={d.utmSource ?? "meta"} className={inputCls} /></L><L label="utm_medium"><input name="utmMedium" defaultValue={d.utmMedium ?? "paid_social"} className={inputCls} /></L>
                <L label="utm_campaign"><input name="utmCampaign" defaultValue={d.utmCampaign ?? ""} className={inputCls} /></L><L label="utm_content"><input name="utmContent" defaultValue={d.utmContent ?? ""} className={inputCls} /></L></div>
              {utmUrl && <p className="break-all text-xs text-muted">URL final: {utmUrl}</p>}</>}
          </Form>
        )}
        {step > 1 && step < 10 && <p className="mt-3 text-sm"><Link className="text-brand hover:underline" href={`/app/rascunhos/${id}?etapa=${step - 1}`}>← Etapa anterior</Link></p>}
        {!write && <p className="mt-3 text-sm text-muted">Você tem acesso somente leitura.</p>}
        <p className="mt-3"><Badge tone="neutral">Status inicial: PAUSADA</Badge></p>
      </Card>
    </>
  );
}
