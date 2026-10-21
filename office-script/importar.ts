// Office Script 2 de 2: roda na PLANILHA MESTRE (consolidada).
// Recebe o JSON do "ExportarDados" e acrescenta as linhas no fim da aba de destino.
// Salve como "ImportarDados".
//
// - Se a aba não existir, cria com o cabeçalho do arquivo + arquivo_origem + importado_em.
// - Se a aba já tiver cabeçalho, alinha as colunas PELO NOME (ordem diferente no arquivo não quebra).
// - Se o mesmo arquivo já foi importado, não importa de novo (idempotência).

type Celula = string | number | boolean;

interface ResultadoImportacao {
  importado: boolean;
  linhasImportadas: number;
  mensagem: string;
}

function main(
  workbook: ExcelScript.Workbook,
  dadosJson: string,
  nomeAbaDestino: string,
  arquivoOrigem: string
): ResultadoImportacao {
  const dados = JSON.parse(dadosJson) as Celula[][];
  if (dados.length < 2) return { importado: false, linhasImportadas: 0, mensagem: "Arquivo sem linhas de dados" };

  const cabOrigem = dados[0].map((c) => norm(String(c)));
  const linhasOrigem = dados.slice(1);
  const agora = new Date().toISOString().replace("T", " ").slice(0, 19);

  let aba = workbook.getWorksheet(nomeAbaDestino);
  let cabDestino: string[];

  if (!aba) {
    aba = workbook.addWorksheet(nomeAbaDestino);
    const cab: Celula[] = dados[0].concat(["arquivo_origem", "importado_em"]);
    aba.getRangeByIndexes(0, 0, 1, cab.length).setValues([cab]);
    cabDestino = cab.map((c) => norm(String(c)));
  } else {
    const usado = aba.getUsedRange();
    const valoresDestino = usado ? (usado.getValues() as Celula[][]) : [];
    if (valoresDestino.length === 0) {
      const cab: Celula[] = dados[0].concat(["arquivo_origem", "importado_em"]);
      aba.getRangeByIndexes(0, 0, 1, cab.length).setValues([cab]);
      cabDestino = cab.map((c) => norm(String(c)));
    } else {
      cabDestino = valoresDestino[0].map((c) => norm(String(c)));
      // idempotência: esse arquivo já entrou?
      const iOrigem = cabDestino.indexOf("arquivo_origem");
      if (iOrigem >= 0 && valoresDestino.slice(1).some((l) => String(l[iOrigem]) === arquivoOrigem)) {
        return { importado: false, linhasImportadas: 0, mensagem: `Arquivo "${arquivoOrigem}" já tinha sido importado` };
      }
    }
  }

  // monta as linhas na ordem das colunas do destino
  const novas: Celula[][] = linhasOrigem.map((linha) =>
    cabDestino.map((col) => {
      if (col === "arquivo_origem") return arquivoOrigem;
      if (col === "importado_em") return agora;
      const i = cabOrigem.indexOf(col);
      return i >= 0 ? linha[i] : "";
    })
  );

  const usadoAgora = aba.getUsedRange();
  const proximaLinha = usadoAgora ? usadoAgora.getRowIndex() + usadoAgora.getRowCount() : 0;
  aba.getRangeByIndexes(proximaLinha, 0, novas.length, cabDestino.length).setValues(novas);

  const semCorrespondencia = cabOrigem.filter((c) => cabDestino.indexOf(c) < 0);
  return {
    importado: true,
    linhasImportadas: novas.length,
    mensagem: `${novas.length} linha(s) importada(s) em "${nomeAbaDestino}"` +
      (semCorrespondencia.length > 0 ? `. Colunas ignoradas (não existem no destino): ${semCorrespondencia.join(", ")}` : ""),
  };
}

function norm(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, "_");
}
