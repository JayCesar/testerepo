// Motor de conciliação: JUNTA (por pedido) → CONFERE (regras) → PRIORIZA (criticidade).
import type { Base } from "./csv.ts";
import { REGRAS, type Regra } from "./regras.ts";
import type { Contexto, Criticidade, JornadaPedido, ResultadoPedido } from "./tipos.ts";

const PESO: Record<Criticidade, number> = { CRITICA: 4, ALTA: 3, MEDIA: 2, BAIXA: 1, NENHUMA: 0 };

// 1. JUNTA: monta a jornada de cada pedido a partir das fontes separadas.
//    A chave da jornada é o pedido_id (hipótese a validar com o negócio: pedido? CRD? NF?).
export function montarJornadas(base: Base): JornadaPedido[] {
  // Duplicidade é checada na base inteira (como idempotência em consumidor de fila)
  const contagem = new Map<string, number>();
  for (const n of base.notas) {
    const chave = `${n.fornecedorId}|${n.nfNumero}`;
    contagem.set(chave, (contagem.get(chave) ?? 0) + 1);
  }

  return base.pedidos.map((pedido) => {
    const notas = base.notas.filter((n) => n.pedidoId === pedido.pedidoId);
    return {
      pedido,
      recebimentos: base.recebimentos.filter((r) => r.pedidoId === pedido.pedidoId),
      notas,
      rateios: base.rateios.filter((r) => r.pedidoId === pedido.pedidoId),
      // guarda só as ocorrências excedentes (a partir da 2ª)
      notasDuplicadas: notas.filter((n, i) => {
        const chave = `${n.fornecedorId}|${n.nfNumero}`;
        const primeira = notas.findIndex((m) => `${m.fornecedorId}|${m.nfNumero}` === chave);
        return (contagem.get(chave) ?? 0) > 1 && i !== primeira;
      }),
    };
  });
}

// 2. CONFERE: aplica todas as regras a uma jornada.
export function conciliar(j: JornadaPedido, ctx: Contexto, regras: Regra[] = REGRAS): ResultadoPedido {
  const pendencias = regras
    .map((r) => r.avaliar(j, ctx))
    .filter((p) => p !== null)
    .sort((a, b) => PESO[b.criticidade] - PESO[a.criticidade]);

  if (pendencias.length > 0) {
    return {
      pedidoId: j.pedido.pedidoId,
      statusPrincipal: pendencias[0].status,
      criticidade: pendencias[0].criticidade,
      pendencias,
    };
  }

  // Sem pendência: ou está tudo conciliado, ou o pedido ainda está em andamento.
  const recebeuTudo = j.recebimentos.reduce((a, r) => a + r.quantidade, 0) >= j.pedido.quantidade;
  const temNota = j.notas.length > 0;
  return {
    pedidoId: j.pedido.pedidoId,
    statusPrincipal: recebeuTudo && temNota ? "CONCILIADO" : "EM_ANDAMENTO",
    criticidade: recebeuTudo && temNota ? "NENHUMA" : "BAIXA",
    pendencias: [],
  };
}

// 3. PRIORIZA: resultado de todos os pedidos, mais urgente primeiro (é a "fila de exceções").
export function conciliarBase(base: Base, ctx: Contexto): ResultadoPedido[] {
  return montarJornadas(base)
    .map((j) => conciliar(j, ctx))
    .sort((a, b) => PESO[b.criticidade] - PESO[a.criticidade]);
}

// Indicadores do case (seção "Indicadores sugeridos")
export function indicadores(resultados: ResultadoPedido[]) {
  const total = resultados.length;
  const conciliados = resultados.filter((r) => r.statusPrincipal === "CONCILIADO").length;
  const comPendencia = resultados.filter((r) => r.pendencias.length > 0);
  const valorDivergencias = comPendencia
    .flatMap((r) => r.pendencias)
    .filter((p) => ["DIVERGENCIA_VALOR", "COBRADO_SEM_RECEBIMENTO", "NF_DUPLICADA"].includes(p.status))
    .reduce((a, p) => a + p.valorEnvolvido, 0);
  return {
    pedidos: total,
    conciliadosAutomaticamente: conciliados,
    comPendencia: comPendencia.length,
    emAndamento: resultados.filter((r) => r.statusPrincipal === "EM_ANDAMENTO").length,
    valorDivergenciasDetectadas: Math.round(valorDivergencias * 100) / 100,
    alertasAntecipatorios: comPendencia.filter((r) => r.pendencias.some((p) => p.status === "PROVISIONAR")).length,
  };
}
