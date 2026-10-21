// Office Script: motor de conciliação de folheteria.
// Como usar: Excel Online → aba "Automatizar" → "Novo script" → cole este arquivo inteiro → Salvar.
// Abas esperadas (linha 1 = cabeçalho, mesmos nomes de coluna dos CSVs de data/):
//   Pedidos | Recebimentos | NotasFiscais | Rateios
// Saída: aba "Pendencias" com a tabela "TabelaPendencias" + retorno em JSON para o Power Automate.

type Celula = string | number | boolean;
type Registro = { [coluna: string]: Celula };

interface Pendencia {
  pedidoId: string;
  regraId: string;
  status: string;
  criticidade: string;
  responsavel: string;
  proximaAcao: string;
  explicacao: string;
  valorEnvolvido: number;
}

interface Resultado {
  pedidos: number;
  conciliados: number;
  comPendencia: number;
  valorDivergencias: number;
  alertasAntecipatorios: number;
  pendencias: Pendencia[];
}

const PESO: { [c: string]: number } = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1 };

// hoje / fechamento chegam do Power Automate no formato yyyy-mm-dd.
// Se vierem vazios, usa a data de hoje e o último dia do mês.
function main(
  workbook: ExcelScript.Workbook,
  hoje?: string,
  fechamento?: string,
  toleranciaPercentual?: number,
  diasAlerta?: number
): Resultado {
  const agora = new Date();
  const dataHoje = hoje && hoje !== "" ? hoje : agora.toISOString().slice(0, 10);
  const dataFechamento =
    fechamento && fechamento !== ""
      ? fechamento
      : new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  const tolerancia = (toleranciaPercentual ?? 2) / 100;
  const alerta = diasAlerta ?? 3;

  const pedidos = lerAba(workbook, "Pedidos");
  const recebimentos = lerAba(workbook, "Recebimentos");
  const notas = lerAba(workbook, "NotasFiscais");
  const rateios = lerAba(workbook, "Rateios");

  // Duplicidade de NF na base inteira (fornecedor + número)
  const contagemNF: { [chave: string]: number } = {};
  notas.forEach((n) => {
    const chave = texto(n["fornecedor_id"]) + "|" + texto(n["nf_numero"]);
    contagemNF[chave] = (contagemNF[chave] ?? 0) + 1;
  });

  const pendencias: Pendencia[] = [];
  let conciliados = 0;

  pedidos.forEach((p) => {
    const id = texto(p["pedido_id"]);
    const qtdPedido = numero(p["quantidade"]);
    const preco = numero(p["preco_unitario"]);
    const prazo = data(p["prazo_entrega"]);

    const recs = recebimentos.filter((r) => texto(r["pedido_id"]) === id);
    const nfs = notas.filter((n) => texto(n["pedido_id"]) === id);
    const rats = rateios.filter((r) => texto(r["pedido_id"]) === id);

    // separa NFs válidas das duplicadas (2ª ocorrência em diante)
    const vistas: { [chave: string]: boolean } = {};
    const nfsValidas: Registro[] = [];
    const nfsDuplicadas: Registro[] = [];
    nfs.forEach((n) => {
      const chave = texto(n["fornecedor_id"]) + "|" + texto(n["nf_numero"]);
      if (vistas[chave]) nfsDuplicadas.push(n);
      else {
        vistas[chave] = true;
        nfsValidas.push(n);
      }
    });

    const recebido = soma(recs.map((r) => numero(r["quantidade"])));
    const faturado = soma(nfsValidas.map((n) => numero(n["quantidade"])));
    const totalRateio = soma(rats.map((r) => numero(r["percentual"])));
    const doPedido: Pendencia[] = [];
    const add = (x: Pendencia) => doPedido.push(x);

    // R02 Recebimento parcial com prazo vencido
    if (recebido > 0 && recebido < qtdPedido && dataHoje > prazo) {
      const saldo = qtdPedido - recebido;
      add(pend(id, "R02", "RECEBIMENTO_PARCIAL_ATRASADO", "MEDIA", "Compras", "Cobrar fornecedor do saldo",
        `Recebidas ${recebido} de ${qtdPedido} unidades; faltam ${saldo} e o prazo venceu em ${prazo}.`, saldo * preco));
    }

    // R03 Divergência de valor unitário
    const nfCara = nfsValidas.find((n) => Math.abs(numero(n["valor_unitario"]) - preco) / preco > tolerancia);
    if (nfCara) {
      const vu = numero(nfCara["valor_unitario"]);
      const dif = (vu - preco) * numero(nfCara["quantidade"]);
      add(pend(id, "R03", "DIVERGENCIA_VALOR", "ALTA", "Faturamento", "Contestar NF ou validar reajuste (decisão humana)",
        `${texto(nfCara["nf_numero"])} cobra ${brl(vu)}/un e o pedido é ${brl(preco)}/un (${((vu / preco - 1) * 100).toFixed(1)}%), diferença de ${brl(dif)}.`,
        Math.abs(dif)));
    }

    // R04 Cobrado sem recebimento
    if (faturado > 0 && faturado > recebido) {
      const exc = faturado - recebido;
      add(pend(id, "R04", "COBRADO_SEM_RECEBIMENTO", "ALTA", "Faturamento", "Pedir NF corrigida / bloquear pagamento do excedente",
        `Faturadas ${faturado} unidades, mas só ${recebido} recebidas: ${exc} cobradas sem entrega (${brl(exc * preco)}).`, exc * preco));
    }

    // R05 Recebido sem NF perto do fechamento → provisionar
    const diasParaFechar = Math.round((Date.parse(dataFechamento) - Date.parse(dataHoje)) / 86400000);
    if (recebido > 0 && nfs.length === 0 && diasParaFechar <= alerta) {
      const v = recebido * preco;
      add(pend(id, "R05", "PROVISIONAR", "CRITICA", "Custos", `Provisionar ${brl(v)} no mês`,
        `Material recebido (${recebido} un) sem nota fiscal e faltam ${diasParaFechar} dias para o fechamento.`, v));
    }

    // R06 NF duplicada
    if (nfsDuplicadas.length > 0) {
      const v = soma(nfsDuplicadas.map((n) => numero(n["valor_total"])));
      add(pend(id, "R06", "NF_DUPLICADA", "CRITICA", "Faturamento", "Bloquear pagamento da duplicata",
        `${texto(nfsDuplicadas[0]["nf_numero"])} lançada mais de uma vez: ${brl(v)} em risco de pagamento em dobro.`, v));
    }

    // R07 Dados incompletos
    const faltando = ["crd", "fabrica"].filter((c) => texto(p[c]) === "");
    if (faltando.length > 0) {
      add(pend(id, "R07", "DADOS_INCOMPLETOS", "MEDIA", "Compras", "Completar cadastro do pedido",
        `Pedido sem: ${faltando.join(", ")}.`, 0));
    }

    // R08 Rateio diferente de 100%
    if (totalRateio !== 100) {
      const v = (numero(p["valor_total"]) * Math.abs(100 - totalRateio)) / 100;
      add(pend(id, "R08", "RATEIO_INCOMPLETO", "ALTA", "Custos", "Completar rateio antes do lançamento no SAP",
        `Rateio soma ${totalRateio}%: ${brl(v)} sem centro de custo.`, v));
    }

    if (doPedido.length === 0 && recebido >= qtdPedido && nfs.length > 0) conciliados++;
    doPedido.forEach((x) => pendencias.push(x));
  });

  pendencias.sort((a, b) => PESO[b.criticidade] - PESO[a.criticidade]);
  escreverPendencias(workbook, pendencias);

  const pedidosComPendencia: { [id: string]: boolean } = {};
  pendencias.forEach((x) => (pedidosComPendencia[x.pedidoId] = true));

  return {
    pedidos: pedidos.length,
    conciliados,
    comPendencia: Object.keys(pedidosComPendencia).length,
    valorDivergencias: arred(soma(pendencias
      .filter((x) => x.status === "DIVERGENCIA_VALOR" || x.status === "COBRADO_SEM_RECEBIMENTO" || x.status === "NF_DUPLICADA")
      .map((x) => x.valorEnvolvido))),
    alertasAntecipatorios: pendencias.filter((x) => x.status === "PROVISIONAR").length,
    pendencias,
  };
}

// ---------- helpers ----------

function lerAba(workbook: ExcelScript.Workbook, nome: string): Registro[] {
  const aba = workbook.getWorksheet(nome);
  if (!aba) throw new Error(`Aba "${nome}" não encontrada`);
  const valores = aba.getUsedRange().getValues() as Celula[][];
  const cabecalho = valores[0].map((c) => texto(c));
  return valores
    .slice(1)
    .filter((linha) => linha.some((c) => texto(c) !== ""))
    .map((linha) => {
      const r: Registro = {};
      cabecalho.forEach((col, i) => (r[col] = linha[i]));
      return r;
    });
}

function escreverPendencias(workbook: ExcelScript.Workbook, pendencias: Pendencia[]) {
  const antiga = workbook.getWorksheet("Pendencias");
  if (antiga) antiga.delete();
  const aba = workbook.addWorksheet("Pendencias");
  const cab = ["pedido_id", "regra", "status", "criticidade", "responsavel", "proxima_acao", "explicacao", "valor_envolvido"];
  const linhas: Celula[][] = pendencias.map((x) => [
    x.pedidoId, x.regraId, x.status, x.criticidade, x.responsavel, x.proximaAcao, x.explicacao, arred(x.valorEnvolvido),
  ]);
  const matriz: Celula[][] = [cab].concat(linhas);
  const intervalo = aba.getRangeByIndexes(0, 0, matriz.length, cab.length);
  intervalo.setValues(matriz);
  const tabela = aba.addTable(intervalo, true);
  tabela.setName("TabelaPendencias");
}

function pend(pedidoId: string, regraId: string, status: string, criticidade: string, responsavel: string,
  proximaAcao: string, explicacao: string, valorEnvolvido: number): Pendencia {
  return { pedidoId, regraId, status, criticidade, responsavel, proximaAcao, explicacao, valorEnvolvido: arred(valorEnvolvido) };
}

function texto(v: Celula | undefined): string {
  return v === undefined || v === null ? "" : String(v).trim();
}
function numero(v: Celula | undefined): number {
  return Number(texto(v).replace(",", ".")) || 0;
}
// Excel guarda data como número serial (ex.: 46323). Converte para yyyy-mm-dd.
function data(v: Celula | undefined): string {
  if (typeof v === "number") return new Date(Math.round((v - 25569) * 86400000)).toISOString().slice(0, 10);
  return texto(v);
}
function soma(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}
function arred(v: number): number {
  return Math.round(v * 100) / 100;
}
function brl(v: number): string {
  return "R$ " + v.toFixed(2).replace(".", ",");
}
