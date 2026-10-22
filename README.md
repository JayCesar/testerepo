# Fluxo Power Automate — recepção e validação de Excel por e-mail

Interface do Power Automate em **inglês**. Se o seu estiver em português, os nomes equivalentes estão entre parênteses.

## Visão geral

1. **E-mail chega:** o fluxo dispara pelo assunto e só segue se tiver anexo `.xlsx`.
2. **Idempotência:** se esse e-mail/anexo já foi processado, para.
3. **Salvar:** guarda no SharePoint com data e hora no nome (evidência, sem sobrescrever).
4. **Estrutura:** confere se a aba e as colunas esperadas existem.
5. **Conteúdo:** procura campos vazios e fábrica em sigla (Office Script).
6. **Se inválido:** responde ao remetente com os erros e o arquivo marcado, avisa o time e para.
7. **Se válido:** confirma ao remetente e salva em `/Validados`.
8. **Processamento:** a chegada em `/Validados` dispara o próximo passo (planilha mestre, aplicação local).
9. **Falha do fluxo:** se algo quebrar, avisa o responsável.

```
E-mail ─► filtro .xlsx ─► já processado? ─sim─► fim
                               │não
                               ▼
                 registra na lista ArquivosRecebidos
                               ▼
            Create file  (yyyyMMdd-HHmmss_nome.xlsx)
                               ▼
                 Run script "ValidarArquivoFabrica"
                    ┌──────────┴──────────┐
               valido=false          valido=true
                    ▼                     ▼
   resposta c/ tabela de erros     confirma ao remetente
   + arquivo marcado + aviso time  + arquivo em /Validados
   + Status=Inválido               + Status=Válido
```

---

## 0. Pré-requisitos

- **Office Script** `ValidarArquivoFabrica` com o conteúdo de [`office-script/validacao.ts`](office-script/validacao.ts)
  (Excel Online → Automate → New script → colar → salvar). Salve com a **mesma conta** que monta o fluxo.
- **Lista do SharePoint `ArquivosRecebidos`** (histórico + idempotência):

| Coluna | Tipo |
|---|---|
| Title (a chave) | Single line of text |
| Remetente | Single line of text |
| NomeArquivo | Single line of text |
| Status | Choice: Recebido, Inválido, Válido, Processado, Erro |
| Mensagem | Multiple lines of text |
| RecebidoEm | Date and time |

- Pastas na biblioteca: `/Recebidos` e `/Validados`.

---

## 1. Gatilho

**Office 365 Outlook → When a new email arrives (V3)** (Quando um novo email chegar)
- Subject Filter: o assunto combinado
- Include Attachments: **Yes**
- Only with Attachments: **Yes**

## 2. Loop nos anexos, só `.xlsx`

**Apply to each** (Aplicar a cada) → Attachments

Dentro dele, **Condition**:
```
endsWith(toLower(items('Apply_to_each')?['name']), '.xlsx')   is equal to   true
```
Todo o resto vai no ramo **True**. Isso ignora a imagem da assinatura, PDFs etc.

> Se o loop tiver outro nome (ex. `Apply_to_each_2`, `Aplicar_a_cada`), troque nas expressões, com `_` no lugar de espaço.
> Ou use o conteúdo dinâmico **Attachments Name**.

## 3. Idempotência

Data/hora no nome **não** garante idempotência (só evita sobrescrever).
A chave estável é o **ID do e-mail + nome do anexo** — mesma lógica de dedupe por message id num consumidor de fila.

**a. Compose** (Compor) → Inputs → Expression:
```
concat(triggerOutputs()?['body/internetMessageId'], '|', items('Apply_to_each')?['name'])
```
> Se vier vazio, use o conteúdo dinâmico **Message Id** do gatilho.

**b. SharePoint → Get items** (Obter itens) → lista `ArquivosRecebidos` → **Filter Query**:
```
Title eq '@{replace(outputs('Compose'), '''', '''''')}'
```
(o `replace` protege contra apóstrofo na chave)

**c. Condition:**
```
length(body('Get_items')?['value'])   is equal to   0
```
- **False** → já processado → não faz nada.
- **True** → segue:

**d. SharePoint → Create item** (Criar item) em `ArquivosRecebidos`:
- Title: saída do **Compose**
- Remetente: **From** do gatilho
- NomeArquivo: **Attachments Name**
- Status: `Recebido`
- RecebidoEm: `utcNow()`

| Situação | Resultado |
|---|---|
| Fluxo roda 2x pro mesmo e-mail | 2ª execução ignorada |
| Remetente reenvia corrigido em e-mail novo | ID novo → processa normal |
| Dois arquivos com mesmo nome | Não colidem (data/hora no nome) |

## 4. Salvar com data e hora

**SharePoint → Create file** (Criar arquivo)
- Site Address: o site
- Folder Path: `/Shared Documents/Recebidos`
- File Name → Expression:
```
concat(formatDateTime(convertFromUtc(utcNow(), 'E. South America Standard Time'), 'yyyyMMdd-HHmmss'), '_', items('Apply_to_each')?['name'])
```
- File Content: **Attachments Content**

Resultado: `20261022-073015_pedidos.xlsx` (horário de Brasília; sem `convertFromUtc` sai em UTC).

## 5. Validar

**Excel Online (Business) → Run script** (Executar script)
- Location / Document Library: o site e a biblioteca
- File: o arquivo criado no passo 4 (conteúdo dinâmico **Path** / **Id** do Create file)
- Script: `ValidarArquivoFabrica`
- nomeAba: aba dos dados (vazio = primeira aba)
- colunaFabrica: cabeçalho da coluna de fábrica (ignora maiúscula/acento)
- colunasObrigatorias: vazio = todas, ou `col1,col2,...`

Retorno do script:
```json
{ "valido": false, "mensagem": "...", "camposVazios": 3, "fabricasEmSigla": 2,
  "erros": [ { "linha": 3, "coluna": "Fábrica", "valor": "FAB-SP", "problema": "FABRICA_EM_SIGLA", "sugestao": "..." } ] }
```

> Se a aba ou coluna esperada não existir, o script falha → cai no tratamento de erro (passo 8).

**Condition:**
```
outputs('Run_script')?['body/result/valido']   is equal to   true
```

## 6. Ramo inválido (False)

1. **Data Operation → Create HTML table** (Criar tabela HTML)
   From → Expression: `outputs('Run_script')?['body/result/erros']`
2. **SharePoint → Get file content** (Obter conteúdo do arquivo) → o arquivo do passo 4
   (já vem com as células coloridas pelo script: vermelho = vazio, amarelo = sigla)
3. **Office 365 Outlook → Reply to email (V3)** (Responder a um email)
   - Message Id: do gatilho
   - Body (HTML): `mensagem` + saída do **Create HTML table** + "Corrija e responda este e-mail com o arquivo novo."
   - Attachments: nome + conteúdo do passo 2
4. **Send an email (V2)** pro time responsável: resumo + link do arquivo.
5. **SharePoint → Update item** em `ArquivosRecebidos`: Status = `Inválido`, Mensagem = `mensagem`.

Responder no mesmo e-mail mantém a conversa; quando o remetente responde com o arquivo corrigido,
o fluxo roda de novo (novo message id).

## 7. Ramo válido (True)

1. **SharePoint → Copy file** (ou Move file) para `/Validados`.
2. **Reply to email (V3)**: "Arquivo recebido e validado."
3. **Update item** em `ArquivosRecebidos`: Status = `Válido`.

O próximo fluxo dispara em **When a file is created in a folder** → `/Validados`
(filtre a pasta exata para não gerar loop ao mover para `/Processados`).

## 8. Tratamento de erro (try/catch)

- Coloque os passos 3–7 dentro de um **Scope** chamado `Try`.
- Adicione outro **Scope** `Catch` depois → **…** → **Configure run after** → marque **has failed** e **has timed out**.
- Dentro do `Catch`: **Send an email (V2)** pra você + **Update item** Status = `Erro`.

## 9. Configuração (sem valor fixo)

No início do fluxo, **Initialize variable** para: e-mails do time, nome do site, pastas.
Mudou destinatário → muda num lugar só.

---

## Problemas comuns

| Sintoma | Causa | Solução |
|---|---|---|
| Script não aparece no Run script | Salvo por outra conta ou arquivo não é `.xlsx` | Salvar com a mesma conta do fluxo |
| Erro de arquivo bloqueado | Planilha aberta no Excel | Fechar e rodar de novo |
| Expressão inválida | Nome da ação diferente (`Apply_to_each_2`, `Run_script_2`) | Ajustar o nome na expressão |
| Tabela aparece como código no e-mail | Corpo não está em HTML | Usar o editor de código `</>` ou `Is HTML = Yes` |
| Horário 3h adiantado | Faltou `convertFromUtc` | Usar a expressão do passo 4 |
