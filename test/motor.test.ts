// Testes no formato BDD (Dado / Quando / Então), usando o gabarito de regras-e-cenarios.md.
// node:test é nativo do Node: zero instalação. No time, troque pelo Jest/Vitest/Jasmine que usarem.
import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { carregarBase } from "../src/csv.ts";
import { conciliarBase, indicadores } from "../src/motor.ts";
import type { Contexto, ResultadoPedido } from "../src/tipos.ts";

const ctx: Contexto = { hoje: "2026-10-28", fechamento: "2026-10-31", toleranciaValorUnitario: 0.02, diasAlertaFechamento: 3 };
const base = carregarBase(new URL("../data", import.meta.url).pathname);
const resultados = conciliarBase(base, ctx);
const de = (id: string): ResultadoPedido => resultados.find((r) => r.pedidoId === id)!;
const statusDe = (id: string) => de(id).pendencias.map((p) => p.status);

describe("Funcionalidade: conciliação de folheteria (pedido × recebimento × NF × rateio)", () => {
  it("Cenário P001 — Dado pedido recebido por inteiro, NF igual e rateio 100%, Então fica CONCILIADO", () => {
    assert.equal(de("P001").statusPrincipal, "CONCILIADO");
    assert.equal(de("P001").pendencias.length, 0);
  });

  it("Cenário P002 — Dado 12.000 de 20.000 recebidos e prazo vencido, Então RECEBIMENTO_PARCIAL_ATRASADO para Compras", () => {
    assert.equal(de("P002").statusPrincipal, "RECEBIMENTO_PARCIAL_ATRASADO");
    assert.equal(de("P002").pendencias[0].responsavel, "Compras");
  });

  it("Cenário P003 — Dado NF a R$ 1,32 contra pedido a R$ 1,20, Então DIVERGENCIA_VALOR de R$ 600", () => {
    assert.equal(de("P003").statusPrincipal, "DIVERGENCIA_VALOR");
    assert.equal(de("P003").pendencias[0].valorEnvolvido.toFixed(2), "600.00");
  });

  it("Cenário P004 — Dado recebido sem NF a 3 dias do fechamento, Então PROVISIONAR R$ 4.000 (crítico)", () => {
    assert.equal(de("P004").statusPrincipal, "PROVISIONAR");
    assert.equal(de("P004").criticidade, "CRITICA");
    assert.equal(de("P004").pendencias[0].valorEnvolvido, 4000);
  });

  it("Cenário P004 — Quando o fechamento está longe, Então NÃO alerta ainda", () => {
    const longe = conciliarBase(base, { ...ctx, hoje: "2026-10-27", fechamento: "2026-11-30" });
    assert.ok(!longe.find((r) => r.pedidoId === "P004")!.pendencias.some((p) => p.status === "PROVISIONAR"));
  });

  it("Cenário P005 — Dado a mesma NF lançada duas vezes, Então NF_DUPLICADA com R$ 2.400 em risco", () => {
    assert.equal(de("P005").statusPrincipal, "NF_DUPLICADA");
    assert.equal(de("P005").pendencias[0].valorEnvolvido, 2400);
  });

  it("Cenário P006 — Dado NF de 15.000 e 14.000 recebidos, Então COBRADO_SEM_RECEBIMENTO (R$ 300) + PARCIAL_ATRASADO", () => {
    assert.deepEqual(statusDe("P006").sort(), ["COBRADO_SEM_RECEBIMENTO", "RECEBIMENTO_PARCIAL_ATRASADO"]);
    assert.equal(de("P006").statusPrincipal, "COBRADO_SEM_RECEBIMENTO"); // maior criticidade vence
    assert.equal(de("P006").pendencias[0].valorEnvolvido.toFixed(2), "300.00");
  });

  it("Cenário P007 — Dado pedido sem CRD e sem fábrica, Então DADOS_INCOMPLETOS", () => {
    assert.equal(de("P007").statusPrincipal, "DADOS_INCOMPLETOS");
  });

  it("Cenário P008 — Dado pedido ainda dentro do prazo e sem recebimento, Então EM_ANDAMENTO e sem provisão", () => {
    assert.equal(de("P008").statusPrincipal, "EM_ANDAMENTO");
    assert.equal(de("P008").pendencias.length, 0);
  });

  it("Cenário P009 — Dado rateio somando 70%, Então RATEIO_INCOMPLETO", () => {
    assert.equal(de("P009").statusPrincipal, "RATEIO_INCOMPLETO");
  });

  it("A fila vem ordenada: críticos primeiro", () => {
    assert.equal(resultados[0].criticidade, "CRITICA");
  });

  it("Indicadores batem com os números do pitch", () => {
    const k = indicadores(resultados);
    assert.equal(k.conciliadosAutomaticamente, 1);
    assert.equal(k.valorDivergenciasDetectadas, 3300);
    assert.equal(k.alertasAntecipatorios, 1);
  });
});
