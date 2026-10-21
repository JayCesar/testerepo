// Office Script: validação de qualidade do Excel antes de processar.
//  1. Campos nulos/vazios (todas as colunas, ou só as obrigatórias informadas)
//  2. Coluna de fábrica com SIGLA em vez de nome completo
//
// Como usar: Excel Online → Automatizar → Novo script → cole este arquivo → salve como "Validacao".
// Power Automate: Excel Online (Business) → "Executar script" → Validacao.
//
// Parâmetros (todos opcionais no Power Automate):
//   nomeAba              aba a validar (padrão: primeira aba)
//   colunaFabrica        nome do cabeçalho da coluna de fábrica (padrão: "fabrica"; ignora maiúscula e acento)
//   colunasObrigatorias  lista separada por vírgula (padrão: vazio = todas as colunas)
//
// De-para opcional: se existir uma aba "DeParaFabricas" com colunas  sigla | nome_completo,
// o script sugere o nome completo para cada sigla encontrada. Não corrige sozinho (validação humana).
//
// Saída: aba "Validacao" com a tabela "TabelaValidacao", células com erro destacadas
// e um JSON para o Power Automate decidir (campo "ok").

type Celula = string | number | boolean;

interface ErroValidacao {
  linha: number;      // número da linha no Excel (cabeçalho = 1)
  coluna: string;
  valor: string;
  problema: string;   // CAMPO_VAZIO | FABRICA_EM_SIGLA
  sugestao: string;
}

interface ResultadoValidacao {
  ok: boolean;
  aba: string;
  totalLinhas: number;
  linhasComErro: number;
  camposVazios: number;
  fabricasEmSigla: number;
  erros: ErroValidacao[];
}

const COR_VAZIO = "#FFC7CE";  // vermelho claro
const COR_SIGLA = "#FFEB9C";  // amarelo claro

function main(
  workbook: ExcelScript.Workbook,
  nomeAba?: string,
  colunaFabrica?: string,
  colunasObrigatorias?: string
): ResultadoValidacao {
  const aba = nomeAba && nomeAba !== "" ? workbook.getWorksheet(nomeAba) : workbook.getWorksheets()[0];
  if (!aba) throw new Error(`Aba "${nomeAba}" não encontrada`);

  const intervalo = aba.getUsedRange();
  const valores = intervalo.getValues() as Celula[][];
  if (valores.length < 2) {
    return { ok: true, aba: aba.getName(), totalLinhas: 0, linhasComErro: 0, camposVazios: 0, fabricasEmSigla: 0, erros: [] };
  }

  const cabecalho = valores[0].map((c) => texto(c));
  const cabNorm = cabecalho.map((c) => normalizar(c));
  const totalColunas = cabecalho.length;

  // limpa destaques de uma execução anterior (só as linhas de dados)
  intervalo.getOffsetRange(1, 0).getResizedRange(-1, 0).getFormat().getFill().clear();

  const idxFabrica = cabNorm.indexOf(normalizar(colunaFabrica && colunaFabrica !== "" ? colunaFabrica : "fabrica"));
  const obrigatorias: number[] =
    colunasObrigatorias && colunasObrigatorias.trim() !== ""
      ? colunasObrigatorias.split(",").map((c) => cabNorm.indexOf(normalizar(c))).filter((i) => i >= 0)
      : cabecalho.map((_, i) => i);

  const dePara = lerDePara(workbook);
  const erros: ErroValidacao[] = [];
  const linhasComErro: { [linha: number]: boolean } = {};
  let totalLinhas = 0;

  for (let r = 1; r < valores.length; r++) {
    const linha = valores[r];
    if (linha.every((c) => vazio(c))) continue; // ignora linha totalmente em branco
    totalLinhas++;
    const linhaExcel = r + 1;

    // 1. Campos vazios
    obrigatorias.forEach((c) => {
      if (c < totalColunas && vazio(linha[c])) {
        erros.push({ linha: linhaExcel, coluna: cabecalho[c], valor: "", problema: "CAMPO_VAZIO",
          sugestao: `Preencher "${cabecalho[c]}"` });
        intervalo.getCell(r, c).getFormat().getFill().setColor(COR_VAZIO);
        linhasComErro[linhaExcel] = true;
      }
    });

    // 2. Fábrica em sigla
    if (idxFabrica >= 0 && !vazio(linha[idxFabrica])) {
      const valor = texto(linha[idxFabrica]);
      if (pareceSigla(valor)) {
        const nome = dePara[valor.toUpperCase()];
        erros.push({ linha: linhaExcel, coluna: cabecalho[idxFabrica], valor, problema: "FABRICA_EM_SIGLA",
          sugestao: nome ? `Trocar por "${nome}"` : "Informar o nome completo da fábrica" });
        intervalo.getCell(r, idxFabrica).getFormat().getFill().setColor(COR_SIGLA);
        linhasComErro[linhaExcel] = true;
      }
    }
  }

  escreverRelatorio(workbook, erros);

  return {
    ok: erros.length === 0,
    aba: aba.getName(),
    totalLinhas,
    linhasComErro: Object.keys(linhasComErro).length,
    camposVazios: erros.filter((e) => e.problema === "CAMPO_VAZIO").length,
    fabricasEmSigla: erros.filter((e) => e.problema === "FABRICA_EM_SIGLA").length,
    erros,
  };
}

// Sigla = valor curto, sem espaço, sem letra minúscula. Ex.: "SP", "FAB-SP", "CD01", "FAB_RJ".
// Nome completo = tem espaço ou letras minúsculas. Ex.: "Fábrica São Paulo", "Unidade Barueri".
function pareceSigla(valor: string): boolean {
  const v = valor.trim();
  if (v === "") return false;
  const temEspaco = /\s/.test(v);
  const temMinuscula = /[a-zà-ÿ]/.test(v);
  if (!temEspaco && !temMinuscula) return true;          // "FAB-SP", "SP", "CD01"
  if (!temEspaco && v.length <= 4) return true;          // "Sp", "Rj1"
  return false;
}

function lerDePara(workbook: ExcelScript.Workbook): { [sigla: string]: string } {
  const mapa: { [sigla: string]: string } = {};
  const aba = workbook.getWorksheet("DeParaFabricas");
  if (!aba) return mapa;
  const v = aba.getUsedRange().getValues() as Celula[][];
  for (let i = 1; i < v.length; i++) {
    const sigla = texto(v[i][0]).toUpperCase();
    const nome = texto(v[i][1]);
    if (sigla !== "" && nome !== "") mapa[sigla] = nome;
  }
  return mapa;
}

function escreverRelatorio(workbook: ExcelScript.Workbook, erros: ErroValidacao[]) {
  const antiga = workbook.getWorksheet("Validacao");
  if (antiga) antiga.delete();
  const aba = workbook.addWorksheet("Validacao");
  const cab: Celula[] = ["linha", "coluna", "valor", "problema", "sugestao"];
  const linhas: Celula[][] = erros.length > 0
    ? erros.map((e) => [e.linha, e.coluna, e.valor, e.problema, e.sugestao])
    : [["", "", "", "OK", "Nenhum problema encontrado"]];
  const matriz: Celula[][] = [cab].concat(linhas);
  const rng = aba.getRangeByIndexes(0, 0, matriz.length, cab.length);
  rng.setValues(matriz);
  aba.addTable(rng, true).setName("TabelaValidacao");
}

function texto(v: Celula | undefined): string {
  return v === undefined || v === null ? "" : String(v).trim();
}
function vazio(v: Celula | undefined): boolean {
  const t = texto(v).toLowerCase();
  return t === "" || t === "null" || t === "n/a" || t === "na" || t === "-";
}
function normalizar(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").trim().toLowerCase().replace(/\s+/g, "_");
}
