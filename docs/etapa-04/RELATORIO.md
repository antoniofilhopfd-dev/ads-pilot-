# Etapa 04/07 — Operações de campanha

**Status: concluído e testado EM AMBIENTE SIMULADO. Nenhuma operação foi executada na Meta real — a escrita na Meta real está explicitamente bloqueada** (exige `ads_management` e validação com conta de teste).

## Implementado
- Operações: **pausar**, **reativar**, **alterar orçamento diário** de campanha.
- Fluxo: ler estado remoto atual → validar → **preparar** (mostra atual × novo, avisos) → **confirmar** (ação explícita, autor ou admin, permissão `campaigns.write`, mesma organização) → revalidar o estado (aborta se mudou) → **executar uma única vez** (transição atômica) → **verificar lendo o remoto** → auditar (antes/depois, resultado, erro) → informar o resultado real.
- Idempotência: ID da operação; confirmar de novo devolve o resultado guardado; duas confirmações simultâneas = 1 escrita.
- Resultado incerto nunca é "concluído": estado **ambíguo** + botão "Verificar estado" (só lê, nunca repete a escrita). Erro de chamada com efeito comprovado vira sucesso apenas após leitura do remoto.
- Validações: orçamento entre 1 e 1.000.000, 2 casas, diferente do atual; campanha sem orçamento diário não aceita; aumento > 50% exige confirmação reforçada; confirmação expira em 15 min.
- UI: bloco "Ações" na campanha (só em modo demonstração), tela de confirmação, tela de resultado, histórico em `/app/operacoes`, eventos na auditoria. Para Meta real, mostra aviso de "não habilitado" em vez de botões.
- "Estado remoto" simulado em tabela própria (`demo_remote_state`), de modo que a verificação lê algo que realmente mudou.
- Migração `0002`: `demo_remote_state`, `operations`.

## Testes
Vitest 69/69 (15 novos: pausa/reativação, orçamento, idempotência, concorrência, deriva de estado, erro ambíguo, falha comprovada, sucesso aparente sem efeito, verificação indisponível, expiração, cancelamento, papéis, isolamento entre organizações, Meta real bloqueada). E2E de operações (navegador) ✔; regressão E2E Etapas 02/02b/03 ✔; axe ✔ (16 telas); `npm audit` 0.

## Limitações
- **Comportamento real da Meta não validado**: latência de propagação, códigos de erro, regras de aprendizado e permissões podem diferir do simulador.
- Só campanha (não conjunto/anúncio); não há criação de campanhas/anúncios nem edição de criativos.
- Orçamento diário só quando a campanha o define; campanhas com orçamento no conjunto ou total não são editáveis.
- "Limite interno do AdsPilot" ainda não existe; alerta interno nunca bloqueia gasto na Meta.
- Insights simulados não reagem a pausas.
