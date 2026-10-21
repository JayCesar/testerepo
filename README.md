# Motor de conciliação — Folheteria

Junta pedido, recebimento, NF e rateio por pedido, aplica regras e gera a fila de pendências priorizada.
Dados 100% fictícios.

## Rodar (Node 22.6+, sem `npm install`)

```bash
npm test        # 12 cenários do gabarito, formato Dado/Quando/Então
npm start       # fila de pendências + indicadores no terminal
npm run json    # gera saida.json para o front
```

## Estrutura

```
data/                 4 CSVs fictícios (as fontes fragmentadas)
src/tipos.ts          modelo de domínio
src/csv.ts            leitura dos CSVs
src/regras.ts         regras como configuração (R02–R08) ← o que mais vai mudar amanhã
src/motor.ts          junta → confere → prioriza + indicadores
src/cli.ts            execução da demo (datas de referência: hoje 28/10, fechamento 31/10)
test/motor.test.ts    gabarito como testes
features/*.feature    os mesmos cenários em Gherkin, para o Example Mapping com o negócio
```

## Como mudar uma regra

1. Ajuste o cenário no `.feature` e o teste correspondente em `test/motor.test.ts` (fica vermelho).
2. Ajuste a regra em `src/regras.ts`.
3. `npm test` verde.

## Se o ambiente não tiver Node 22

O motor é TypeScript puro sem dependência. Dá para colar `regras.ts` e `motor.ts` dentro de um service Angular
(ou num script com `tsc`) sem mudar a lógica.

## Documentos

- `PLANO-AMANHA.md`: roteiro do dia, perguntas para o negócio, telas e pitch
- `regras-e-cenarios.md`: tabela de regras + gabarito

## Versão Microsoft 365 (Power Automate + Office Script)

Ver `office-script/POWER-AUTOMATE.md` (SharePoint) ou `sql/POWER-AUTOMATE-SQL.md` (SQL Server). Script: `office-script/conciliacao.ts`. Planilha de exemplo: `office-script/folheteria-exemplo.xlsx`.
