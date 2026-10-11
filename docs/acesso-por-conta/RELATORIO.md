# Acesso por conta de anúncios (por pessoa)

**Pergunta:** dá para liberar uma conta específica para cada pessoa? **Antes: não** (perfis valiam para a organização inteira). **Agora: sim.**

## Como funciona
- Em **Equipe**, o administrador define para cada membro: **todas as contas** (padrão) ou **somente as contas marcadas**. Ao adicionar alguém, pode marcar **Acesso restrito** (a pessoa começa sem ver nenhuma conta até você liberar).
- Vale para **Gestor** e **Analista**. **Administrador sempre vê tudo** (não pode ser restringido; ao promover, a restrição some).
- O que a pessoa restrita enxerga: só as contas liberadas e os **clientes ligados a elas**; painel, campanhas, detalhes, relatórios, **exportações (PDF/XLSX/CSV)**, operações, sincronizações, saúde da integração e o **MCP** (o token herda a restrição). Campanha/operação de outra conta responde "não encontrado" (404), não revela que existe.
- Ações de alcance da organização inteira ficam **negadas** a quem é restrito: cadastrar clientes, ver Atividades (auditoria), gerir equipe, modelos de relatório, conexão da Meta.
- Gestor restrito **pode** pausar/reativar/alterar orçamento e sincronizar **apenas** nas contas liberadas.
- **Seguro por padrão:** contas novas (descobertas depois) **não** são liberadas automaticamente a quem é restrito; lista vazia = não vê nada (nunca "tudo"). Faixa no topo: "Acesso restrito a N conta(s)". Mudanças ficam na auditoria (`member.access_change`).
- Implementação: o `Actor` carrega as contas permitidas e **todas** as consultas por conta aplicam o filtro no servidor (não só na tela). Migração `0005` (`memberships.access_scope`, `member_account_access`).

## Testes
Vitest 111/111 (11 novos: dados/telas, sincronização, relatórios e exportações, operações (ver/executar/cancelar/listar/reuso de clientRequestId), ações organizacionais negadas, lista vazia, conta nova, gestão por admin, limpeza ao promover/remover, MCP). E2E no navegador ✔ (admin libera só a Loja; Rafael vê só a Loja, 404 na campanha da Clínica, CSV sem a Clínica). Regressão das demais suítes ✔; axe ✔.

## Limitações
- Granularidade é a **conta de anúncios** (não campanha individual). Liberar por **cliente** (todas as contas dele) não existe ainda.
- Clientes sem conta liberada ficam ocultos ao restrito; ele não vê clientes "soltos" (sem conta).
- Modelos de relatório são da organização e só administradores/gestores sem restrição os gerenciam.
