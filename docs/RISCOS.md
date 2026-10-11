# Registro de riscos

| # | Risco | Impacto | Prob. | Mitigação / estado |
|---|---|---|---|---|
| 1 | Integração Meta real nunca validada (campos, erros, OAuth, versão da API) | Alto | Alta | Provedor real escrito e testado só com respostas simuladas. **Validar com conta de teste antes de qualquer cliente.** |
| 2 | App Review / verificação da Meta demora semanas | Alto | Alta | Iniciar já (caminho crítico). Sem ele só admins/testadores do app conectam. |
| 3 | Hospedagem Hostinger incompatível (Node persistente, cron, MySQL, RAM p/ PDF/XLSX) | Alto | Média | Não verificada. PDF sem Chromium reduz risco. VPS é a alternativa (custo a aprovar). |
| 4 | Sem SMTP: recuperação de senha/convites inoperantes em produção | Alto | Certa | Escolher provedor (custo) — **bloqueio de lançamento**. |
| 5 | Perda da `ENCRYPTION_KEY` | Alto | Baixa | Backup em cofre separado; reconexão como plano B. |
| 6 | Escrita em campanhas reais com efeitos não previstos (gasto, aprendizado) | Alto | Média | Hoje bloqueada. Quando habilitar: conta de teste, limites, confirmação, verificação. |
| 7 | Prompt injection / abuso de assistente via MCP | Médio | Média | Código humano p/ escrita; texto de terceiros como dado; escopos; auditoria. |
| 8 | Números diferentes do Gerenciador (atribuição, revisões, fuso) | Médio | Alta | Metodologia visível; avisos; sincroniza janela móvel; validar com dados reais. |
| 9 | Fuso: "hoje" em UTC vs. fuso da conta | Baixo | Média | Documentado; ajustar por fuso da conta (pendente). |
| 10 | LGPD: minutas não revisadas; retenção/encarregado indefinidos | Médio | Alta | Revisão jurídica antes de lançar. |
| 11 | Limitadores em memória / instância única | Baixo | Média | Migrar para banco/Redis se escalar. |
| 12 | Sem monitoramento externo/alertas de falha | Médio | Média | `/api/health` + histórico de sync; avaliar Sentry/uptime após publicar. |
| 13 | Acessibilidade só validada por ferramenta automática | Médio | Média | Teste manual com leitor de tela pendente. |
| 14 | Desempenho medido só localmente | Médio | Média | Repetir benchmark (`npm run bench`) no servidor real. |
