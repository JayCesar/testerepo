// Modelo de domínio. Cada tipo espelha uma fonte de dado que hoje chega separada.

export type Pedido = {
  pedidoId: string;
  dataPedido: string; // ISO yyyy-mm-dd
  fornecedorId: string;
  fornecedor: string;
  materialId: string;
  descricao: string;
  crd: string; // pode vir vazio (dado incompleto)
  fabrica: string; // pode vir vazio (dado incompleto)
  quantidade: number;
  precoUnitario: number;
  valorTotal: number;
  prazoEntrega: string;
  solicitante: string;
  aprovadorCompra: string;
};

export type Recebimento = {
  recebimentoId: string;
  pedidoId: string;
  dataRecebimento: string;
  quantidade: number;
  local: string;
  conferente: string;
  comprovante: string;
};

export type NotaFiscal = {
  nfNumero: string;
  fornecedorId: string;
  pedidoId: string;
  dataEmissao: string;
  quantidade: number;
  valorUnitario: number;
  valorTotal: number;
};

export type Rateio = {
  pedidoId: string;
  centroCusto: string;
  percentual: number;
};

// "Fotografia" de tudo que existe sobre um pedido: é a junção pela chave da jornada.
export type JornadaPedido = {
  pedido: Pedido;
  recebimentos: Recebimento[];
  notas: NotaFiscal[];
  rateios: Rateio[];
  // NFs cujo (número + fornecedor) aparece mais de uma vez na base inteira
  notasDuplicadas: NotaFiscal[];
};

export type Criticidade = "CRITICA" | "ALTA" | "MEDIA" | "BAIXA" | "NENHUMA";

export type Status =
  | "CONCILIADO"
  | "RECEBIMENTO_PARCIAL_ATRASADO"
  | "DIVERGENCIA_VALOR"
  | "COBRADO_SEM_RECEBIMENTO"
  | "PROVISIONAR"
  | "NF_DUPLICADA"
  | "DADOS_INCOMPLETOS"
  | "RATEIO_INCOMPLETO"
  | "EM_ANDAMENTO";

export type Pendencia = {
  regraId: string;
  status: Status;
  criticidade: Criticidade;
  responsavel: string;
  proximaAcao: string;
  // Explicabilidade: frase em português dizendo o porquê, com os números
  explicacao: string;
  valorEnvolvido: number; // R$ em risco/divergência (0 quando não se aplica)
};

export type Contexto = {
  hoje: string; // data de referência (ISO)
  fechamento: string; // data de fechamento do mês (ISO)
  toleranciaValorUnitario: number; // ex.: 0.02 = 2%
  diasAlertaFechamento: number; // ex.: 3
};

export type ResultadoPedido = {
  pedidoId: string;
  statusPrincipal: Status; // pendência de maior criticidade
  criticidade: Criticidade;
  pendencias: Pendencia[];
};
