// Regras de conciliação como CONFIGURAÇÃO.
// Cada regra é independente: recebe a jornada de um pedido e devolve uma pendência ou null.
// Adicionar fornecedor/fábrica não muda nada aqui; adicionar regra = adicionar um item na lista.
// Isso responde ao critério de Escalabilidade e à pergunta "quem mantém cada regra?" (campo responsavel).
import type { Contexto, JornadaPedido, Pendencia } from "./tipos.ts";

export type Regra = {
  id: string;
  descricao: string;
  avaliar: (j: JornadaPedido, ctx: Contexto) => Pendencia | null;
};

const soma = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const diasEntre = (de: string, ate: string) =>
  Math.round((Date.parse(ate) - Date.parse(de)) / 86_400_000);

const qtdRecebida = (j: JornadaPedido) => soma(j.recebimentos.map((r) => r.quantidade));
// NFs válidas = sem contar as duplicatas (a 2ª ocorrência em diante)
const notasValidas = (j: JornadaPedido) => {
  const vistas = new Set<string>();
  return j.notas.filter((n) => {
    const chave = `${n.fornecedorId}|${n.nfNumero}`;
    if (vistas.has(chave)) return false;
    vistas.add(chave);
    return true;
  });
};
const qtdFaturada = (j: JornadaPedido) => soma(notasValidas(j).map((n) => n.quantidade));

export const REGRAS: Regra[] = [
  {
    id: "R02",
    descricao: "Recebido < pedido e prazo de entrega vencido",
    avaliar: (j, ctx) => {
      const recebido = qtdRecebida(j);
      if (recebido === 0 || recebido >= j.pedido.quantidade) return null;
      if (ctx.hoje <= j.pedido.prazoEntrega) return null;
      const saldo = j.pedido.quantidade - recebido;
      return {
        regraId: "R02",
        status: "RECEBIMENTO_PARCIAL_ATRASADO",
        criticidade: "MEDIA",
        responsavel: "Compras",
        proximaAcao: "Cobrar fornecedor do saldo",
        explicacao: `Recebidas ${recebido} de ${j.pedido.quantidade} unidades; faltam ${saldo} e o prazo venceu em ${j.pedido.prazoEntrega}.`,
        valorEnvolvido: saldo * j.pedido.precoUnitario,
      };
    },
  },
  {
    id: "R03",
    descricao: "Valor unitário da NF difere do pedido além da tolerância",
    avaliar: (j, ctx) => {
      const nf = notasValidas(j).find(
        (n) => Math.abs(n.valorUnitario - j.pedido.precoUnitario) / j.pedido.precoUnitario > ctx.toleranciaValorUnitario,
      );
      if (!nf) return null;
      const diferenca = (nf.valorUnitario - j.pedido.precoUnitario) * nf.quantidade;
      const pct = ((nf.valorUnitario / j.pedido.precoUnitario - 1) * 100).toFixed(1);
      return {
        regraId: "R03",
        status: "DIVERGENCIA_VALOR",
        criticidade: "ALTA",
        responsavel: "Faturamento",
        proximaAcao: "Contestar NF ou validar reajuste (decisão humana)",
        explicacao: `${nf.nfNumero} cobra ${brl(nf.valorUnitario)}/un e o pedido é ${brl(j.pedido.precoUnitario)}/un (${pct}%), diferença de ${brl(diferenca)}.`,
        valorEnvolvido: Math.abs(diferenca),
      };
    },
  },
  {
    id: "R04",
    descricao: "Quantidade faturada > quantidade recebida",
    avaliar: (j) => {
      const faturado = qtdFaturada(j);
      const recebido = qtdRecebida(j);
      if (faturado === 0 || faturado <= recebido) return null;
      const excedente = faturado - recebido;
      return {
        regraId: "R04",
        status: "COBRADO_SEM_RECEBIMENTO",
        criticidade: "ALTA",
        responsavel: "Faturamento",
        proximaAcao: "Pedir NF corrigida / bloquear pagamento do excedente",
        explicacao: `Faturadas ${faturado} unidades, mas só ${recebido} foram recebidas: ${excedente} cobradas sem entrega (${brl(excedente * j.pedido.precoUnitario)}).`,
        valorEnvolvido: excedente * j.pedido.precoUnitario,
      };
    },
  },
  {
    id: "R05",
    descricao: "Recebido sem NF e fechamento próximo",
    avaliar: (j, ctx) => {
      const recebido = qtdRecebida(j);
      if (recebido === 0 || j.notas.length > 0) return null;
      const dias = diasEntre(ctx.hoje, ctx.fechamento);
      if (dias > ctx.diasAlertaFechamento) return null;
      const valor = recebido * j.pedido.precoUnitario;
      return {
        regraId: "R05",
        status: "PROVISIONAR",
        criticidade: "CRITICA",
        responsavel: "Custos",
        proximaAcao: `Provisionar ${brl(valor)} no mês`,
        explicacao: `Material recebido (${recebido} un) sem nota fiscal e faltam ${dias} dias para o fechamento: o custo é deste mês (competência).`,
        valorEnvolvido: valor,
      };
    },
  },
  {
    id: "R06",
    descricao: "Mesmo nº de NF + fornecedor lançado mais de uma vez",
    avaliar: (j) => {
      if (j.notasDuplicadas.length === 0) return null;
      const valor = soma(j.notasDuplicadas.map((n) => n.valorTotal));
      const numeros = [...new Set(j.notasDuplicadas.map((n) => n.nfNumero))].join(", ");
      return {
        regraId: "R06",
        status: "NF_DUPLICADA",
        criticidade: "CRITICA",
        responsavel: "Faturamento",
        proximaAcao: "Bloquear pagamento da duplicata",
        explicacao: `${numeros} aparece mais de uma vez para o mesmo fornecedor: ${brl(valor)} em risco de pagamento em dobro.`,
        valorEnvolvido: valor,
      };
    },
  },
  {
    id: "R07",
    descricao: "Campo obrigatório vazio (crd, fabrica)",
    avaliar: (j) => {
      const faltando = (["crd", "fabrica"] as const).filter((c) => !j.pedido[c]);
      if (faltando.length === 0) return null;
      return {
        regraId: "R07",
        status: "DADOS_INCOMPLETOS",
        criticidade: "MEDIA",
        responsavel: "Compras",
        proximaAcao: "Completar cadastro do pedido",
        explicacao: `Pedido sem: ${faltando.join(", ")}. Sem isso não dá para ligar o item à fábrica nem ao custo.`,
        valorEnvolvido: 0,
      };
    },
  },
  {
    id: "R08",
    descricao: "Soma do rateio ≠ 100%",
    avaliar: (j) => {
      const total = soma(j.rateios.map((r) => r.percentual));
      if (total === 100) return null;
      return {
        regraId: "R08",
        status: "RATEIO_INCOMPLETO",
        criticidade: "ALTA",
        responsavel: "Custos",
        proximaAcao: "Completar rateio antes do lançamento no SAP",
        explicacao: `Rateio soma ${total}%: ${100 - total}% do custo (${brl(j.pedido.valorTotal * (100 - total) / 100)}) está sem centro de custo.`,
        valorEnvolvido: (j.pedido.valorTotal * Math.abs(100 - total)) / 100,
      };
    },
  },
];
