// Leitura dos CSVs. Sem dependências externas de propósito: roda atrás de proxy, sem npm install.
import { readFileSync } from "node:fs";
import { join } from "node:path";
import type { NotaFiscal, Pedido, Rateio, Recebimento } from "./tipos.ts";

// Parser simples: a massa não tem vírgula dentro de campo. Se os dados reais tiverem, troque por uma lib.
function lerLinhas(caminho: string): Record<string, string>[] {
  const linhas = readFileSync(caminho, "utf-8").split(/\r?\n/).filter((l) => l.trim() !== "");
  const cabecalho = linhas[0].split(",");
  return linhas.slice(1).map((linha) => {
    const valores = linha.split(",");
    const registro: Record<string, string> = {};
    cabecalho.forEach((coluna, i) => (registro[coluna] = (valores[i] ?? "").trim()));
    return registro;
  });
}

export type Base = {
  pedidos: Pedido[];
  recebimentos: Recebimento[];
  notas: NotaFiscal[];
  rateios: Rateio[];
};

export function carregarBase(pasta: string): Base {
  const pedidos = lerLinhas(join(pasta, "pedidos.csv")).map((r) => ({
    pedidoId: r.pedido_id,
    dataPedido: r.data_pedido,
    fornecedorId: r.fornecedor_id,
    fornecedor: r.fornecedor,
    materialId: r.material_id,
    descricao: r.descricao,
    crd: r.crd,
    fabrica: r.fabrica,
    quantidade: Number(r.quantidade),
    precoUnitario: Number(r.preco_unitario),
    valorTotal: Number(r.valor_total),
    prazoEntrega: r.prazo_entrega,
    solicitante: r.solicitante,
    aprovadorCompra: r.aprovador_compra,
  }));

  const recebimentos = lerLinhas(join(pasta, "recebimentos.csv")).map((r) => ({
    recebimentoId: r.recebimento_id,
    pedidoId: r.pedido_id,
    dataRecebimento: r.data_recebimento,
    quantidade: Number(r.quantidade),
    local: r.local,
    conferente: r.conferente,
    comprovante: r.comprovante,
  }));

  const notas = lerLinhas(join(pasta, "notas_fiscais.csv")).map((r) => ({
    nfNumero: r.nf_numero,
    fornecedorId: r.fornecedor_id,
    pedidoId: r.pedido_id,
    dataEmissao: r.data_emissao,
    quantidade: Number(r.quantidade),
    valorUnitario: Number(r.valor_unitario),
    valorTotal: Number(r.valor_total),
  }));

  const rateios = lerLinhas(join(pasta, "rateios.csv")).map((r) => ({
    pedidoId: r.pedido_id,
    centroCusto: r.centro_custo,
    percentual: Number(r.percentual),
  }));

  return { pedidos, recebimentos, notas, rateios };
}
