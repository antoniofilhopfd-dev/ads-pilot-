export type ChecklistTemplate = { key: string; title: string; target: "campaign" | "draft" | "account" | "client"; items: { id: string; text: string }[] };

export const CHECKLISTS: ChecklistTemplate[] = [
  { key: "pre_publicacao", title: "Antes de publicar", target: "draft", items: [
    { id: "obj", text: "Objetivo da campanha confere com a meta do cliente" },
    { id: "pixel", text: "Pixel/evento de conversão verificado (disparando na página de destino)" },
    { id: "url", text: "URL de destino abre, é https e tem UTMs" },
    { id: "pub", text: "Público revisado (localização, idade, exclusões)" },
    { id: "orc", text: "Orçamento e datas conferidos com o planejado" },
    { id: "cri", text: "Criativos revisados (texto, CTA, formato por posicionamento)" },
    { id: "pol", text: "Políticas de anúncios da Meta revisadas (categoria especial, claims)" },
    { id: "pau", text: "Nova campanha criada PAUSADA e ativada só após esta revisão" } ] },
  { key: "pos_publicacao", title: "Após publicar (48 h)", target: "campaign", items: [
    { id: "apr", text: "Anúncios aprovados (sem reprovação/limitação)" },
    { id: "ent", text: "Entrega iniciou (impressões > 0)" },
    { id: "ev", text: "Eventos de conversão chegando" },
    { id: "gasto", text: "Gasto diário dentro do esperado" } ] },
  { key: "semanal", title: "Revisão semanal da conta", target: "account", items: [
    { id: "ritmo", text: "Ritmo de orçamento do mês revisado" },
    { id: "metas", text: "Metas revisadas (atingidas / não atingidas)" },
    { id: "freq", text: "Frequência e fadiga de criativos verificadas" },
    { id: "sync", text: "Sincronização com a Meta saudável" },
    { id: "rel", text: "Relatório do cliente preparado" } ] },
];
export const checklistByKey = (k: string) => CHECKLISTS.find((c) => c.key === k);
