import Link from "next/link";

export const metadata = { title: "Política de Privacidade — AdsPilot" };

export default function Privacidade() {
  return (
    <main className="mx-auto max-w-2xl px-4 py-10 text-sm leading-relaxed">
      <p className="mb-4 rounded-md border border-warn/40 bg-[#fbf1dc] px-3 py-2 text-[#7a5200]"><strong>MINUTA — não é aconselhamento jurídico.</strong> Este texto é um rascunho técnico e precisa de revisão por profissional especializado em LGPD antes da publicação.</p>
      <h1 className="mb-4 text-xl font-semibold">Política de Privacidade (minuta)</h1>
      <h2 className="mt-4 font-semibold">Dados que tratamos</h2>
      <p>Nome, e-mail e senha (armazenada apenas como hash) dos usuários; dados de clientes cadastrados pela organização; dados de campanhas e métricas obtidos da Meta com a autorização da organização; registros de atividades (auditoria).</p>
      <h2 className="mt-4 font-semibold">Finalidade</h2>
      <p>Prestar o serviço de gestão, análise e relatórios de campanhas, garantir a segurança da conta e cumprir obrigações legais.</p>
      <h2 className="mt-4 font-semibold">Compartilhamento</h2>
      <p>Os dados da Meta são obtidos pela API oficial. Não vendemos dados. Prestadores de hospedagem e e-mail poderão processar dados em nosso nome (a definir).</p>
      <h2 className="mt-4 font-semibold">Seus direitos</h2>
      <p>Em <Link className="underline" href="/app/conta">Minha conta</Link> você pode baixar seus dados e excluir sua conta. Outras solicitações: canal de contato do encarregado (a definir).</p>
      <h2 className="mt-4 font-semibold">Retenção</h2>
      <p>Dados da conta são mantidos enquanto ela existir. O histórico de auditoria é mantido de forma anonimizada após a exclusão. Prazos finais a definir.</p>
    </main>
  );
}
