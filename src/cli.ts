// Roda o motor na massa e imprime a fila de pendências + indicadores.
// Uso: npm start            (tabela no terminal)
//      npm run json         (gera saida.json para o front consumir)
import { writeFileSync } from "node:fs";
import { carregarBase } from "./csv.ts";
import { conciliarBase, indicadores } from "./motor.ts";
import type { Contexto } from "./tipos.ts";

export const CONTEXTO_DEMO: Contexto = {
  hoje: "2026-10-28",
  fechamento: "2026-10-31",
  toleranciaValorUnitario: 0.02,
  diasAlertaFechamento: 3,
};

const base = carregarBase(new URL("../data", import.meta.url).pathname);
const resultados = conciliarBase(base, CONTEXTO_DEMO);
const kpis = indicadores(resultados);

if (process.argv.includes("--json")) {
  writeFileSync("saida.json", JSON.stringify({ contexto: CONTEXTO_DEMO, indicadores: kpis, resultados }, null, 2));
  console.log("saida.json gerado");
} else {
  console.log("\nFILA DE PENDÊNCIAS (mais urgente primeiro)\n");
  for (const r of resultados) {
    console.log(`${r.pedidoId}  [${r.criticidade}]  ${r.statusPrincipal}`);
    for (const p of r.pendencias) console.log(`   - ${p.responsavel}: ${p.explicacao} → ${p.proximaAcao}`);
  }
  console.log("\nINDICADORES\n", kpis);
}
