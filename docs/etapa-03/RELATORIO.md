# Etapa 03/07 — Meta e dados reais (sem credenciais da Meta)

**Status: concluído e testado COM DADOS SIMULADOS. A integração com a Meta real NÃO foi validada** (não existe app/credencial; decisão do usuário: "a parte externa fica para depois").

## O que existe de fato
| Componente | Estado |
|---|---|
| Modelo de dados (conexões, contas, campanhas, conjuntos, anúncios, métricas diárias, execuções de sync) + migração `0001` | testado |
| Provedor **Demonstração** (dados simulados, sempre sinalizados na UI) | testado |
| Provedor **Graph API real** (somente leitura, v25.0, paginação, mapeamento de erros) | **escrito, testado só com respostas simuladas** no formato documentado; nunca falou com a Meta |
| OAuth (`/api/meta/oauth/start` e `/callback`, state anti-CSRF, token longo) | **escrito, NÃO testado** (sem app); UI informa "indisponível" sem `META_APP_ID/SECRET` |
| Criptografia do token (AES-256-GCM) | testado |
| Sincronização (trava de concorrência, retentativas 1s/2s, retomada, parcial/falha, idempotência) | testado |
| Fórmulas de métricas e agregação | testado |
| Painel, Campanhas (busca/ordenação/paginação/filtros), Detalhe, Integrações (saúde + histórico + metodologia) | testado (E2E com navegador) |
| `npm run sync` (para cron) | escrito; execução agendada não testada (hospedagem desconhecida) |

## Decisões de integridade dos dados
- Ausente ≠ zero (colunas nulas, "—" na tela). Totais somam só o informado.
- Razões recalculadas dos totais; alcance/frequência só em recorte de 1 dia (não somáveis).
- Resultado = ação do objetivo (vendas=compra, cadastros=lead, tráfego=link_click, engajamento=post_engagement); outros objetivos e ausência de ação → nulo.
- Comparação com o período anterior **só quando o período anterior foi sincronizado por inteiro** (evita variações falsas); aviso quando o período filtrado excede a cobertura.
- Contas com moedas diferentes não são somadas.
- Orçamento (configurado), gasto (informado pela Meta), previsão (estimativa AdsPilot), limite interno (indisponível) e limite na Meta (não consultado) aparecem separados.
- Conexão ativa ≠ dados atualizados (limite de 24 h, avaliado à parte).

## Testes executados (resultados reais)
| Teste | Resultado |
|---|---|
| Vitest (50): métricas, Graph API simulada, criptografia, sync, concorrência, retomada, retentativas, token expirado, parcial, isolamento entre organizações, permissões por perfil, cobertura | **50/50** |
| E2E Etapa 03 (Chromium, 15 verificações) | **OK** |
| E2E Etapa 02 (regressão) | **OK** |
| `tsc`, `next build`, `npm audit --omit=dev` | OK / OK / 0 vulnerabilidades |

Bugs achados pelos testes e corrigidos: painel não mostrava anúncios reprovados; comparação com período parcialmente sincronizado gerava variação enganosa; gasto menor aparecia em vermelho; datas do histórico em mês-dia.

## Limitações e riscos
1. **Nada foi validado contra a Meta real.** Campos, códigos de erro, `actions` por objetivo e OAuth podem divergir; exige conta de teste. Versão padrão v25.0 (a confirmar se já existe v26).
2. App Review / verificação de empresa da Meta continua sendo o caminho crítico para clientes reais.
3. Fuso horário: "hoje" é calculado em UTC; datas das métricas vêm no fuso da conta (diferença possível de 1 dia no corte).
4. Linhas que a Meta deixar de retornar após revisão não são apagadas (apenas sobrescritas as que voltam).
5. Sem agendamento automático até definirmos a hospedagem (há `npm run sync`).
6. Nível de campanha apenas (sem métricas por conjunto/anúncio); sem seleção de colunas; sem ROAS por falta de dados reais.
7. `ENCRYPTION_KEY` precisa ser guardada com backup; perdê-la invalida os tokens (exige reconectar).
8. Persistem pendências da Etapa 02 (SMTP, convites, LGPD, 2FA).

## Como validar
```bash
npm install && cp .env.example .env     # defina DATABASE_URL e ENCRYPTION_KEY
npm run db:migrate && npm test
npm run build && npm start
node --env-file=.env --import tsx scripts/e2e-meta.ts
```
Manual: Integrações → "Ativar modo demonstração" → acompanhar contas → Sincronizar → Painel/Campanhas.

## Próxima etapa proposta
Etapa 04/07 — Operações de campanha (escrita). **Recomendo não iniciar antes** de existir app Meta + conta de teste: escrever em campanhas sem validar a leitura real violaria o próprio plano. Alternativas: (a) pausar aqui até haver credenciais; (b) construir o fluxo preparar → confirmar → executar → verificar → auditar contra um provedor simulado, sem declarar operações reais.
