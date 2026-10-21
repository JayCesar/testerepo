# Gestão de Folheteria: plano do dia

## A ideia em 3 linhas (para abrir com o grupo)

Hoje a conferência pedido × recebimento × NF × rateio é manual, espalhada em planilha, e-mail e SAP (19h/mês).
Proposta: um **motor de conciliação** que junta tudo por pedido, aplica regras configuráveis e gera uma
**fila de exceções** priorizada, com explicação de cada divergência e decisão sensível sempre humana.

O motor já existe neste pacote, rodando na massa fictícia, com 12 testes passando. O dia fica para validar regras, fazer as telas e o pitch.

## Roteiro do dia

| Bloco | O quê | Saída |
|---|---|---|
| 1. Abertura (15 min) | Mostrar esta página e o `npm start` para o grupo | Grupo alinhado na ideia (ou ajusta) |
| 2. Example Mapping (30–45 min) | Com alguém do negócio: passar regra por regra do `features/conciliacao.feature` | Regras corrigidas + dúvidas respondidas |
| 3. Ajustar motor (30 min) | Mudar regras/massa conforme o que o negócio disse; testes verdes | Motor validado |
| 4. Telas (maior bloco) | Fila de pendências, timeline do pedido, painel de indicadores | Demo navegável |
| 5. IA (opcional, só se sobrar) | Explicar divergência em linguagem natural ou ler NF em PDF | Diferencial |
| 6. Pitch (última 1h–1h30) | Roteiro abaixo + ensaio cronometrado | Apresentação |

**Cortar escopo na metade do tempo.** Se as telas atrasarem, IA sai primeiro.

## Divisão sugerida

- **Motor + dados (você):** ajustar regras após o Example Mapping, servir `saida.json` para o front.
- **Front (1–2 pessoas):** 3 telas consumindo o `saida.json` (`npm run json` gera).
- **Negócio/pitch (1 pessoa):** destrinchar as 19h por atividade e montar o antes/depois.

## Perguntas para o negócio (antes de codar)

**Pessoas**
- Quem usa: Compras, Faturamento, Custos? Quem sofre mais hoje?
- Quem aprova o quê? (segregação de funções)

**Processo**
- Das 19h/mês, qual atividade consome mais tempo?
- O que é exatamente o CRD?
- Quando é o fechamento e a janela de provisão?
- Hoje, como se descobre uma divergência? Quando?

**Dados**
- Qual campo liga a jornada: pedido, CRD, NF, chave composta?
- Uma NF cobre vários pedidos? Um pedido tem várias NFs?
- O que já está no SAP e o que é planilha manual?

**Regras**
- Tolerância aceitável de valor e quantidade?
- Recebimento parcial é comum?
- Quando a NF vem errada, quem contesta e como?
- Validar as 9 regras do `.feature`: "está certo? falta alguma?"

**Hackathon**
- Stack e ambiente liberados? Acesso a LLM? Formato e duração do pitch?

**Saia do Example Mapping com 3 coisas:** regras corrigidas, a atividade principal das 19h e a persona principal.

## As 3 telas da demo

1. **Fila de pendências:** lista ordenada por criticidade, com responsável e próxima ação. (Dimensões: Automação, Qualidade, Antecipação)
2. **Timeline do pedido:** pedido → recebimento → NF → rateio, com origem e evidência de cada passo e as pendências. (Rastreabilidade, Explicabilidade)
3. **Painel:** conciliados automaticamente, divergências em R$, alertas antecipatórios, horas antes × depois. (Impacto)

## Roteiro do pitch (5 min)

1. **Dor (30s):** "19h/mês conferindo linha a linha, e ainda assim a diferença de custo aparece só no fechamento."
2. **Ideia (30s):** junta → confere → avisa → explica. Humano decide o sensível.
3. **Demo (2min):** abrir a fila → clicar no P005 (NF duplicada, R$ 2.400 que seriam pagos em dobro) → clicar no P004 (provisão antes do fechamento).
4. **Números (1min):** R$ 3.300 em divergências detectadas na massa, 1 alerta antecipatório, horas antes × depois por atividade.
5. **Governança e próximos passos (1min):** regras como configuração com dono definido, trilha de auditoria, segregação de funções, dados fictícios. Evolução: ler direto do SAP, IA para extrair NF.

**Frase-chave:** "não automatizamos uma planilha, redesenhamos a jornada."

## Respostas prontas para a banca

- **"Escala para outros fornecedores/fábricas?"** Regras são configuração; novo fornecedor é dado, não código.
- **"E a IA decide pagamento?"** Não. IA só explica e sugere; aprovação é humana (premissa do case).
- **"Como mede as 19h?"** Linha de base por atividade, antes e depois; % de pedidos conciliados sem toque humano.
- **"Não só transfere esforço para outra área?"** Cada pendência tem um dono e uma próxima ação; o esforço vira exceção, não conferência total.
