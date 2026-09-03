# Regras confirmadas — respostas do franqueado (03/09/2026)

As quatro perguntas abertas da etapa 1 foram respondidas. Este documento é a
fonte da verdade do motor de pontos.

---

## R1. A avaliação é MENSAL, uma vez

O acumulado do mês é comparado à meta do mês. **Teto de 40 pontos por pessoa
por mês.**

- Vendedora: 40 × R$ 15 = **R$ 600** de bônus máximo.
- Gerente: 40 × R$ 25 = **R$ 1.000** de bônus máximo.

Confere com a soma dos pontos "alto" dos seis indicadores:
`15 + 7 + 7 + 5 + 3 + 3 = 40`.

### Como isso vira um número útil na reunião diária

Comparar o acumulado do dia 8 com a meta do mês inteiro daria sempre ~26%, o
que não serve para conversa nenhuma. Então, em qualquer dia do mês, a
comparação é contra a **meta proporcional aos dias decorridos**:

```
pct = acumulado até hoje ÷ (meta do mês × dias decorridos ÷ dias do mês)
```

Isso é matematicamente idêntico à "tendência" da seção 7 do brief
(média diária × dias do mês, dividida pela meta do mês). Ou seja: **o
percentual mostrado todo dia já é o percentual da tendência**, e os pontos
mostrados são os pontos que essa tendência renderia. No último dia do mês,
dias decorridos = dias do mês, e a fórmula vira a apuração final. Uma
fórmula só, do dia 1 ao fechamento.

⚠️ **Exceção importante:** P.A., Conversão e CRM são razões. Razão não cresce
com o número de dias, então **não se aplica proporcional a elas** — o acumulado
do mês é comparado direto à meta fixa.

- Proporcional aos dias: VALOR, PARES, BOLSAS.
- Comparação direta: P.A., CONVERSÃO, CRM.

---

## R2. Fronteiras das faixas — o limite entra na faixa de baixo, no topo

| Percentual de atingimento | Pontos |
|---|---|
| `pct < 95%` | 0 |
| `95% ≤ pct < 100%` | 0,5 |
| `100% ≤ pct ≤ 110%` | base |
| `pct > 110%` | alto |

110% cravado paga a **base**. Só acima de 110% paga o alto.

Casos do teste obrigatório (seção 11 do brief):
`94,9% → 0` · `95,0% → 0,5` · `99,9% → 0,5` · `100,0% → base` ·
`110,0% → base` · `110,1% → alto`.

Pontos por indicador:

| Indicador | Base | Alto |
|---|---|---|
| VALOR | 10 | 15 |
| PARES | 4 | 7 |
| BOLSAS | 4 | 7 |
| P.A. | 3 | 5 |
| CONVERSÃO | 2 | 3 |
| CRM | 2 | 3 |
| **Máximo** | **25** | **40** |

Tudo isso vive nas tabelas `faixa_pontuacao` e `regra_pontuacao`, por loja e
por mês de referência. Nada fixo no código.

---

## R3. CRM é a proporção de vendas influenciadas pelo CRM

> "a venda influenciada do CRM deve ser no mínimo 20% e a conversão deve ser
> no mínimo 60%"

A gerente digita a **quantidade de vendas influenciadas pelo CRM** no dia. O
indicador é a proporção sobre o total de vendas:

```
CRM = vendas influenciadas pelo CRM ÷ boletos
```

Meta: `≥ 0,20`. Confirmada também a Conversão: `boletos ÷ oportunidades ≥ 0,60`.

Boletos zerados no período gravam `null` — sem resultado, não pontua, não entra
em média.

---

## R4. A gerente pontua sobre o total da loja

> "a gerente pode ganhar até 40 pontos, e cada ponto vale 25 reais. metas da
> gerente é a da loja, da vendedora é da loja dividido, da gerente é o total
> da loja. exceto p.a, conversão, crm, esses kpis são fixos, mesma porcentagem
> tanto pra vendedora quanto pra loja, faturamento, pares e bolsa é o total da
> loja que para vendedora é dividido"

A gerente é apurada exatamente como uma vendedora, mas com o realizado somado
da loja contra a meta da loja. Mesmas faixas, mesmos pontos por indicador,
teto de 40 pontos, valendo R$ 25 cada.

### Tabela de metas resultante

| Indicador | Meta da LOJA (gerente) | Meta da VENDEDORA | Tipo |
|---|---|---|---|
| VALOR | `valor_loja` (ex.: R$ 100.000 na Barra) | `valor_loja ÷ nº de vendedoras ativas` | dividido |
| PARES | `pares_loja` (340) | `pares_loja ÷ nº de vendedoras ativas` | dividido |
| BOLSAS | `bolsas_loja` (15) | `bolsas_loja ÷ nº de vendedoras ativas` | dividido |
| P.A. | 1,60 | 1,60 | **fixo, igual para as duas** |
| CONVERSÃO | 0,60 | 0,60 | **fixo, igual para as duas** |
| CRM | 0,20 | 0,20 | **fixo, igual para as duas** |

### Tabela de realizado resultante

| Indicador | Realizado da LOJA | Realizado da VENDEDORA |
|---|---|---|
| VALOR | soma do faturamento das vendedoras que contam | faturamento dela |
| PARES | soma dos calçados | calçados dela |
| BOLSAS | soma das bolsas | bolsas dela |
| P.A. | peças da loja ÷ boletos da loja | peças dela ÷ boletos dela |
| CONVERSÃO | boletos da loja ÷ oportunidades da loja | boletos dela ÷ oportunidades dela |
| CRM | CRM da loja ÷ boletos da loja | CRM dela ÷ boletos dela |

Em todos os casos, "da loja" soma apenas quem está com
`conta_como_vendedora = true` — o ALVARO não entra nem no numerador nem no
denominador.

---

## Ponto que eu resolvi sozinho, e que você pode derrubar

**A meta de VALOR de cada vendedora vem da coluna "Meta" do relatório.**

A seção 6 do brief é explícita ("já vem pronta no relatório, use essa"), e a
sua resposta de agora diz que o faturamento é "o total da loja que para
vendedora é dividido". As duas coisas provavelmente batem — o relatório
já traz a meta da loja rateada.

Como não dá para ter certeza sem ver o arquivo, fiz assim:

1. A meta individual de VALOR usa a coluna `Meta` do relatório.
2. Na importação, o app **compara a soma das metas individuais com a
   `valor_loja` cadastrada**. Se a diferença passar de 1%, a prévia mostra um
   aviso — não bloqueia, mas você fica sabendo antes de confirmar.
3. Se ao ver o arquivo real ficar claro que a coluna `Meta` não é confiável,
   troco para `valor_loja ÷ nº de vendedoras` mudando uma linha, sem mexer no
   modelo.
