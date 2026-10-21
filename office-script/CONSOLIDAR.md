# Jogar o arquivo validado na planilha mestre (consolidação)

Dois scripts, porque um Office Script só enxerga a própria planilha:

| Script | Onde salvar/rodar | O que faz |
|---|---|---|
| `exportar.ts` → **ExportarDados** | arquivo recebido | devolve os dados em JSON |
| `importar.ts` → **ImportarDados** | planilha mestre | acrescenta as linhas no fim da aba |

O ImportarDados:
- cria a aba se não existir (cabeçalho do arquivo + `arquivo_origem` + `importado_em`);
- alinha colunas **pelo nome** (ordem diferente não quebra; coluna a mais é ignorada e avisada);
- **não importa o mesmo arquivo duas vezes** (checa `arquivo_origem`).

## No fluxo (ramo "Se sim" da validação)

1. **Excel Online → Executar script** — arquivo: o recebido · script: `ExportarDados` · nomeAba: aba dos dados
2. **Excel Online → Executar script** — arquivo: a planilha mestre · script: `ImportarDados`
   - dadosJson: `outputs('Executar_script_2')?['body/result']` (o resultado do passo 1; use o conteúdo dinâmico "result")
   - nomeAbaDestino: ex. `Consolidado`
   - arquivoOrigem: o **nome do arquivo** salvo no SharePoint (conteúdo dinâmico do "Criar arquivo")
3. E-mail de confirmação ao remetente usando `mensagem` do ImportarDados.

Dica: a planilha mestre deve ficar **fechada** durante o teste do fluxo (arquivo aberto pode dar erro de bloqueio).
