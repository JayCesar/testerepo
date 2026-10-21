# Massa fictícia + regras de conciliação — Folheteria

Dados 100% fictícios. Datas de referência para a demo:
- **Hoje:** 2026-10-28
- **Fechamento do mês:** 2026-10-31
- **Tolerância de valor unitário:** 2% (parâmetro configurável)

`crd` é um código provisório (CRD-001...). Confirmar amanhã com o negócio o que é CRD e ajustar.

## Regras (configuração, não código)

| ID | Condição | Status | Criticidade | Responsável | Próxima ação |
|----|----------|--------|-------------|-------------|--------------|
| R01 | Recebido = pedido, NF = recebido, valor dentro da tolerância, rateio = 100% | CONCILIADO | — | — | Liberar para aprovação/pagamento |
| R02 | Recebido < pedido e prazo de entrega vencido | RECEBIMENTO_PARCIAL_ATRASADO | Média | Compras | Cobrar fornecedor do saldo |
| R03 | Valor unitário da NF difere do pedido além da tolerância | DIVERGENCIA_VALOR | Alta | Faturamento | Contestar NF ou validar reajuste (humano) |
| R04 | Quantidade da NF > quantidade recebida | COBRADO_SEM_RECEBIMENTO | Alta | Faturamento | Pedir NF corrigida / bloquear pagamento do excedente |
| R05 | Recebido sem NF e faltam ≤ 3 dias para o fechamento | PROVISIONAR | Crítica | Custos | Provisionar o valor recebido no mês |
| R06 | Mesmo nº de NF + fornecedor aparece mais de uma vez | NF_DUPLICADA | Crítica | Faturamento | Bloquear pagamento da duplicata |
| R07 | Campo obrigatório vazio (crd, fabrica) | DADOS_INCOMPLETOS | Média | Compras | Completar cadastro do pedido |
| R08 | Soma do rateio ≠ 100% | RATEIO_INCOMPLETO | Alta | Custos | Completar rateio antes do SAP |
| R09 | Sem recebimento e prazo ainda não venceu | EM_ANDAMENTO | Baixa | — | Nada (não provisiona: pedido é intenção, não custo) |

Um pedido pode ter mais de uma pendência. O status exibido é o de **maior criticidade**; a timeline mostra todas.

## Gabarito dos cenários (use como teste do motor)

| Pedido | Cenário | Resultado esperado |
|--------|---------|--------------------|
| P001 | Caminho feliz | CONCILIADO |
| P002 | 12.000 de 20.000 recebidos, prazo vencido | RECEBIMENTO_PARCIAL_ATRASADO |
| P003 | NF a R$ 1,32 vs pedido R$ 1,20 (+10%, R$ 600) | DIVERGENCIA_VALOR |
| P004 | Recebido 26/10, sem NF, fechamento em 3 dias | PROVISIONAR R$ 4.000 |
| P005 | NF-1005 lançada duas vezes | NF_DUPLICADA (R$ 2.400 em risco) |
| P006 | NF cobra 15.000, recebidos 14.000 | COBRADO_SEM_RECEBIMENTO (R$ 300) + PARCIAL_ATRASADO |
| P007 | Pedido sem CRD e sem fábrica | DADOS_INCOMPLETOS |
| P008 | Pedido de 20/10, entrega em 10/11 | EM_ANDAMENTO (sem provisão) |
| P009 | Rateio soma 70% | RATEIO_INCOMPLETO |

## Números para o pitch (desta massa)

- 9 pedidos, 1 conciliado automaticamente sem exceção → mostra a fila de exceções trabalhando.
- R$ 3.300 em divergências detectadas (P003 R$ 600 + P005 R$ 2.400 + P006 R$ 300).
- 1 alerta antecipatório (P004) que evita custo no mês errado.
