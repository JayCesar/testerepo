// =====================================================================
// COLE AQUI O SEU DE_PARA (o bloco "const DE_PARA ... };" do seu arquivo).
// O de-para abaixo é só um exemplo: os nomes reais ficam no seu script.
// =====================================================================
// De-para: chave = nome abreviado/errado, valor = nome correto.
// Chaves são comparadas normalizadas (maiúsculas, sem acento, espaços colapsados).
const DE_PARA: { [abreviado: string]: string } = {
    "EXEMPLO": "EXEMPLO ARTES GRAFICAS LTDA",
    "EXEMPLO ARTES": "EXEMPLO ARTES GRAFICAS LTDA",
};
// =====================================================================
// DAQUI PARA BAIXO: substitua pelo conteúdo deste arquivo.
// =====================================================================

// headers: nomes aceitos para a coluna (qualquer um serve).
const COLUNAS: { chave: string; headers: string[]; obrigatoria: boolean }[] = [
    { chave: "empresa", headers: ["EMPRESA FORNECEDORA"], obrigatoria: true },
    { chave: "data", headers: ["DATA CHEGADA"], obrigatoria: true },
    { chave: "pedido", headers: ["Nº DO PEDIDO - UBB", "Nº DO PEDIDO DO ITAÚ"], obrigatoria: true },
    { chave: "crd", headers: ["CRD"], obrigatoria: true },
    { chave: "descricao", headers: ["DESCRIÇÃO DA FOLHETERIA"], obrigatoria: true },
    { chave: "qtdeNf", headers: ["QTDE NF"], obrigatoria: true },
    { chave: "qtdeFisica", headers: ["QTDE FÍSICA"], obrigatoria: true },
    { chave: "nf", headers: ["Nº NF"], obrigatoria: true },
    { chave: "aprovacao", headers: ["APROVAÇÃO C.Q."], obrigatoria: true },
    { chave: "transferencia", headers: ["TRANSFERÊNCIA (S/N)"], obrigatoria: true },
    { chave: "agendamento", headers: ["AGENDAMENTO? (S/N)"], obrigatoria: true },
    { chave: "paletizacao", headers: ["PALETIZAÇÃO? (S/N)"], obrigatoria: true },
    { chave: "observacao", headers: ["OBSERVAÇÃO"], obrigatoria: false },
];

type Celula = string | number | boolean;

// Formato de tabela para o e-mail (Select / Create HTML table no Power Automate)
interface ErroTabela {
    linha: number;
    coluna: string;
    valor: string;
    problema: string;   // COLUNA_AUSENTE | CAMPO_VAZIO | QTDE_DIVERGENTE
}

interface Resultado {
    valido: boolean;
    mensagem: string;
    aba?: string;
    hash: string;            // impressão digital do conteúdo (idempotência)
    totalLinhas: number;
    erros: string[];         // mesmo formato de antes (texto)
    errosTabela: ErroTabela[];
    corrigidos: string[];
    avisos: string[];
}

const COR_VAZIO = "#FFC7CE";   // vermelho claro: campo obrigatório vazio
const COR_QTDE = "#FFEB9C";    // amarelo claro: QTDE NF diferente de QTDE FÍSICA

function normalizar(v: Celula): string {
    return String(v)
        .normalize("NFD").replace(/[̀-ͯ]/g, "")
        .replace(/\s+/g, " ")
        .trim()
        .toUpperCase();
}

function vazio(v: Celula): boolean {
    return v === null || v === undefined || String(v).trim() === "";
}

function main(workbook: ExcelScript.Workbook): Resultado {
    const erros: string[] = [];
    const errosTabela: ErroTabela[] = [];
    const corrigidos: string[] = [];
    const avisos: string[] = [];

    const DE_PARA_NORM: { [k: string]: string } = {};
    const NOMES_CORRETOS: { [k: string]: boolean } = {};
    Object.keys(DE_PARA).forEach(k => {
        DE_PARA_NORM[normalizar(k)] = DE_PARA[k];
        NOMES_CORRETOS[normalizar(DE_PARA[k])] = true;
    });

    // Localiza aba + linha de cabeçalho (não depende da aba ativa)
    let sheet: ExcelScript.Worksheet | undefined;
    let range: ExcelScript.Range | undefined;
    let values: Celula[][] = [];
    let headerIdx = -1;
    for (const ws of workbook.getWorksheets()) {
        const r = ws.getUsedRange(true);
        if (!r) continue;
        const v = r.getValues() as Celula[][];
        const idx = v.findIndex(row => row.some(c => normalizar(c) === normalizar("EMPRESA FORNECEDORA")));
        if (idx >= 0) {
            sheet = ws; range = r; values = v; headerIdx = idx;
            break;
        }
    }
    if (!sheet || !range) {
        return {
            valido: false,
            mensagem: "Cabeçalho 'EMPRESA FORNECEDORA' não encontrado em nenhuma aba",
            hash: "", totalLinhas: 0, erros, errosTabela, corrigidos, avisos,
        };
    }

    const linhaBase = range.getRowIndex();       // índice 0-based da 1ª linha do usedRange
    const colunaBase = range.getColumnIndex();

    // Mapeia colunas por nome exato normalizado
    const headers = values[headerIdx].map(normalizar);
    const nomesCabecalho = values[headerIdx].map(c => String(c));
    const col: { [chave: string]: number } = {};
    for (const c of COLUNAS) {
        const aceitos = c.headers.map(normalizar);
        const idx = headers.findIndex(h => aceitos.indexOf(h) >= 0);
        if (idx < 0) {
            erros.push(`Coluna '${c.headers.join("' ou '")}' não encontrada no cabeçalho`);
            errosTabela.push({ linha: linhaBase + headerIdx + 1, coluna: c.headers.join(" ou "), valor: "", problema: "COLUNA_AUSENTE" });
        }
        col[c.chave] = idx;
    }
    if (erros.length > 0) {
        return {
            valido: false, mensagem: "Arquivo inválido: cabeçalho incompleto", aba: sheet.getName(),
            hash: calcularHash(values, headerIdx), totalLinhas: 0, erros, errosTabela, corrigidos, avisos,
        };
    }

    const formulasEmpresa = range.getColumn(col["empresa"]).getFormulas();
    const pendentes: { linha: number; novo: string }[] = [];
    const pintar = (i: number, c: number, cor: string) =>
        sheet!.getCell(linhaBase + i, colunaBase + c).getFormat().getFill().setColor(cor);
    let totalLinhas = 0;

    for (let i = headerIdx + 1; i < values.length; i++) {
        const row = values[i];
        if (row.every(vazio)) continue;
        totalLinhas++;
        const linhaExcel = linhaBase + i + 1;

        // Regra 1: sem vazios (exceto colunas não obrigatórias, ex. OBSERVAÇÃO)
        for (const c of COLUNAS) {
            if (c.obrigatoria && vazio(row[col[c.chave]])) {
                const nomeCol = nomesCabecalho[col[c.chave]];
                erros.push(`Linha ${linhaExcel}: '${nomeCol}' vazia`);
                errosTabela.push({ linha: linhaExcel, coluna: nomeCol, valor: "", problema: "CAMPO_VAZIO" });
                pintar(i, col[c.chave], COR_VAZIO);
            }
        }

        // Regra 2: QTDE NF == QTDE FÍSICA
        const nf = row[col["qtdeNf"]];
        const fis = row[col["qtdeFisica"]];
        if (!vazio(nf) && !vazio(fis)) {
            const nNf = Number(nf), nFis = Number(fis);
            const iguais = isFinite(nNf) && isFinite(nFis) ? nNf === nFis : normalizar(nf) === normalizar(fis);
            if (!iguais) {
                erros.push(`Linha ${linhaExcel}: QTDE NF (${nf}) ≠ QTDE FÍSICA (${fis})`);
                errosTabela.push({ linha: linhaExcel, coluna: "QTDE NF x QTDE FÍSICA", valor: `${nf} x ${fis}`, problema: "QTDE_DIVERGENTE" });
                pintar(i, col["qtdeNf"], COR_QTDE);
                pintar(i, col["qtdeFisica"], COR_QTDE);
            }
        }

        // Regra 3: empresa abreviada -> agenda correção (célula com fórmula herda do valor corrigido)
        const empresa = row[col["empresa"]];
        if (vazio(empresa)) continue;
        const correto = DE_PARA_NORM[normalizar(empresa)];
        const ehFormula = String(formulasEmpresa[i][0]).startsWith("=");
        if (correto && correto !== String(empresa) && !ehFormula) {
            pendentes.push({ linha: i, novo: correto });
        } else if (!correto && !NOMES_CORRETOS[normalizar(empresa)] && Object.keys(DE_PARA).length > 0) {
            avisos.push(`Linha ${linhaExcel}: empresa '${empresa}' não está no de-para (verificar se é abreviação)`);
        }
    }

    if (erros.length > 0) {
        return {
            valido: false,
            mensagem: `Arquivo com erro: ${erros.length} problema(s) (valores vazios e/ou QTDE NF diferente de QTDE FÍSICA). Nenhuma correção aplicada.`,
            aba: sheet.getName(),
            hash: calcularHash(values, headerIdx),
            totalLinhas, erros, errosTabela, corrigidos, avisos,
        };
    }

    // Só corrige se não houve erros
    for (const p of pendentes) {
        const cell = sheet.getCell(linhaBase + p.linha, colunaBase + col["empresa"]);
        corrigidos.push(`Linha ${linhaBase + p.linha + 1}: '${values[p.linha][col["empresa"]]}' -> '${p.novo}'`);
        cell.setValue(p.novo);
        values[p.linha][col["empresa"]] = p.novo;   // hash considera o conteúdo já corrigido
    }

    if (Object.keys(DE_PARA).length === 0) avisos.push("DE_PARA vazio: nenhuma empresa abreviada foi verificada");

    return {
        valido: true,
        mensagem: corrigidos.length > 0
            ? `Arquivo válido. ${corrigidos.length} nome(s) de empresa corrigido(s).`
            : "Arquivo válido.",
        aba: sheet.getName(),
        hash: calcularHash(values, headerIdx),
        totalLinhas, erros, errosTabela, corrigidos, avisos,
    };
}

// Hash do conteúdo a partir do cabeçalho (cyrb53 com duas sementes → 26 caracteres hex).
// Mesmo conteúdo = mesmo hash, mesmo com outro nome de arquivo, outro e-mail ou outras cores.
// Ignora linhas totalmente em branco e espaços nas pontas.
function calcularHash(valores: Celula[][], inicio: number): string {
    const texto = valores
        .slice(Math.max(inicio, 0))
        .filter(linha => linha.some(c => String(c).trim() !== ""))
        .map(linha => linha.map(c => String(c).trim()).join("\u001f"))
        .join("\u001e");
    return cyrb53(texto, 1) + cyrb53(texto, 2);
}

function cyrb53(str: string, seed: number): string {
    let h1 = 0xdeadbeef ^ seed;
    let h2 = 0x41c6ce57 ^ seed;
    for (let i = 0; i < str.length; i++) {
        const ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    const n = 4294967296 * (2097151 & h2) + (h1 >>> 0);
    return n.toString(16).padStart(14, "0").slice(-13);
}
