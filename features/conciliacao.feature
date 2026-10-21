# language: pt
# Cenários em Gherkin para validar com o negócio no Example Mapping.
# São HIPÓTESES deduzidas do case: confirmar, corrigir ou descartar cada uma amanhã.

Funcionalidade: Conciliação da folheteria
  Como analista de Faturamento/Custos
  Quero que o sistema confira pedido, recebimento, nota fiscal e rateio sozinho
  Para olhar só o que tem problema e fechar o mês sem surpresa

  Contexto:
    Dado que hoje é 28/10 e o fechamento é 31/10
    E a tolerância de valor unitário é 2%

  Cenário: Caminho feliz
    Dado um pedido de 10.000 folhetos a R$ 0,50
    E 10.000 folhetos recebidos
    E uma NF de 10.000 a R$ 0,50
    E rateio somando 100%
    Quando o motor concilia
    Então o pedido fica "CONCILIADO" e é liberado para aprovação

  Cenário: Recebimento parcial com prazo vencido
    Dado um pedido de 20.000 com prazo em 20/10
    E apenas 12.000 recebidos
    Quando o motor concilia
    Então surge a pendência "RECEBIMENTO_PARCIAL_ATRASADO" para Compras

  Cenário: NF com preço acima do pedido
    Dado um pedido a R$ 1,20 por unidade
    E uma NF de 5.000 unidades a R$ 1,32
    Quando o motor concilia
    Então surge "DIVERGENCIA_VALOR" de R$ 600 para Faturamento
    E a decisão de contestar ou aceitar é humana

  Cenário: Recebido sem NF perto do fechamento
    Dado 8.000 folhetos recebidos em 26/10 a R$ 0,50
    E nenhuma NF registrada
    Quando faltam 3 dias para o fechamento
    Então surge "PROVISIONAR" R$ 4.000, crítico, para Custos

  Cenário: NF duplicada
    Dado a NF-1005 do mesmo fornecedor lançada duas vezes
    Quando o motor concilia
    Então surge "NF_DUPLICADA" com R$ 2.400 em risco
    E o pagamento da duplicata fica bloqueado

  Cenário: Cobrança de material não entregue
    Dado uma NF de 15.000 unidades e 14.000 recebidas
    Quando o motor concilia
    Então surge "COBRADO_SEM_RECEBIMENTO" de R$ 300

  Cenário: Pedido com cadastro incompleto
    Dado um pedido sem CRD e sem fábrica
    Quando o motor concilia
    Então surge "DADOS_INCOMPLETOS" para Compras

  Cenário: Pedido futuro não gera provisão
    Dado um pedido feito em 20/10 com entrega prevista para 10/11
    E nada recebido
    Quando o motor concilia
    Então o pedido fica "EM_ANDAMENTO" e nada é provisionado

  Cenário: Rateio incompleto
    Dado um pedido com rateio somando 70%
    Quando o motor concilia
    Então surge "RATEIO_INCOMPLETO" para Custos antes do lançamento no SAP
