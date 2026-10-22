# Fluxo Power Automate — recepção e validação de Excel por e-mail

👉 **Passo a passo completo, para quem nunca usou o Power Automate: [TUTORIAL.md](TUTORIAL.md)**

## Regra principal

**Só guarda o que está certo.** Arquivo errado volta para o remetente e não fica salvo nem registrado.

## Resumo do fluxo

1. **E-mail chega:** dispara pelo assunto, só com anexo `.xlsx`.
2. **Já aceito?** Se esse e-mail já foi aceito antes, para (idempotência por e-mail).
3. **Salva na Temp:** só para o Excel conseguir rodar o script de validação.
4. **Valida:** campos vazios e fábrica em sigla (Office Script `office-script/validacao.ts`), que também calcula o hash do conteúdo.
5. **Se errado:** responde ao remetente com tabela de erros + arquivo marcado, avisa o time, **apaga da Temp**. Nada é registrado.
6. **Se certo e repetido** (mesmo hash de arquivo já aceito): responde "já recebido em DD/MM", apaga da Temp (idempotência por conteúdo).
7. **Se certo e novo:** move para `teste/Validados`, **registra na lista ArquivosRecebidos**, confirma ao remetente.
8. **Se o fluxo falhar:** escopo Catch avisa por e-mail.

```
teste/
 ├─ Temp        ← só durante a validação (segundos)
 └─ Validados   ← só arquivos certos e não repetidos
```

## Arquivos

| Arquivo | O que é |
|---|---|
| [TUTORIAL.md](TUTORIAL.md) | Tutorial detalhado: conceitos, idempotência, SharePoint, script, fluxo etapa por etapa, testes, problemas comuns, expressões |
| [office-script/validacao.ts](office-script/validacao.ts) | Office Script de validação (retorna `valido`, `mensagem`, `hash`, `erros`) |
