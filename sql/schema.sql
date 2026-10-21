-- Base da conciliação (T-SQL / SQL Server).
-- O Power Automate chama UMA procedure passando o JSON inteiro que o Office Script devolve.
-- Vantagem: 1 chamada em vez de 1 insert por linha, e a regra de idempotência fica no banco.

CREATE TABLE dbo.execucao_conciliacao (
    execucao_id        INT IDENTITY(1,1) PRIMARY KEY,
    executado_em       DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    arquivo_origem     NVARCHAR(400)  NULL,       -- evidência: qual Excel gerou
    pedidos            INT            NOT NULL,
    conciliados        INT            NOT NULL,
    com_pendencia      INT            NOT NULL,
    valor_divergencias DECIMAL(18,2)  NOT NULL,
    alertas_antecipatorios INT        NOT NULL,
    payload            NVARCHAR(MAX)  NOT NULL    -- JSON original, para auditoria
);

CREATE TABLE dbo.pendencia (
    pendencia_id     INT IDENTITY(1,1) PRIMARY KEY,
    pedido_id        NVARCHAR(50)   NOT NULL,
    regra_id         NVARCHAR(10)   NOT NULL,
    status           NVARCHAR(40)   NOT NULL,
    criticidade      NVARCHAR(10)   NOT NULL,
    responsavel      NVARCHAR(100)  NOT NULL,
    proxima_acao     NVARCHAR(400)  NOT NULL,
    explicacao       NVARCHAR(1000) NOT NULL,
    valor_envolvido  DECIMAL(18,2)  NOT NULL,
    situacao         NVARCHAR(20)   NOT NULL DEFAULT 'ABERTA',  -- ABERTA | EM_ANALISE | RESOLVIDA
    aberta_em        DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    atualizada_em    DATETIME2      NOT NULL DEFAULT SYSUTCDATETIME(),
    resolvida_em     DATETIME2      NULL,
    resolvida_por    NVARCHAR(100)  NULL,         -- 'SISTEMA' ou a pessoa (validação humana)
    ultima_execucao_id INT          NOT NULL REFERENCES dbo.execucao_conciliacao(execucao_id)
);

-- No máximo 1 pendência aberta por pedido + regra (idempotência)
CREATE UNIQUE INDEX ux_pendencia_aberta
    ON dbo.pendencia (pedido_id, regra_id)
    WHERE situacao <> 'RESOLVIDA';
GO

CREATE OR ALTER PROCEDURE dbo.sp_registrar_conciliacao
    @resultado      NVARCHAR(MAX),   -- JSON devolvido pelo Office Script
    @arquivo_origem NVARCHAR(400) = NULL
AS
BEGIN
    SET NOCOUNT ON;
    SET XACT_ABORT ON;
    BEGIN TRAN;

    -- 1. Registra a execução (trilha)
    INSERT INTO dbo.execucao_conciliacao
        (arquivo_origem, pedidos, conciliados, com_pendencia, valor_divergencias, alertas_antecipatorios, payload)
    SELECT @arquivo_origem, pedidos, conciliados, comPendencia, valorDivergencias, alertasAntecipatorios, @resultado
    FROM OPENJSON(@resultado) WITH (
        pedidos INT, conciliados INT, comPendencia INT,
        valorDivergencias DECIMAL(18,2), alertasAntecipatorios INT);

    DECLARE @execucao_id INT = SCOPE_IDENTITY();

    -- 2. Pendências desta execução
    SELECT * INTO #atual
    FROM OPENJSON(@resultado, '$.pendencias') WITH (
        pedido_id       NVARCHAR(50)   '$.pedidoId',
        regra_id        NVARCHAR(10)   '$.regraId',
        status          NVARCHAR(40)   '$.status',
        criticidade     NVARCHAR(10)   '$.criticidade',
        responsavel     NVARCHAR(100)  '$.responsavel',
        proxima_acao    NVARCHAR(400)  '$.proximaAcao',
        explicacao      NVARCHAR(1000) '$.explicacao',
        valor_envolvido DECIMAL(18,2)  '$.valorEnvolvido');

    -- 2a. Já existia aberta → atualiza (não duplica)
    UPDATE p SET
        status = a.status, criticidade = a.criticidade, responsavel = a.responsavel,
        proxima_acao = a.proxima_acao, explicacao = a.explicacao, valor_envolvido = a.valor_envolvido,
        atualizada_em = SYSUTCDATETIME(), ultima_execucao_id = @execucao_id
    FROM dbo.pendencia p
    JOIN #atual a ON a.pedido_id = p.pedido_id AND a.regra_id = p.regra_id
    WHERE p.situacao <> 'RESOLVIDA';

    -- 2b. Nova → insere
    INSERT INTO dbo.pendencia
        (pedido_id, regra_id, status, criticidade, responsavel, proxima_acao, explicacao, valor_envolvido, ultima_execucao_id)
    SELECT a.pedido_id, a.regra_id, a.status, a.criticidade, a.responsavel, a.proxima_acao, a.explicacao, a.valor_envolvido, @execucao_id
    FROM #atual a
    WHERE NOT EXISTS (
        SELECT 1 FROM dbo.pendencia p
        WHERE p.pedido_id = a.pedido_id AND p.regra_id = a.regra_id AND p.situacao <> 'RESOLVIDA');

    -- 2c. Estava aberta e sumiu da análise → o problema foi corrigido na origem
    UPDATE p SET situacao = 'RESOLVIDA', resolvida_em = SYSUTCDATETIME(),
                 resolvida_por = 'SISTEMA', atualizada_em = SYSUTCDATETIME()
    FROM dbo.pendencia p
    WHERE p.situacao <> 'RESOLVIDA'
      AND NOT EXISTS (SELECT 1 FROM #atual a WHERE a.pedido_id = p.pedido_id AND a.regra_id = p.regra_id);

    COMMIT;

    -- 3. Devolve as críticas abertas para o Power Automate avisar no Teams
    SELECT pedido_id, status, responsavel, explicacao, proxima_acao, valor_envolvido
    FROM dbo.pendencia
    WHERE situacao <> 'RESOLVIDA' AND criticidade = 'CRITICA'
    ORDER BY valor_envolvido DESC;
END;
GO

-- Fila de pendências para a demo / painel
CREATE OR ALTER VIEW dbo.vw_fila_pendencias AS
SELECT pedido_id, status, criticidade, responsavel, proxima_acao, explicacao, valor_envolvido, situacao, aberta_em,
       CASE criticidade WHEN 'CRITICA' THEN 4 WHEN 'ALTA' THEN 3 WHEN 'MEDIA' THEN 2 ELSE 1 END AS peso
FROM dbo.pendencia
WHERE situacao <> 'RESOLVIDA';
GO
