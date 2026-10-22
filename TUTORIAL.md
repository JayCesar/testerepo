# Tutorial completo — Fluxo de recepção de Excel por e-mail, com idempotência

Este tutorial parte do zero: considera que você nunca usou o Power Automate.
Ao final você terá um fluxo que:

1. Recebe e-mails com um assunto específico e anexo `.xlsx`.
2. **Valida o arquivo antes de guardar qualquer coisa** (colunas obrigatórias, campos vazios, QTDE NF = QTDE FÍSICA) e corrige nomes de empresa abreviados pelo de-para.
3. **Se o arquivo estiver errado:** responde ao remetente com os erros e o arquivo marcado, avisa o time e **não guarda nada** (nem arquivo, nem registro).
4. **Se o arquivo estiver certo:** confere se não é repetido; se não for, guarda o arquivo em `Validados`, **registra na lista** e confirma ao remetente.
5. **Não processa duas vezes o mesmo e-mail nem o mesmo arquivo** (idempotência).
6. Se algo quebrar no fluxo: avisa você.

A interface do Power Automate considerada aqui está em **inglês**. Os nomes em português aparecem entre parênteses quando ajudam.

---

## Sumário

- [Parte 0 — Conceitos básicos do Power Automate](#parte-0--conceitos-básicos-do-power-automate)
- [Parte 1 — O desenho do fluxo e por que existe uma pasta temporária](#parte-1--o-desenho-do-fluxo-e-por-que-existe-uma-pasta-temporária)
- [Parte 2 — O que é idempotência e como ela funciona aqui](#parte-2--o-que-é-idempotência-e-como-ela-funciona-aqui)
- [Parte 3 — Preparar o SharePoint (pastas e lista)](#parte-3--preparar-o-sharepoint-pastas-e-lista)
- [Parte 4 — Preparar o Office Script](#parte-4--preparar-o-office-script)
- [Parte 5 — Montar o fluxo, etapa por etapa](#parte-5--montar-o-fluxo-etapa-por-etapa)
- [Parte 6 — Testar tudo](#parte-6--testar-tudo)
- [Parte 7 — Problemas comuns](#parte-7--problemas-comuns)
- [Apêndice — Todas as expressões num lugar só](#apêndice--todas-as-expressões-num-lugar-só)

---

# Parte 0 — Conceitos básicos do Power Automate

Leia esta parte antes de começar. Ela evita a maioria dos erros.

## 0.1 Vocabulário

| Termo | O que é | Exemplo neste fluxo |
|---|---|---|
| **Flow** (fluxo) | A automação inteira | "Recepção de arquivos folheteria" |
| **Trigger** (gatilho) | O evento que faz o fluxo começar. Todo fluxo tem exatamente um | "Quando chegar um e-mail" |
| **Action** (ação) | Cada passo depois do gatilho | "Criar arquivo no SharePoint" |
| **Dynamic content** (conteúdo dinâmico) | Valores que vieram de passos anteriores e que você clica para inserir | "Attachments Name" (nome do anexo) |
| **Expression** (expressão) | Uma fórmula, parecida com fórmula de Excel, para calcular valores | `concat('a', 'b')` |
| **Condition** (condição) | Um "se". Divide o fluxo em dois ramos: **True** (sim) e **False** (não) | "O arquivo é válido?" |
| **Apply to each / For each** (aplicar a cada) | Um "loop". Repete as ações para cada item de uma lista | Para cada anexo do e-mail |
| **Run history** (histórico de execuções) | Todas as vezes que o fluxo rodou, com o que aconteceu em cada passo | Onde você investiga erros |

## 0.2 Onde fica cada coisa

- Site: **https://make.powerautomate.com**
- Menu à esquerda → **My flows** (Meus fluxos): lista seus fluxos.
- Ao abrir um fluxo: **Edit** (Editar) abre o editor, chamado de **designer**.

Existem dois designers: o **novo** (painel lateral à direita) e o **clássico** (caixas empilhadas que abrem para baixo).
Há um botão no canto superior direito para alternar (**New designer**).
Os passos deste tutorial funcionam nos dois; quando algo muda, está indicado.

## 0.3 Como fazer as operações básicas

**Adicionar uma ação depois de outra**
- Novo designer: passe o mouse na linha entre duas caixas → **+** → **Add an action** → digite o nome na busca → clique.
- Clássico: abaixo da última caixa, **+ New step**; entre duas caixas, passe o mouse na seta → **+** → **Add an action**.

**Adicionar uma ação dentro de um ramo (True/False) ou de um loop**
- Clique no **+** que aparece *dentro* da caixa do ramo ou do loop.

**Renomear uma ação** (muito importante: as expressões usam o nome)
- Novo designer: clique na ação → no painel da direita, clique no título e digite o novo nome.
- Clássico: **três pontinhos (…)** da caixa → **Rename**.

> **Regra de ouro dos nomes:** nas expressões, o nome da ação aparece com **`_` no lugar de cada espaço**.
> Uma ação chamada `Chave email` é referida como `outputs('Chave_email')`.
> Use os nomes **exatamente** como neste tutorial, **sem acentos**, e as expressões funcionam de primeira.

**Inserir conteúdo dinâmico**
- Clique dentro do campo → ícone de **raio ⚡** (novo designer) ou painel **Dynamic content** (clássico) → escolha o valor.

**Inserir uma expressão**
- Clique dentro do campo → ícone **fx** (novo designer) ou aba **Expression** (clássico) → cole → **Add** / **OK**.
- A expressão aparece como uma "etiqueta" colorida dentro do campo.
- **Não** cole a expressão como texto comum: ela precisa entrar pelo **fx** / **Expression**.

**Mover uma ação**
- Arraste a caixa pelo título. Se falhar: **…** → **Copy to my clipboard** (ou **Copy action**) → no destino **+** → **Paste an action** / aba **My clipboard** → apague a original (**…** → **Delete**).

**Salvar**: botão **Save** no topo. Salve com frequência.

**Ver o que aconteceu numa execução**: **My flows** → clique no fluxo → em **28-day run history**, clique numa execução → cada caixa aparece com ✅ (deu certo), ❌ (erro) ou ⊘ (não executou). Clique numa caixa para ver **Inputs** (o que entrou) e **Outputs** (o que saiu).

---

# Parte 1 — O desenho do fluxo e por que existe uma pasta temporária

## 1.1 A regra do negócio

> **Só guarda o que está certo.**
> Arquivo errado volta para o remetente e **não fica salvo em lugar nenhum** e **não é registrado na lista**.

## 1.2 Por que precisa de uma pasta temporária

A validação é feita por um **Office Script**, que roda **dentro do Excel**. E o Excel só consegue abrir um arquivo que esteja **no SharePoint ou no OneDrive**.
Não existe forma de rodar o script direto no anexo do e-mail.

Então o fluxo faz assim:

1. Salva o anexo numa pasta **Temp** — só para conseguir rodar o script.
2. Roda o script (que também corrige nomes de empresa abreviados, quando o arquivo está certo).
3. **Se estiver errado:** pega o arquivo marcado (com as células coloridas), devolve ao remetente e **apaga** o arquivo da Temp.
4. **Se estiver certo:** **move** o arquivo da Temp para `Validados` e registra na lista.

O arquivo fica na Temp só por alguns segundos. **Nada errado fica guardado.**

## 1.3 O desenho

```
E-mail chega (assunto + anexo .xlsx)
      │
Esse e-mail já foi aceito antes? ──sim──► para (nada acontece)
      │não
Salva na pasta Temp
      │
Roda o script de validação
      │
 ┌────┴──────────────┐
ERRADO              CERTO
 │                    │
 responde com erros   Esse conteúdo já foi aceito antes? ──sim──► responde "já recebido"
 + arquivo marcado          │não                                     + apaga da Temp
 avisa o time               │
 APAGA da Temp        move Temp → Validados
 (não registra)       REGISTRA na lista
                      responde "validado"
```

---

# Parte 2 — O que é idempotência e como ela funciona aqui

## 2.1 A definição

**Idempotência** = processar a mesma coisa duas vezes tem **o mesmo efeito** que processar uma vez.

Um botão de elevador é idempotente: apertar o 5º andar dez vezes não faz o elevador ir dez vezes ao 5º andar.
Um fluxo **sem** idempotência é como uma máquina de café: cada aperto faz um café novo.

## 2.2 Por que a mesma coisa pode chegar duas vezes

Mesmo sem ninguém errar:

- O Power Automate **repete automaticamente** uma execução que falhou por instabilidade.
- Alguém clica em **Resubmit** numa execução antiga para testar.
- O gatilho, em situações raras, **dispara duas vezes** para o mesmo e-mail.

E também:

- O remetente **reenvia o mesmo arquivo** num e-mail novo ("achei que não tinha chegado").

## 2.3 O estrago sem idempotência

A Gráfica Alfa manda `pedidos.xlsx` com 3 pedidos (35.000 folhetos). Na terça, reenvia o mesmo arquivo.
Sem idempotência, o arquivo vai de novo para `Validados` e o próximo sistema grava os 3 pedidos de novo:

| pedido | quantidade |
|---|---|
| P001 | 10.000 |
| P002 | 20.000 |
| P003 | 5.000 |
| **P001** | **10.000** ❌ |
| **P002** | **20.000** ❌ |
| **P003** | **5.000** ❌ |

O sistema passa a achar que foram 70.000 folhetos. Custo, provisão e conciliação ficam errados, e ninguém percebe até o fechamento.

## 2.4 A solução: uma "chave" e um "caderno"

Antes de seguir, o fluxo pergunta **"já aceitei isto?"**

- Para perguntar, ele precisa de uma **chave**: algo que identifica a coisa de forma única.
- Para lembrar, ele precisa de um **caderno**: a lista do SharePoint **ArquivosRecebidos**.

Como **só arquivos certos são registrados**, o caderno guarda exatamente "o que já foi aceito".

## 2.5 As duas chaves (duas camadas)

| Camada | Chave | Pega o quê | Quando é checada |
|---|---|---|---|
| **1 — por e-mail** | ID único do e-mail + nome do anexo | O **mesmo e-mail** processado de novo (retry, resubmit, gatilho duplo) | **Antes** de salvar qualquer coisa |
| **2 — por conteúdo** | **Hash** do conteúdo da planilha | O **mesmo arquivo** reenviado em **outro e-mail** | Depois da validação, só se o arquivo estiver certo |

**ID do e-mail:** todo e-mail tem um identificador único (*Internet Message ID*), parecido com `<CAF123abc@mail.empresa.com>`. Nunca muda e nunca se repete.

**Hash:** uma "impressão digital" do conteúdo, como `655ffdc1c7df29fd525e9d92b1`, calculada pelo script a partir de todos os valores da planilha.
- Mesmo conteúdo → **mesmo** hash (mesmo com outro nome de arquivo, outro e-mail, outras cores).
- Mudou **um único valor** → hash totalmente diferente.

**Por que não usar só o nome do arquivo?** Fornecedores diferentes mandam arquivos com o mesmo nome (`pedidos.xlsx`); o segundo seria bloqueado por engano.

**Por que não usar data e hora?** Muda a cada execução, nunca detecta repetição. (A data e hora no nome do arquivo serve para **não sobrescrever** arquivos, não para idempotência.)

## 2.6 O que acontece em cada situação

| Situação | O que o fluxo faz | Guarda algo? |
|---|---|---|
| Arquivo certo, primeira vez | Valida → move para Validados → registra → responde "validado" | Sim |
| Mesmo e-mail **aceito** processado de novo (retry, resubmit) | Camada 1 encontra a chave → **para logo no início** | Não |
| Mesmo arquivo **certo** reenviado em e-mail novo | Valida → camada 2 encontra o hash → responde "já recebido em DD/MM" → apaga da Temp | Não |
| Arquivo **errado** | Valida → responde com erros → apaga da Temp | Não |
| Mesmo e-mail **errado** processado de novo (resubmit) | Valida de novo → responde os erros de novo → apaga da Temp | Não |
| Arquivo **corrigido** enviado como resposta | Conteúdo novo → processa normalmente | Sim |

> **Por que um e-mail errado pode ser respondido duas vezes num resubmit?** Porque, pela regra do negócio, arquivo errado **não é registrado** — então o fluxo não tem como "lembrar" que já respondeu. O efeito é só uma resposta repetida, sem nenhum dado errado guardado. É a troca consciente por não armazenar nada errado.

> **Terceira camada (fora deste fluxo):** se um arquivo novo trouxer *algumas* linhas repetidas de um anterior, as camadas 1 e 2 não percebem. Isso se resolve ao gravar na base, usando a **chave de negócio** do registro (ex.: número do pedido): se já existe, atualiza; senão, insere.

---

# Parte 3 — Preparar o SharePoint (pastas e lista)

Faça tudo no **mesmo site do SharePoint** onde já está a sua pasta **teste**.

## 3.1 Criar as subpastas

1. Abra o site do SharePoint.
2. No menu à esquerda, clique em **Documents** (ou **Documentos** / **Shared Documents**).
3. Clique na pasta **teste**.
4. Clique em **+ New** → **Folder**.
5. Digite `Temp` → **Create**.
6. Repita para `Validados`.

Resultado:
```
teste/
 ├─ Temp        ← anexo fica aqui só durante a validação (segundos)
 └─ Validados   ← só arquivos certos e não repetidos (dispara o próximo processo)
```

## 3.2 O que é uma lista

Uma **lista** (Microsoft Lists) é uma tabela online, parecida com uma planilha, feita para guardar registros:
cada linha é um item, cada coluna tem um tipo (texto, número, escolha, data).
O Power Automate tem ações prontas para ela: **Get items** (buscar), **Create item** (criar), **Update item** (atualizar).
Aqui ela é o "caderno" de arquivos aceitos.

> Dá para criar listas pessoais no OneDrive ("Minhas listas"), mas **crie no site do SharePoint**: fica junto com as pastas, o time enxerga, e o Power Automate acessa mais facilmente.

## 3.3 Criar a lista ArquivosRecebidos

1. No site, clique na **engrenagem ⚙️** (canto superior direito) → **Site contents** (Conteúdo do site).
2. **+ New** → **List**.
3. **Blank list** (Lista em branco).
4. **Name**: `ArquivosRecebidos` (exatamente assim, sem espaço e sem acento).
5. **Create**.

A lista abre vazia, com a coluna **Title**. Não apague nem renomeie: ela guarda a **chave do e-mail**.

## 3.4 Criar as colunas

Para cada linha da tabela:
1. **+ Add column** (no cabeçalho da lista).
2. Escolha o tipo.
3. **Next**.
4. **Name**: o nome exato.
5. Configuração extra, se houver.
6. **Save**.

| # | Tipo | Name | Configuração extra |
|---|---|---|---|
| 1 | **Single line of text** | `Remetente` | — |
| 2 | **Single line of text** | `NomeArquivo` | — |
| 3 | **Single line of text** | `NomeSalvo` | — |
| 4 | **Single line of text** | `Hash` | — |
| 5 | **Number** | `Linhas` | — |
| 6 | **Choice** | `Status` | Apague as opções de exemplo e digite, uma por linha: `Válido`, `Processado`, `Erro`. **Default value**: `Válido` |

> A coluna **Created** (data de criação) já existe automaticamente — é a data em que o arquivo foi aceito.
> O status `Processado` é para o próximo processo (quando o dado for gravado na base); `Erro` é para marcar manualmente algo que deu problema depois.

**Atenção aos nomes:** `Remetente ` (com espaço no fim) ou `Remetênte` fazem o fluxo não encontrar a coluna.

## 3.5 (Recomendado) Indexar as colunas de busca

O fluxo vai **procurar** na lista por `Title` e por `Hash`. Com muitos itens, buscas em colunas não indexadas ficam lentas ou falham.

1. Na lista: **engrenagem ⚙️** → **List settings**.
2. Em **Columns** → **Indexed columns** → **Create a new index**.
3. Escolha `Hash` → **Create**.
4. Repita para `Title`.

---

# Parte 4 — Preparar o Office Script

O Office Script é o código (TypeScript) que roda **dentro do Excel** e faz a validação.
Usamos o script de vocês (`validar_folheteria.ts`) com três acréscimos: **hash** (idempotência), **erros em formato de tabela** (para o e-mail) e **cores** nas células com erro.

## 4.1 O que o script valida

| Regra | O que faz | Bloqueia o arquivo? |
|---|---|---|
| Cabeçalho | Procura, em qualquer aba, a linha com `EMPRESA FORNECEDORA` e confere se todas as colunas esperadas existem | Sim |
| Campos vazios | Toda coluna obrigatória precisa estar preenchida (`OBSERVAÇÃO` pode ficar vazia) | Sim — célula pintada de **vermelho** |
| Quantidades | `QTDE NF` tem que ser igual a `QTDE FÍSICA` | Sim — as duas células pintadas de **amarelo** |
| Empresa abreviada | Se o nome está no `DE_PARA`, troca pelo nome completo (só quando o arquivo está válido; células com fórmula não são alteradas) | Não — corrige sozinho |
| Empresa desconhecida | Se o nome não está no `DE_PARA` nem é um nome completo conhecido, gera um **aviso** | Não — só avisa |

## 4.2 Atualizar o script

O arquivo do GitHub vem com um `DE_PARA` **de exemplo** (os nomes reais dos fornecedores não ficam em repositório público). Você mantém o seu.

1. Abra o código em formato texto:
   **https://raw.githubusercontent.com/JayCesar/testerepo/power-automate/office-script/validar_folheteria.ts**
2. No seu editor (VS Code ou o editor do Office Scripts), abra o seu script atual.
3. **Mantenha** o seu bloco `const DE_PARA ... };` (as primeiras linhas).
4. **Apague tudo que vem depois** do `};` do DE_PARA.
5. No arquivo do GitHub, copie **tudo a partir da linha** `// DAQUI PARA BAIXO: substitua pelo conteúdo deste arquivo.` até o final.
6. Cole logo abaixo do seu DE_PARA.
7. No Excel na web: **Automate** → **All scripts** → abra o script (ex.: `ValidarArquivoFabrica`) → **Ctrl+A** → cole o conteúdo completo → **Save script**.

> O script fica salvo no **seu OneDrive** (*Documents/Office Scripts*). O Power Automate só enxerga scripts salvos pela **mesma conta** que monta o fluxo.

## 4.3 Testar o script no Excel

Abra uma planilha de teste no Excel na web e clique em **Run** no editor do script.
- Com uma célula obrigatória vazia: ela fica **vermelha** e o resultado mostra `valido: false`.
- Com `QTDE NF` diferente de `QTDE FÍSICA`: as duas ficam **amarelas**.
- Com tudo certo e uma empresa abreviada que está no de-para: o nome é trocado pelo completo e o resultado mostra `valido: true`.

## 4.4 O que o script devolve

```json
{
  "valido": false,
  "mensagem": "Arquivo com erro: 2 problema(s) (valores vazios e/ou QTDE NF diferente de QTDE FÍSICA). Nenhuma correção aplicada.",
  "aba": "Plan1",
  "hash": "4c6174dddd04401e81981fa3a2",
  "totalLinhas": 12,
  "erros": [
    "Linha 4: 'CRD' vazia",
    "Linha 4: QTDE NF (100) ≠ QTDE FÍSICA (90)"
  ],
  "errosTabela": [
    { "linha": 4, "coluna": "CRD", "valor": "", "problema": "CAMPO_VAZIO" },
    { "linha": 4, "coluna": "QTDE NF x QTDE FÍSICA", "valor": "100 x 90", "problema": "QTDE_DIVERGENTE" }
  ],
  "corrigidos": [],
  "avisos": []
}
```

| Campo | Uso no fluxo |
|---|---|
| `valido` | Decide o caminho (certo/errado) |
| `mensagem` | Vai no e-mail de resposta |
| `hash` | Idempotência por conteúdo (camada 2) |
| `totalLinhas` | Registrado na lista |
| `errosTabela` | Vira a tabela de erros no e-mail |
| `corrigidos` | Quais empresas foram corrigidas (vai no e-mail de confirmação) |
| `avisos` | Empresas que não estão no de-para (vai no e-mail ao time) |

O script **não tem parâmetros**: ele encontra a aba sozinho pelo cabeçalho `EMPRESA FORNECEDORA`.

> **Requisito:** o arquivo tem que ser **.xlsx**. Office Scripts não rodam em `.xls` antigo nem em `.xlsm` (com macro).

---

# Parte 5 — Montar o fluxo, etapa por etapa

Ao final de cada etapa há um desenho de **como o fluxo deve estar**. Compare com a sua tela.

## Nomes que você vai usar

| Nome da ação | Tipo da ação |
|---|---|
| `EmailsTime` | Initialize variable |
| `Try` | Scope |
| `Cada anexo` | Apply to each / For each |
| `Eh xlsx` | Condition |
| `Chave email` | Compose |
| `Busca chave` | Get items (SharePoint) |
| `Email novo` | Condition |
| `Salvar temporario` | Create file (SharePoint) |
| `Validar` | Run script (Excel Online Business) |
| `Arquivo valido` | Condition |
| `Tabela de erros` | Select |
| `Tabela HTML` | Create HTML table |
| `Arquivo marcado` | Get file content (SharePoint) |
| `Apagar invalido` | Delete file (SharePoint) |
| `Busca hash` | Get items (SharePoint) |
| `Conteudo repetido` | Condition |
| `Apagar repetido` | Delete file (SharePoint) |
| `Mover para validados` | Move file (SharePoint) |
| `Registrar` | Create item (SharePoint) |
| `Catch` | Scope |

Sem acentos, com os espaços exatamente assim.

---

## Etapa 1 — Criar o fluxo e o gatilho

1. Acesse **make.powerautomate.com**.
2. Menu esquerdo → **+ Create**.
3. **Automated cloud flow** (Fluxo da nuvem automatizado).
4. **Flow name**: `Recepcao de arquivos folheteria`.
5. Na busca de gatilhos, digite `new email` → **When a new email arrives (V3)** (Office 365 Outlook).
6. **Create**.
7. Clique no gatilho e preencha (abra **Show all** / **Advanced parameters** para ver todos os campos):
   - **Folder**: `Inbox` (ou a pasta onde os e-mails chegam).
   - **Include Attachments**: `Yes`
   - **Only with Attachments**: `Yes`
   - **Subject Filter**: o texto que sempre vem no assunto (ex.: `Folheteria`).
     Funciona como **"contém"**: `RE: Folheteria outubro` também passa. Assim, a resposta do remetente com o arquivo corrigido também dispara o fluxo.
8. **Save**.

> Se você já tem um fluxo com esse gatilho, pode usar o mesmo: confira só os campos do passo 7.

Como está:
```
[When a new email arrives (V3)]   assunto contém "Folheteria", só com anexo
```

---

## Etapa 2 — Variável com os e-mails do time

Evita e-mails "fixos" espalhados pelo fluxo. Se o time mudar, altera num lugar só.

1. Abaixo do gatilho: **+** → **Add an action** → `Initialize variable`.
2. Renomeie para `EmailsTime`.
3. **Name**: `EmailsTime` · **Type**: `String` · **Value**: e-mails separados por **ponto e vírgula**, ex.: `ana@empresa.com;bruno@empresa.com`
4. **Save**.

> `Initialize variable` tem que ficar no **nível principal** (fora de loops e condições). Por isso vem logo depois do gatilho.

Como está:
```
[When a new email arrives (V3)]
[EmailsTime]
```

---

## Etapa 3 — Escopo "Try"

Um **Scope** (escopo) é uma "caixa" que agrupa ações. Todo o processamento vai dentro dele.
Na Etapa 12 criamos o `Catch`, que só roda se algo dentro do `Try` falhar.

1. Abaixo de `EmailsTime`: **+** → `Scope` (em **Control**).
2. Renomeie para `Try`.
3. **Save**.

Como está:
```
[When a new email arrives (V3)]
[EmailsTime]
[Try]
   (vazio)
```

---

## Etapa 4 — Loop nos anexos e filtro de .xlsx

Um e-mail pode ter vários anexos (incluindo imagens da assinatura). O loop trata um por um; a condição ignora o que não é `.xlsx`.

**4a. Loop**
1. **Dentro** do `Try`: **+** → `Apply to each` (no novo designer pode aparecer como `For each`, em **Control**).
2. Renomeie para `Cada anexo`.
3. Campo **Select an output from previous steps** (ou **Items**): ⚡ → em **When a new email arrives (V3)** → **Attachments**.
   - Alternativa por expressão: `triggerOutputs()?['body/attachments']`

**4b. Condição "é xlsx?"**
1. **Dentro** do `Cada anexo`: **+** → `Condition` (em **Control**).
2. Renomeie para `Eh xlsx`.
3. Caixa da **esquerda** → **fx** → cole:
   ```
   endsWith(toLower(items('Cada_anexo')?['name']), '.xlsx')
   ```
4. Operador: **is equal to**.
5. Caixa da **direita** → **fx** → `true` → **Add**.
   (Digite `true` **pela expressão**, não como texto, senão a comparação falha.)
6. **Save**.

Todo o resto do fluxo vai no ramo **True** de `Eh xlsx`. O ramo **False** fica vazio: o que não é `.xlsx` é ignorado.

Como está:
```
[Try]
 └─ [Cada anexo]
     └─ [Eh xlsx]  termina com .xlsx?
          ├─ True:  (vazio por enquanto)
          └─ False: (vazio — ignora)
```

---

## Etapa 5 — Idempotência camada 1: esse e-mail já foi aceito?

Esta checagem vem **antes de salvar qualquer coisa**: se o e-mail já foi aceito, o fluxo nem cria o arquivo temporário.

**5a. Montar a chave**
1. No ramo **True** de `Eh xlsx`: **+** → `Compose` (em **Data Operation**).
2. Renomeie para `Chave email`.
3. **Inputs** → **fx** → cole:
   ```
   concat(triggerOutputs()?['body/internetMessageId'], '|', items('Cada_anexo')?['name'])
   ```
   Exemplo de resultado: `<CAF123abc@mail.alfa.com>|pedidos.xlsx`

**5b. Procurar a chave no caderno**
1. Abaixo de `Chave email`: **+** → `Get items` (**SharePoint**).
2. Renomeie para `Busca chave`.
3. **Site Address**: escolha o seu site (se não aparecer, **Enter custom value** e cole o endereço, ex. `https://empresa.sharepoint.com/sites/NomeDoSite`).
4. **List Name**: `ArquivosRecebidos`.
5. **Advanced parameters** / **Show advanced options** → **Filter Query** → **fx** → cole:
   ```
   concat('Title eq ''', replace(outputs('Chave_email'), '''', ''''''), '''')
   ```
   Monta o filtro `Title eq '<a-chave>'`. O `replace` dobra apóstrofos, para o filtro não quebrar se a chave tiver `'`.
6. **Top Count**: `1`.

**5c. Novo ou já aceito?**
1. Abaixo de `Busca chave`: **+** → `Condition` → renomeie para `Email novo`.
2. Esquerda → **fx** → `length(body('Busca_chave')?['value'])`
3. Operador: **is equal to**.
4. Direita: `0`.
5. **Save**.

- **True** = chave não está no caderno → segue.
- **False** = este e-mail já foi aceito → **não faz nada**. Deixe o ramo False vazio.

Como está:
```
[Cada anexo]
 └─ [Eh xlsx]
      └─ True:
          ├─ [Chave email]   "ID-do-email|nome.xlsx"
          ├─ [Busca chave]   procura no caderno
          └─ [Email novo]    encontrou 0?
               ├─ True:  (vazio por enquanto)
               └─ False: (vazio — já aceito, para aqui)
```

---

## Etapa 6 — Salvar na pasta temporária

Só para o Excel conseguir abrir o arquivo e rodar o script.

1. No ramo **True** de `Email novo`: **+** → `Create file` (SharePoint).
2. Renomeie para `Salvar temporario`.
3. **Site Address**: o seu site.
4. **Folder Path**: ícone de pasta 📁 → **teste → Temp** (fica algo como `/Shared Documents/teste/Temp`).
5. **File Name** → **fx** → cole:
   ```
   concat(formatDateTime(convertFromUtc(utcNow(), 'E. South America Standard Time'), 'yyyyMMdd-HHmmss'), '_', items('Cada_anexo')?['name'])
   ```
   Resultado: `20261022-143015_pedidos.xlsx` (horário de Brasília).
   A data e hora evita colisão quando dois remetentes mandam arquivos com o mesmo nome ao mesmo tempo.
6. **File Content**: ⚡ → **Attachments Content** (se houver opção "dentro do loop", escolha a de **Cada anexo**).
   - Se o arquivo salvo ficar corrompido, use a expressão: `base64ToBinary(items('Cada_anexo')?['contentBytes'])`
7. **Save**.

Como está:
```
[Email novo]
 └─ True:
     └─ [Salvar temporario]   teste/Temp/20261022-143015_pedidos.xlsx
```

---

## Etapa 7 — Validar com o Office Script

1. Abaixo de `Salvar temporario`: **+** → `Run script` (**Excel Online (Business)**).
2. Renomeie para `Validar`.
3. Preencha:
   - **Location**: o site do SharePoint.
   - **Document Library**: `Documents` (ou `Shared Documents` / `Documentos`).
   - **File**: ⚡ → em `Salvar temporario` → **Id**. (Se der erro, tente **Path**.)
   - **Script**: `ValidarArquivoFabrica`.
4. O script não tem parâmetros: não aparece nenhum campo extra.
5. **Save**.

> Se o script **não aparece**: foi salvo por outra conta, ou o Excel ainda não sincronizou. Confira no Excel em **Automate → All scripts** e recarregue o Power Automate.

**Condição: válido?**
1. Abaixo de `Validar`: **+** → `Condition` → renomeie para `Arquivo valido`.
2. Esquerda → **fx** → `outputs('Validar')?['body/result/valido']`
3. Operador: **is equal to**.
4. Direita → **fx** → `true` → **Add**.
5. **Save**.

Como está:
```
[Email novo]
 └─ True:
     ├─ [Salvar temporario]
     ├─ [Validar]           { valido, mensagem, hash, erros }
     └─ [Arquivo valido]
          ├─ True:  (Etapa 9)
          └─ False: (Etapa 8)
```

---

## Etapa 8 — Arquivo ERRADO: responde e apaga (não registra nada)

Tudo abaixo vai **dentro do ramo False** de `Arquivo valido`.

**8a. Transformar os erros numa tabela legível**
1. **+** → `Select` (em **Data Operation**) → renomeie para `Tabela de erros`.
2. **From** → **fx** → `outputs('Validar')?['body/result/errosTabela']`
3. **Map** — preencha chave (texto) e valor (**fx**):

| Chave (digite) | Valor (**fx**) |
|---|---|
| `Linha` | `item()?['linha']` |
| `Coluna` | `item()?['coluna']` |
| `Valor` | `item()?['valor']` |
| `O que fazer` | (expressão abaixo) |

Expressão de **O que fazer** (traduz o código do problema para uma instrução):
```
if(equals(item()?['problema'], 'CAMPO_VAZIO'), 'Preencher o campo', if(equals(item()?['problema'], 'QTDE_DIVERGENTE'), 'Conferir QTDE NF e QTDE FÍSICA (devem ser iguais)', 'Incluir esta coluna no cabeçalho'))
```

4. **+** → `Create HTML table` (em **Data Operation**) → renomeie para `Tabela HTML`.
5. **From** → ⚡ **Output** de `Tabela de erros`. **Columns**: `Automatic`.

**8b. Pegar o arquivo marcado com cores**
O script pintou as células com erro no arquivo temporário. Pegamos esse arquivo para devolver ao remetente **antes** de apagar.

1. **+** → `Get file content` (SharePoint) → renomeie para `Arquivo marcado`.
2. **Site Address**: o seu site. **File Identifier**: ⚡ **Id** de `Salvar temporario`.

**8c. Responder ao remetente**
1. **+** → `Reply to email (V3)` (Office 365 Outlook).
2. **Message Id**: ⚡ → em When a new email arrives → **Message Id**.
3. **Body** (texto + conteúdo dinâmico):
   ```
   Olá!

   Encontramos problemas no arquivo enviado:
   [⚡ mensagem — de Validar]

   [⚡ Output — de Tabela HTML]

   As células com problema estão destacadas no arquivo em anexo
   (vermelho = campo vazio, amarelo = QTDE NF diferente de QTDE FÍSICA).
   Por favor, corrija e RESPONDA ESTE E-MAIL com o arquivo corrigido.
   ```
   - "mensagem": ⚡ em `Validar` → **mensagem** (ou **fx** `outputs('Validar')?['body/result/mensagem']`).
   - Para a tabela aparecer formatada: no novo designer o corpo já aceita HTML; no clássico, use o ícone **</>** (code view) do campo Body.
4. **Attachments** → **Add new item**:
   - **Name** → **fx** → `items('Cada_anexo')?['name']` (o nome original, sem a data)
   - **Content** → ⚡ **File Content** de `Arquivo marcado`

**8d. Avisar o time**
1. **+** → `Send an email (V2)`.
2. **To**: ⚡ variável **EmailsTime**.
3. **Subject**: `Arquivo recusado - ` + **fx** `items('Cada_anexo')?['name']`
4. **Body**: `Remetente: ` ⚡ **From** · `Problemas: ` ⚡ **mensagem** de `Validar` · `Detalhe: ` ⚡ **Output** de `Tabela HTML`.

**8e. Apagar o arquivo temporário**
1. **+** → `Delete file` (SharePoint) → renomeie para `Apagar invalido`.
2. **Site Address**: o seu site. **File Identifier**: ⚡ **Id** de `Salvar temporario`.
3. **Save**.

**Nada é registrado na lista.** O arquivo errado não fica em lugar nenhum.

Como está:
```
     └─ [Arquivo valido]
          ├─ True:  (Etapa 9)
          └─ False:
              ├─ [Tabela de erros]        escolhe/renomeia colunas
              ├─ [Tabela HTML]            vira tabela de e-mail
              ├─ [Arquivo marcado]        arquivo com células coloridas
              ├─ [Reply to email (V3)]    erros + arquivo marcado
              ├─ [Send an email (V2)]     avisa o time
              └─ [Apagar invalido]        apaga da Temp
```

---

## Etapa 9 — Arquivo CERTO: idempotência camada 2 (conteúdo repetido?)

Tudo abaixo vai **dentro do ramo True** de `Arquivo valido`.

**9a. Procurar um arquivo já aceito com o mesmo conteúdo**
1. **+** → `Get items` (SharePoint) → renomeie para `Busca hash`.
2. **Site Address** / **List Name**: o seu site / `ArquivosRecebidos`.
3. **Filter Query** → **fx** → cole:
   ```
   concat('Hash eq ''', outputs('Validar')?['body/result/hash'], '''')
   ```
4. **Top Count**: `1`.

**9b. Repetido?**
1. **+** → `Condition` → renomeie para `Conteudo repetido`.
2. Esquerda → **fx** → `length(body('Busca_hash')?['value'])`
3. Operador: **is greater than**.
4. Direita: `0`.
5. **Save**.

- **True** = já existe arquivo aceito com o mesmo conteúdo → Etapa 10.
- **False** = conteúdo novo → Etapa 11.

Como está:
```
     └─ [Arquivo valido]
          ├─ True:
          │   ├─ [Busca hash]          já aceitei esse conteúdo?
          │   └─ [Conteudo repetido]
          │        ├─ True:  (Etapa 10)
          │        └─ False: (Etapa 11)
          └─ False: (Etapa 8 — feita)
```

---

## Etapa 10 — Conteúdo repetido: avisa e apaga (não registra)

Dentro do ramo **True** de `Conteudo repetido`.

**10a. Responder ao remetente**
1. **+** → `Reply to email (V3)`.
2. **Message Id**: ⚡ **Message Id** do gatilho.
3. **Body**:
   ```
   Olá! Este arquivo já tinha sido recebido e aceito em [fx]. Nenhuma ação é necessária.
   ```
   Expressão da data (pelo **fx**):
   ```
   formatDateTime(convertFromUtc(first(body('Busca_hash')?['value'])?['Created'], 'E. South America Standard Time'), 'dd/MM/yyyy HH:mm')
   ```

**10b. Apagar o temporário**
1. **+** → `Delete file` (SharePoint) → renomeie para `Apagar repetido`.
2. **File Identifier**: ⚡ **Id** de `Salvar temporario`.
3. **Save**.

Como está:
```
          │   └─ [Conteudo repetido]
          │        ├─ True:
          │        │   ├─ [Reply to email (V3)]   "já recebido em 21/10 09:00"
          │        │   └─ [Apagar repetido]       apaga da Temp
          │        └─ False: (Etapa 11)
```

---

## Etapa 11 — Conteúdo novo: guarda, registra e confirma

Dentro do ramo **False** de `Conteudo repetido`. **Só aqui** algo é guardado.

**11a. Mover da Temp para Validados**
1. **+** → `Move file` (SharePoint) → renomeie para `Mover para validados`.
2. **Current Site Address** e **Destination Site Address**: o seu site.
3. **File to Move**: ⚡ **Id** de `Salvar temporario`.
4. **Destination Folder**: 📁 `teste/Validados`.
5. **If another file is already there**: `Copy with a new name`.

**11b. Registrar no caderno**
1. **+** → `Create item` (SharePoint) → renomeie para `Registrar`.
2. **Site Address** / **List Name**: o seu site / `ArquivosRecebidos`.
3. Preencha (abra **Advanced parameters** → **Show all** se faltar campo):

| Campo | Como preencher |
|---|---|
| **Title** | ⚡ **Outputs** de `Chave email` |
| **Remetente** | ⚡ **From** (do gatilho) |
| **NomeArquivo** | **fx** → `items('Cada_anexo')?['name']` |
| **NomeSalvo** | ⚡ **Name** de `Salvar temporario` |
| **Hash** | **fx** → `outputs('Validar')?['body/result/hash']` |
| **Linhas** | **fx** → `outputs('Validar')?['body/result/totalLinhas']` |
| **Status Value** | `Válido` |

**11c. Confirmar ao remetente**
1. **+** → `Reply to email (V3)`.
2. **Message Id**: ⚡ **Message Id** do gatilho.
3. **Body**: `Olá! Arquivo recebido e validado com sucesso. ` + ⚡ **mensagem** de `Validar`.
   Se quiser listar as empresas corrigidas, acrescente pelo **fx**:
   ```
   join(outputs('Validar')?['body/result/corrigidos'], '<br>')
   ```
4. **Save**.

**11d. (Opcional) Avisar o time sobre empresas desconhecidas**
Se o script gerou avisos (empresa que não está no de-para), o time pode querer atualizar o de-para.
1. **+** → `Condition`: esquerda **fx** `length(outputs('Validar')?['body/result/avisos'])` · **is greater than** · `0`.
2. No **True**: `Send an email (V2)` para ⚡ **EmailsTime**, assunto `Empresas fora do de-para`, corpo **fx** `join(outputs('Validar')?['body/result/avisos'], '<br>')`.

> **Por que mover antes de registrar?** Se o registro fosse feito primeiro e o `Move file` falhasse, o caderno diria "aceito" para um arquivo que não está em Validados — e a camada 1 bloquearia a nova tentativa. Movendo antes, um registro na lista sempre significa "arquivo está em Validados".

> A chegada em `teste/Validados` é o "evento" para o próximo processo (outro fluxo com o gatilho **When a file is created in a folder** apontando para essa pasta).

Como está:
```
          │        └─ False:
          │            ├─ [Mover para validados]   Temp → Validados
          │            ├─ [Registrar]              caderno: chave, hash, Válido
          │            └─ [Reply to email (V3)]    "validado com sucesso"
```

---

## Etapa 12 — Escopo "Catch": avisar se o fluxo quebrar

Se qualquer ação dentro do `Try` falhar (SharePoint fora do ar, aba inexistente, script com erro...), queremos saber.

1. **Abaixo** do `Try` (no nível principal, **fora** dele): **+** → `Scope` → renomeie para `Catch`.
2. Configure para rodar **só quando o Try falhar**:
   - Novo designer: clique em `Catch` → aba **Settings** → **Run after** → expanda `Try` → marque **Has failed** e **Has timed out** → desmarque **Is successful**.
   - Clássico: **…** do `Catch` → **Configure run after** → marque **has failed** e **has timed out** → desmarque **is successful** → **Done**.
3. **Dentro** do `Catch`: **+** → `Send an email (V2)`:
   - **To**: ⚡ variável **EmailsTime** (ou só o seu e-mail).
   - **Subject**: `ERRO no fluxo de recepção de arquivos`
   - **Body**:
     ```
     O fluxo falhou ao processar um e-mail.
     Assunto: [⚡ Subject do gatilho]
     Remetente: [⚡ From do gatilho]
     Execução: [fx]
     ```
     Expressão do link da execução:
     ```
     concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], '/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])
     ```
4. **Save**.

> Se a falha acontecer depois de `Salvar temporario`, pode sobrar um arquivo na pasta **Temp**. Uma vez por semana, confira a Temp: tudo o que estiver lá é sobra de falha e pode ser apagado.

---

## Etapa 13 — Conferir o loop em sequência

1. Clique em `Cada anexo` → **Settings** (novo designer: aba **Settings**; clássico: **…** → **Settings**).
2. **Concurrency Control**: **desligado** (Off).

Assim os anexos são processados um por vez. Com processamento paralelo, dois anexos idênticos no mesmo e-mail poderiam passar juntos pela checagem de hash.

---

## O fluxo completo

```
[When a new email arrives (V3)]                 assunto contém X, só com anexo
[EmailsTime]                                    e-mails do time
[Try]
 └─ [Cada anexo]                                um anexo por vez
     └─ [Eh xlsx]
          ├─ False: ignora
          └─ True:
              ├─ [Chave email]                  ID-do-email|nome.xlsx      ┐ IDEMPOTÊNCIA
              ├─ [Busca chave]                  já aceito?                 │ CAMADA 1
              └─ [Email novo]                                              ┘
                   ├─ False: já aceito → nada
                   └─ True:
                       ├─ [Salvar temporario]   teste/Temp/yyyyMMdd-HHmmss_nome.xlsx
                       ├─ [Validar]             Office Script → valido, hash, erros
                       └─ [Arquivo valido]
                            ├─ False: ERRADO
                            │   ├─ [Tabela de erros] + [Tabela HTML]
                            │   ├─ [Arquivo marcado]         arquivo colorido
                            │   ├─ responde com erros + anexo
                            │   ├─ avisa o time
                            │   └─ [Apagar invalido]         NADA FICA GUARDADO
                            └─ True: CERTO
                                ├─ [Busca hash]                                   ┐ IDEMPOTÊNCIA
                                └─ [Conteudo repetido]                            ┘ CAMADA 2
                                     ├─ True: repetido
                                     │   ├─ responde "já recebido em DD/MM"
                                     │   └─ [Apagar repetido]        NADA FICA GUARDADO
                                     └─ False: novo
                                         ├─ [Mover para validados]   Temp → Validados
                                         ├─ [Registrar]              caderno
                                         └─ responde "validado"
[Catch]  (só se o Try falhar)
 └─ e-mail de erro com link da execução
```

---

# Parte 6 — Testar tudo

Prepare:
- `teste_erro.xlsx`: no formato real (cabeçalho com `EMPRESA FORNECEDORA` etc.), com uma célula obrigatória vazia (ex.: `CRD`) e uma linha com `QTDE NF` ≠ `QTDE FÍSICA`.
- `teste_ok.xlsx`: o mesmo arquivo corrigido, com pelo menos uma empresa escrita de forma abreviada que esteja no de-para.
- Uma imagem qualquer (`foto.png`).

Depois de cada teste, confira: **(1)** o histórico da execução, **(2)** a lista ArquivosRecebidos, **(3)** as pastas Temp e Validados, **(4)** a caixa do remetente.

| # | O que fazer | Resultado esperado |
|---|---|---|
| 1 | E-mail com o assunto certo e `teste_erro.xlsx` | Resposta com tabela de erros + arquivo colorido; e-mail ao time; **lista sem linha nova**; **Temp vazia**; **nada** em Validados |
| 2 | **Responda** a resposta com `teste_ok.xlsx` | Resposta "validado" informando a empresa corrigida; **uma linha** na lista (Válido); arquivo em **Validados** já com o nome completo; Temp vazia |
| 3 | E-mail **novo** com `teste_ok.xlsx` de novo | Resposta "já recebido em ..."; **lista sem linha nova**; Temp vazia; nada novo em Validados |
| 4 | **My flows** → fluxo → execução do teste 2 → **Resubmit** | Passa pelo **False** de `Email novo`: **nenhum** arquivo, **nenhuma** linha, **nenhum** e-mail |
| 5 | E-mail com `teste_erro.xlsx` **e** `foto.png` | A foto é ignorada (False de `Eh xlsx`); o xlsx recebe a resposta de erros |
| 6 | Envie um `.xlsx` sem a coluna `CRD` no cabeçalho | Resposta "cabeçalho incompleto" com a coluna que falta; nada guardado |
| 7 | No `Validar`, troque temporariamente o **Script** por um que não existe e envie um arquivo | `Validar` falha → `Catch` envia o e-mail de erro (depois, volte o script certo e apague a sobra da Temp) |

Os testes **3** e **4** são as provas da idempotência; o teste **1** prova que nada errado é guardado. Tire print deles para a apresentação.

---

# Parte 7 — Problemas comuns

| Sintoma | Causa provável | Solução |
|---|---|---|
| "The template validation failed... action 'X' not found" | Nome da ação diferente do usado na expressão | Confira o nome exato (sem acento; espaços viram `_` na expressão) |
| `Chave email` sai só com `\|nome.xlsx` | `internetMessageId` veio vazio | Troque `triggerOutputs()?['body/internetMessageId']` por ⚡ **Message Id** do gatilho |
| `Busca chave` / `Busca hash` dão erro de filtro | Coluna com outro nome, ou expressão colada como texto | Cole o filtro pelo **fx**; confira os nomes `Title` e `Hash` |
| O script não aparece em **Run script** | Script salvo por outra conta, ou arquivo não é `.xlsx` | Salve o script com a conta do fluxo; use `.xlsx` |
| `Validar` falha com "file is locked" | Arquivo aberto no Excel ao mesmo tempo | Feche e rode de novo |
| Arquivo salvo abre corrompido | Conteúdo do anexo foi como texto | **File Content** = `base64ToBinary(items('Cada_anexo')?['contentBytes'])` |
| Tabela aparece como código no e-mail | Corpo não está em HTML | Insira a tabela no modo código (**</>**) do Body |
| Hora no nome 3h adiantada | Faltou converter do UTC | Use a expressão com `convertFromUtc` da Etapa 6 |
| `Move file` falha | Já existe arquivo com o mesmo nome em Validados | **If another file is already there** = `Copy with a new name` |
| `Delete file` falha | Arquivo ainda em uso pelo Excel logo após o script | Adicione um `Delay` de 5–10 segundos antes do `Delete file` |
| "Cabeçalho 'EMPRESA FORNECEDORA' não encontrado" | Arquivo fora do modelo ou cabeçalho com outro texto | Confira o texto do cabeçalho; se a coluna tiver outro nome aceito, inclua em `headers` no `COLUNAS` |
| Empresa abreviada não foi corrigida | Não está no `DE_PARA`, ou a célula tem fórmula, ou o arquivo tinha erro | Inclua no `DE_PARA`; correções só acontecem em arquivo válido |
| Sobram arquivos na Temp | Fluxo falhou no meio | Apague manualmente; veja no histórico qual execução falhou |
| Resposta do remetente não dispara o fluxo | Assunto não contém o filtro, ou veio sem anexo | Filtro deve ser uma palavra sempre presente no assunto; peça para responder **com** o arquivo |

---

# Apêndice — Todas as expressões num lugar só

```text
# Etapa 4 — Eh xlsx (esquerda) / is equal to / true (pelo fx)
endsWith(toLower(items('Cada_anexo')?['name']), '.xlsx')

# Etapa 5 — Chave email
concat(triggerOutputs()?['body/internetMessageId'], '|', items('Cada_anexo')?['name'])

# Etapa 5 — Busca chave (Filter Query)
concat('Title eq ''', replace(outputs('Chave_email'), '''', ''''''), '''')

# Etapa 5 — Email novo (esquerda) / is equal to / 0
length(body('Busca_chave')?['value'])

# Etapa 6 — Salvar temporario.File Name
concat(formatDateTime(convertFromUtc(utcNow(), 'E. South America Standard Time'), 'yyyyMMdd-HHmmss'), '_', items('Cada_anexo')?['name'])

# Etapa 6 — Salvar temporario.File Content (só se o dinâmico não funcionar)
base64ToBinary(items('Cada_anexo')?['contentBytes'])

# Etapa 7 — Arquivo valido (esquerda) / is equal to / true (pelo fx)
outputs('Validar')?['body/result/valido']

# Etapa 8 — Tabela de erros.From
outputs('Validar')?['body/result/errosTabela']

# Etapa 8 — Tabela de erros.Map (valores)
item()?['linha']   item()?['coluna']   item()?['valor']

# Etapa 8 — Tabela de erros.Map "O que fazer"
if(equals(item()?['problema'], 'CAMPO_VAZIO'), 'Preencher o campo', if(equals(item()?['problema'], 'QTDE_DIVERGENTE'), 'Conferir QTDE NF e QTDE FÍSICA (devem ser iguais)', 'Incluir esta coluna no cabeçalho'))

# Etapa 8 — mensagem do script
outputs('Validar')?['body/result/mensagem']

# Etapa 8 — nome original do anexo
items('Cada_anexo')?['name']

# Etapa 9 — Busca hash (Filter Query)
concat('Hash eq ''', outputs('Validar')?['body/result/hash'], '''')

# Etapa 9 — Conteudo repetido (esquerda) / is greater than / 0
length(body('Busca_hash')?['value'])

# Etapa 10 — data em que o arquivo foi aceito
formatDateTime(convertFromUtc(first(body('Busca_hash')?['value'])?['Created'], 'E. South America Standard Time'), 'dd/MM/yyyy HH:mm')

# Etapa 11 — Registrar.Hash / Registrar.Linhas
outputs('Validar')?['body/result/hash']
outputs('Validar')?['body/result/totalLinhas']

# Etapa 11 — empresas corrigidas / avisos
join(outputs('Validar')?['body/result/corrigidos'], '<br>')
length(outputs('Validar')?['body/result/avisos'])
join(outputs('Validar')?['body/result/avisos'], '<br>')

# Etapa 12 — link da execução
concat('https://make.powerautomate.com/environments/', workflow()?['tags']?['environmentName'], '/flows/', workflow()?['name'], '/runs/', workflow()?['run']?['name'])
```
