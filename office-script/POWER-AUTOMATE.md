# Conciliação 100% Microsoft 365 (sem AWS / Azure)

```
Excel no SharePoint (abas Pedidos, Recebimentos, NotasFiscais, Rateios)
  → Power Automate
      1. Executar script (Office Script = motor de regras)  → aba Pendencias + JSON
      2. Para cada pendência → Criar item na lista SharePoint "Pendencias"  (= base de dados)
      3. Pendências críticas → mensagem no Teams para o responsável
```

O Office Script **não acessa banco de dados**: ele só lê e escreve no próprio Excel.
Quem grava na base (lista do SharePoint) é o Power Automate, usando o JSON que o script devolve.

## 1. Preparar o Excel (5 min)

1. Suba `folheteria-exemplo.xlsx` numa pasta do SharePoint/OneDrive.
2. Abra no Excel Online → aba **Automatizar** → **Novo script**.
3. Apague o conteúdo, cole `conciliacao.ts` inteiro, renomeie para **Conciliacao** e salve.
4. Teste clicando em **Executar**: deve aparecer a aba **Pendencias** com 8 linhas.
   (Sem parâmetros, ele usa a data de hoje e o fim do mês como fechamento.)

## 2. Criar a lista "Pendencias" no SharePoint (5 min)

| Coluna | Tipo |
|---|---|
| Title (renomear para PedidoId) | Texto |
| Regra | Texto |
| Status | Escolha: CONCILIADO, RECEBIMENTO_PARCIAL_ATRASADO, DIVERGENCIA_VALOR, COBRADO_SEM_RECEBIMENTO, PROVISIONAR, NF_DUPLICADA, DADOS_INCOMPLETOS, RATEIO_INCOMPLETO |
| Criticidade | Escolha: CRITICA, ALTA, MEDIA, BAIXA |
| Responsavel | Texto (ou Pessoa) |
| ProximaAcao | Texto |
| Explicacao | Várias linhas de texto |
| ValorEnvolvido | Moeda |
| Situacao | Escolha: Aberta, Em análise, Resolvida (padrão Aberta) — validação humana |
| Execucao | Data e hora |

Ative o **histórico de versões** da lista: é a trilha de auditoria (quem mudou o quê e quando).

## 3. Montar o fluxo (15–20 min)

1. **Gatilho:** "Disparo manual de fluxo" (para a demo) ou "Quando um arquivo é criado ou modificado (SharePoint)".
2. **Excel Online (Business) → Executar script**
   - Local / Biblioteca / Arquivo: a planilha
   - Script: Conciliacao
   - hoje: `2026-10-28` (demo) ou deixe vazio · fechamento: `2026-10-31` ou vazio
   - toleranciaPercentual: `2` · diasAlerta: `3`
3. **Aplicar a cada** → valor: `outputs('Executar_script')?['body/result/pendencias']`
   - **SharePoint → Criar item** na lista Pendencias, mapeando:
     - PedidoId = `items('Aplicar_a_cada')?['pedidoId']`
     - Regra = `...['regraId']`, Status = `...['status']`, Criticidade = `...['criticidade']`
     - Responsavel, ProximaAcao, Explicacao, ValorEnvolvido = campos de mesmo nome
     - Execucao = `utcNow()`
   - **Condição:** `items('Aplicar_a_cada')?['criticidade']` é igual a `CRITICA`
     → Sim: **Teams → Postar mensagem em um chat ou canal** com `Explicacao` e `ProximaAcao`.
4. (Opcional) **Teams/Outlook:** resumo final com
   `body/result/conciliados`, `comPendencia`, `valorDivergencias`, `alertasAntecipatorios`.

Dica: se as expressões acima não baterem com o nome das ações, use o seletor de **Conteúdo dinâmico**;
os campos do JSON aparecem lá depois da primeira execução.

## Evitar duplicar pendência em reexecuções (idempotência)

Antes do "Criar item": **Obter itens** com filtro OData
`Title eq '<pedidoId>' and Regra eq '<regraId>' and Situacao ne 'Resolvida'`.
Se `length(body('Obter_itens')?['value'])` for 0 → cria; senão → atualiza.

## Para a demo

Lista do SharePoint aberta em visualização agrupada por **Criticidade** = fila de pendências.
Clique num item = explicação + próxima ação + histórico de versões (rastreabilidade).
