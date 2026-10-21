// Office Script 1 de 2: roda no ARQUIVO RECEBIDO (já validado).
// Lê a aba de dados e devolve tudo em JSON para o Power Automate passar ao script de importação.
// Salve como "ExportarDados".

function main(workbook: ExcelScript.Workbook, nomeAba?: string): string {
  const aba = nomeAba && nomeAba !== "" ? workbook.getWorksheet(nomeAba) : workbook.getWorksheets()[0];
  if (!aba) throw new Error(`Aba "${nomeAba}" não encontrada`);

  const valores = aba.getUsedRange().getValues() as (string | number | boolean)[][];
  // remove linhas totalmente em branco
  const limpos = valores.filter((linha, i) => i === 0 || linha.some((c) => String(c).trim() !== ""));
  return JSON.stringify(limpos);
}
