# Etapa 7 — Insights

Seção 9 do brief. Funções puras sobre os números já calculados, sem IA e sem
texto gerado.

**A regra que atravessa o arquivo inteiro:** cada frase nasce de uma
**distância numérica** entre meta, realizado e ritmo, e carrega o número que a
originou. Se não dá para apontar a conta, a frase não existe. Há teste
conferindo que toda frase gerada contém um número, e que nenhuma contém
"parabéns", "ótimo" ou "excelente".

---

## As três faixas de ritmo

| Ritmo | Tom | O que a frase diz |
|---|---|---|
| < 80% | **prioridade** | O percentual e quanto falta, na unidade real, para voltar ao ritmo |
| 80% a 100% | **recuperável** | "ainda dá para recuperar", com **quanto por dia** nos dias que sobram |
| > 100% | **reconhecimento** | O percentual e a sugestão de manter |

> Pares está em 62% do ritmo — a maior distância dela hoje. Para voltar ao
> ritmo faltam 38 pares.

> Valor em 91% do ritmo: ainda dá para recuperar. São R$ 30,00 por dia nos 20
> dias que faltam.

O "por dia" divide o que falta **da meta do mês** pelos dias que ainda restam —
é a conta que a vendedora consegue executar amanhã.

---

## Hipótese é hipótese

O brief é explícito: comparar o mais forte com o mais fraco e levantar uma
hipótese, **sempre como hipótese a checar na conversa, nunca como
diagnóstico**.

> Conversão em 125% e Valor em 55%. Pode ser que ela fecha com quase todo mundo
> que atende, mas o valor de cada venda é baixo — vale perguntar a ela, não é
> conclusão do app.

A tabela de leituras cobre os pares que fazem sentido na loja (conversão alta
com valor baixo, P.A. alto com conversão baixa, pares alto com valor baixo, e
mais quatro). Fora deles, a frase usa só a distância:

> CRM em 140% e Bolsas em 30%: 110% de diferença entre o melhor e o pior. Vale
> perguntar o que muda de um atendimento para o outro.

Duas travas: a hipótese só aparece com **pelo menos 25% de distância** entre o
melhor e o pior (abaixo disso é ruído), e os testes rejeitam frases no
imperativo — "ela precisa", "o problema dela é", "ela não sabe".

---

## Comparação com a loja

A **maior** distância para a média da loja, para cima ou para baixo, com os
dois números:

> Em P.A. ela está 35% abaixo da loja (70% contra 105%). As colegas estão
> achando um caminho que ela ainda não achou.

Diferença menor que 15 pontos percentuais não vira frase — é ruído.

---

## Perto de virar de faixa

Quando um indicador está a **5% ou menos** de mudar de faixa:

> Bolsas está a 2% de virar de faixa: vale 4 pontos = R$ 60,00.

Não repete o indicador que já está no card "atacar hoje", e não promete reais
para quem não recebe bônus de vendedora — a gerente que vende vê os pontos, sem
o valor.

---

## A escolha das frases

Todos os candidatos são gerados, ordenados por peso e cortados em cinco. O peso
sai da própria distância: quanto pior o ritmo, mais cedo a frase aparece. Uma
frase por assunto, para não tratar o mesmo indicador de dois ângulos.

**Pode devolver menos de três** no começo do mês, quando quase nada foi medido.
É deliberado: frase sem número por trás é pior que silêncio. Indicador
`SEM_MEDICAO` ou `FORA_DA_APURACAO` não gera frase nenhuma.

---

## Na tela

As frases entram logo abaixo do veredito, antes do card "atacar hoje" — é a
ordem da seção 8.3. A cor da borda diz o tom sem precisar de rótulo: vermelho
para prioridade, âmbar para recuperável, verde para reconhecimento, vinho para
hipótese.

Abaixo da lista, uma linha lembra de onde as frases vêm e devolve a decisão
para quem estava lá:

> Cada frase sai de uma distância entre meta, realizado e ritmo. Onde aparece
> "pode ser que", é hipótese para checar na conversa — quem sabe é você, que
> estava lá.

---

## Testes

212 de regra e 34 de navegador.

| Arquivo | Cobre |
|---|---|
| `tests/insights.test.ts` | As três faixas com os números certos, a hipótese se marcando como hipótese, a comparação com a loja nos dois sentidos, o degrau, o teto de cinco frases, e o silêncio quando não há medição |
| `e2e/04-reuniao.spec.ts` | As frases na tela, cada uma com um número e nenhuma com elogio solto |
