# Credenciais e integrações externas — o que falta e como obter

Nada abaixo foi validado com serviços reais: faltam as credenciais. O código está pronto e testado contra **servidores/respostas simuladas**; a validação real é a Etapa 06.

## 1. Meta (Marketing API)
1. Criar um app em <https://developers.facebook.com> (tipo *Business*). Anotar **App ID** e **App Secret** → `META_APP_ID`, `META_APP_SECRET`.
2. Adicionar o produto **Facebook Login for Business** e a **Marketing API**.
3. URI de redirecionamento OAuth válida: `{APP_URL}/api/meta/oauth/callback` (HTTPS em produção).
4. Permissão necessária hoje: `ads_read` (leitura). `ads_management` só será pedida quando a escrita real for habilitada (Etapa 06).
5. Em modo desenvolvimento só funcionam contas de quem é admin/testador do app. Para clientes de terceiros é preciso **App Review** e **verificação da empresa** na Meta (dias a semanas — comece cedo).
6. Conta de teste: usar uma conta de anúncios de teste/sandbox para validar sync e escrita antes de tocar em contas reais.
7. Token: o OAuth devolve token de longa duração (~60 dias). O AdsPilot renova automaticamente os que vencem em até 10 dias (job do cron). Se a Meta recusar (erro 190), a conexão passa a "reconexão necessária" e o painel avisa.

Implementado e testado só com simulação: troca de token, renovação, leitura de campanhas/conjuntos/anúncios/insights, pixels, eventos do pixel, busca de segmentação, públicos personalizados, limite de taxa (cabeçalhos `X-App-Usage` / `X-Business-Use-Case-Usage`), paginação e retentativas.

## 2. WhatsApp (Evolution API)
1. Ter uma instância Evolution API própria, com HTTPS, e uma instância conectada ao WhatsApp (QR code).
2. Definir `EVOLUTION_API_URL`, `EVOLUTION_API_KEY`, `EVOLUTION_INSTANCE`.
3. Cadastrar destinatários em **Canais de aviso** (DDI+DDD+número).
4. Riscos: números de WhatsApp não oficiais podem ser banidos; use poucos avisos (apenas críticos) e destinatários que concordaram em recebê-los. A API oficial (WhatsApp Business Platform) é a alternativa com custo.
5. Garantias do código: chave de idempotência (mesmo alerta/destinatário/dia = 1 mensagem), reserva atômica antes do envio, espera crescente em falhas temporárias, e estado **incerta** quando a resposta se perde (nunca reenvia sozinho).

## 3. E-mail (SMTP)
Não implementado. Necessário para recuperação de senha e convites. Precisa de servidor SMTP (host, porta, usuário, senha, remetente verificado com SPF/DKIM).

## 4. LLM (explicações por IA)
Não implementado: o diagnóstico é por regras. Para ativar seria necessário uma chave de API e revisão de privacidade (dados de campanhas seriam enviados ao provedor).

## 5. Hospedagem
Ver `docs/DEPLOY.md`. Requisitos: Node 22+, MySQL/MariaDB 10.11+, cron chamando `POST /api/cron/sync` com `x-cron-secret`, HTTPS, backups (`scripts/backup.sh`).

## Quadro de situação
| Item | Código | Validado com serviço real |
|---|---|---|
| Meta leitura (sync/insights) | ✔ | ✘ (sem app) |
| Meta OAuth + renovação de token | ✔ | ✘ |
| Meta escrita (pausar/orçamento) | ✔ só demo | ✘ (bloqueada) |
| Envio de rascunho à Meta | ✘ bloqueado por design | ✘ |
| WhatsApp/Evolution | ✔ | ✘ |
| SMTP | ✘ | ✘ |
| LLM | ✘ | ✘ |
