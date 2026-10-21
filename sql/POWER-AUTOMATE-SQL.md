# Fluxo com SQL Server (em vez de lista do SharePoint)

```
Excel → [Executar script] Office Script → JSON
      → [SQL Server: Executar procedimento armazenado (V2)] dbo.sp_registrar_conciliacao(@resultado = JSON)
      → resultado da procedure = pendências críticas abertas → Teams
```

1 chamada ao banco por execução (não 1 insert por linha). Idempotência, histórico e
"resolvida automaticamente" ficam dentro da procedure.

## 1. Banco (5 min)

Rode `schema.sql` no banco (SSMS, Azure Data Studio ou DBeaver). Cria:
- `execucao_conciliacao`: cada rodada + JSON original (auditoria)
- `pendencia`: a fila, com situação ABERTA / EM_ANALISE / RESOLVIDA
- `sp_registrar_conciliacao`: grava tudo numa transação
- `vw_fila_pendencias`: a fila para mostrar na demo

## 2. Conexão no Power Automate (via URL/nome do servidor)

Conector **SQL Server** → nova conexão:
- **Tipo de autenticação:** SQL Server Authentication (usuário/senha do banco) — o mais rápido para o hack.
- **Nome do servidor SQL:** a URL do servidor, ex. `meuservidor.empresa.com` ou `xyz.database.windows.net`
  (porta diferente de 1433: `servidor,porta`).
- **Nome do banco de dados:** o nome da base.
- **Gateway:** só se o servidor estiver **na rede interna**. O Power Automate roda na nuvem da Microsoft;
  se ele não alcança a URL, precisa do *on-premises data gateway* instalado numa máquina da rede.
  Pergunte ao responsável pelo banco: "esse servidor é acessível pela nuvem ou precisa de gateway?"

Observação: o conector SQL Server é **premium**. Confirme a licença.

## 3. Fluxo

1. Gatilho (manual para a demo, ou "quando um arquivo é criado" no SharePoint/OneDrive).
2. **Excel Online (Business) → Executar script** (`Conciliacao`; parâmetros hoje/fechamento/tolerância).
3. **SQL Server → Executar procedimento armazenado (V2)**
   - Procedimento: `[dbo].[sp_registrar_conciliacao]`
   - `resultado`: `string(outputs('Executar_script')?['body/result'])`
   - `arquivo_origem`: nome/caminho do arquivo do gatilho
4. **Aplicar a cada** → `body('Executar_procedimento_armazenado_(V2)')?['resultsets/Table1']`
   - **Teams → Postar mensagem**: `pedido_id`, `explicacao`, `proxima_acao`.

## 4. Demo

`SELECT * FROM dbo.vw_fila_pendencias ORDER BY peso DESC, valor_envolvido DESC;`

Rodar o fluxo duas vezes mostra a idempotência (não duplica). Corrigir um dado no Excel
(ex.: completar o rateio do P009) e rodar de novo mostra a pendência virando RESOLVIDA por SISTEMA.

## Plano B se o conector SQL não funcionar

**SQL Server → Executar uma consulta SQL (V2)** tem as mesmas restrições de conexão.
Se não houver acesso ao banco a partir da nuvem, use a lista do SharePoint (`../office-script/POWER-AUTOMATE.md`)
e mostre o `schema.sql` como o desenho da evolução.
