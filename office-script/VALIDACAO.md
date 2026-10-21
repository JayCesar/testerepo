# Validação do Excel no Power Automate (campos vazios + fábrica em sigla)

## Instalar o script (5 min)
Excel Online → **Automatizar** → **Novo script** → cole `validacao.ts` inteiro → salve como **Validacao** → **Executar** para testar.
Aparece a aba **Validacao** com os erros, e as células problemáticas ficam coloridas:
vermelho = campo vazio · amarelo = fábrica em sigla.

Opcional: crie uma aba **DeParaFabricas** com as colunas `sigla | nome_completo`
(ex.: `FAB-SP | Fábrica São Paulo`). O script passa a sugerir o nome completo.

## Fluxo

1. Gatilho: manual (demo) ou "Quando um arquivo é criado (SharePoint/OneDrive)".
2. **Excel Online (Business) → Executar script**
   - Script: `Validacao`
   - nomeAba: `Pedidos` (ou vazio = primeira aba)
   - colunaFabrica: `fabrica` (nome do cabeçalho; ignora maiúscula e acento)
   - colunasObrigatorias: vazio = todas, ou ex. `pedido_id,fabrica,quantidade`
3. **Condição:** `outputs('Executar_script')?['body/result/ok']` é igual a `true`
   - **Sim** → segue para o processamento (conciliação / gravação no SQL).
   - **Não** → **Teams/Outlook** avisando quem enviou:
     `Encontramos @{outputs('Executar_script')?['body/result/camposVazios']} campos vazios e
     @{outputs('Executar_script')?['body/result/fabricasEmSigla']} fábricas em sigla. Veja a aba Validacao.`
     e **Encerrar** (status Falha), para não gravar dado ruim no banco.

## Regra de sigla
É sigla quando o valor **não tem espaço e não tem letra minúscula** (`SP`, `FAB-SP`, `CD01`)
ou é uma palavra única de até 4 letras (`Rj`). Nome completo tem espaço ou letras minúsculas
(`Fábrica São Paulo`). Ajuste em `pareceSigla()` se o negócio tiver outro padrão.

Considera vazio: célula em branco, `null`, `N/A`, `NA`, `-`. Linhas totalmente em branco são ignoradas.
