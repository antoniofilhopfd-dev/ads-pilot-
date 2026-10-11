# Logo da empresa nos relatórios

**Status: concluído e testado** (em modo demonstração). A logo que aparece nos prints é uma **imagem de exemplo** ("Agência Horizonte"); a logo real da sua empresa é enviada por você em **Configurações → Logo da empresa**.

## Como usar
Configurações (administrador) → escolher o arquivo → **Enviar logo**. Vale para a organização inteira; trocar e remover também ficam ali.

## Onde aparece
- **PDF:** logo grande no topo da 1ª página e pequena no cabeçalho das demais; o rodapé segue com "AdsPilot · Página X de N".
- **XLSX:** na aba *Resumo*, acima do título.
- **Visualização no aplicativo:** no topo do relatório.
- **CSV:** não (é só dados).
- MCP (`get_report`) informa apenas `hasCompanyLogo`; os bytes da imagem **não** são enviados.

## Regras e segurança
- Aceita **PNG ou JPEG**, 64×64 a 4000×4000 px, até 1 MB. Valida pelo **conteúdo** (assinatura e cabeçalho), não pela extensão: SVG (pode conter script), GIF, WebP, HTML e arquivos disfarçados são recusados; PNG entrelaçado e JPEG CMYK são recusados com mensagem explicando; testa-se se o gerador de PDF consegue embutir a imagem antes de aceitar.
- Servida em `/api/logo` só para quem está logado, **sempre da organização ativa** (nunca de outra), com `nosniff`, `CSP: sandbox` e cache por ETag.
- Só administradores alteram (e quem tem acesso restrito a contas não altera); todos os membros veem a logo nos relatórios. Envio/remoção ficam na auditoria.
- **A verificação das exportações agora confere a logo:** PDF (imagem desenhada na 1ª página, via pdfjs) e XLSX (imagem na aba Resumo). Arquivo sem logo quando há logo cadastrada (ou o inverso) é **reprovado e não entregue**.
- Migração `0006` (`organization_logos`, `MEDIUMBLOB`).

## Testes
Vitest 119/119 (8 novos: validação por conteúdo, recusas, permissões, isolamento, logo em PDF/XLSX com PNG e JPEG, verificador reprova ausência/excesso, PDF de várias páginas). E2E no navegador ✔: envio, SVG e `.png` falso recusados, exibição, cabeçalhos, 304, PDF e XLSX **baixados** com a logo (conferido com `pdfimages` e leitura do XLSX), outra organização não vê, troca por JPEG, remoção. Demais suítes ✔, axe ✔.
Bugs achados no caminho: o CSP global sobrescrevia o da rota da logo (corrigido); um rodapé que deixou de levar a marca "AdsPilot" foi reprovado pelo próprio verificador.

## Limitações
- Não redimensiona/otimiza a imagem (sem biblioteca de imagem no servidor); use arquivo já no tamanho adequado (ex.: 600×200 px).
- Uma logo por **organização**. Logo por **cliente** (para agências que entregam relatório com a marca do cliente) não existe — posso adicionar.
- Não verificado em Excel/LibreOffice reais (apenas reabertura com ExcelJS) nem impresso em papel.
