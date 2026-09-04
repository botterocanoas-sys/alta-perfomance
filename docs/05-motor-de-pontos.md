# Etapa 4 — Metas, motor de pontos e bônus

As regras estão em `02-regras-confirmadas.md` e `03-correcoes-da-revisao.md`.
Este documento é como elas viraram código.

---

## 1. O mapa dos denominadores

Está num lugar só: `realizadoPorIndicador`, em `src/lib/pontuacao.ts`.

| Situação | P.A. | Conversão | CRM |
|---|---|---|---|
| Boletos = 0, oportunidades > 0 | **indefinido** | **0%** — atendeu e não vendeu | **indefinido** |
| Boletos = 0, oportunidades = 0 | indefinido | **indefinido** | indefinido |
| Boletos > 0 | Total ÷ Boletos | Boletos ÷ Oportunidades | Influenciadas ÷ Boletos |
| Meta = 0 | fora da apuração | fora da apuração | fora da apuração |

Indefinido é `null`. Nunca `0`, nunca infinito.

**Conversão com 0 boletos não é divisão por zero.** O denominador dela é
oportunidades. Zero venda em três atendimentos é 0% — medição de verdade, e
ruim. Quem quebra com boletos zerados é o P.A. e o CRM, que dividem por boletos.

---

## 2. Ausência de medição não é zero por cento

Três situações, gravadas em `apuracao_dia.situacao`:

| Situação | Quando | Percentual na tela | Pontos |
|---|---|---|---|
| `APURADA` | há meta e há medição | o percentual | conforme a faixa |
| `SEM_MEDICAO` | faltou denominador | **"sem medição"**, nunca 0% | 0 |
| `FORA_DA_APURACAO` | meta zero, ou indicador desligado | "fora" | 0 |

Por que a distinção importa: sem ela, uma vendedora que não teve nenhum boleto
no dia veria uma barra zerada no P.A. — como se tivesse ido mal num indicador
que ela nem chegou a ter denominador para medir.

### O fechamento do mês

**Decisão: quem encerrar o mês com um indicador em `SEM_MEDICAO` leva 0 ponto
naquele indicador.** Sem boleto no mês inteiro não há desempenho a premiar.

O que importa é que esse zero é explícito e testado
(`tests/pontuacao.test.ts`, "no FECHAMENTO do mês, sem medição vale 0 ponto"),
e não um `null` que virou zero em algum ponto do caminho: a situação continua
gravada como `SEM_MEDICAO`, o percentual continua nulo, e a tela continua
mostrando "sem medição" em vez de 0%. Se um dia a regra mudar para "sai da
apuração", muda-se um lugar só.

---

## 3. As metas de cada pessoa

```
VALOR     → a coluna "Meta" do relatório. Nunca calculada.
PARES     → meta_pares_loja × (meta_valor_dela ÷ soma das metas das ativas)
BOLSAS    → mesma fórmula
P.A.      → 1,60 — a mesma da loja
CONVERSÃO → 0,60 — a mesma da loja
CRM       → 0,20 — a mesma da loja
```

O denominador do rateio é a **soma das metas de quem está ativa** (meta maior
que zero e "conta como vendedora"), para que as fatias somem exatamente a meta
da loja. Há teste conferindo isso nos dois casos reais:

| Loja | Metas de Valor | Pares (190 / 340) |
|---|---|---|
| Padre | 11.000 e 44.000 | **38 e 152** — não 95 para cada |
| Barra | 33.334 / 33.333 / 33.333 | ~113,3 para cada |

Onde a divisão de Valor já é igual, a fórmula devolve a divisão igual sozinha.
Um caso só, sem exceção no código.

A gerente é apurada contra a meta **cheia** da loja, com o realizado somado de
quem está no programa.

---

## 4. A meta proporcional aos dias

```
meta até hoje = meta do mês × dias decorridos ÷ dias do mês
```

Vale para **Valor, Pares e Bolsas**. Não vale para P.A., Conversão e CRM: razão
não cresce com o número de dias, então elas comparam direto com a meta fixa.

Quem decide isso é a coluna `regra_pontuacao.proporcional_aos_dias`, não um
`if` no código. O motor é um laço único sobre os seis indicadores.

O percentual que sai daí é idêntico à "tendência" do brief — média diária vezes
os dias do mês, dividida pela meta. Há teste provando a identidade. No último
dia do mês, dias decorridos = dias do mês, e a mesma fórmula vira a apuração
final.

---

## 5. As faixas

| Percentual | Faixa | Pontos |
|---|---|---|
| `< 95%` | ZERO | 0 |
| `95% ≤ x < 100%` | MEIO | 0,5 |
| `100% ≤ x ≤ 110%` | BASE | base do indicador |
| `> 110%` | ALTO | alto do indicador |

Cada ponta guarda se ela mesma entra na faixa
(`pct_min_inclusivo` / `pct_max_inclusivo`), então não há epsilon nem
dependência da ordem de avaliação. Um teste percorre 2.000 percentuais e exige
que cada um caia em exatamente uma faixa.

Casos travados: 94,9 → 0 · 95,0 → 0,5 · 99,9 → 0,5 · 100,0 → base ·
110,0 → **base** · 110,0000001 → alto.

---

## 6. Pontos e bônus

| | Vendedora | Gerente |
|---|---|---|
| Realizado | dela | soma das ativas da loja |
| Meta | rateada | cheia da loja |
| Valor do ponto | R$ 15 | R$ 25 |
| Teto | 40 pontos = R$ 600 | 40 pontos = R$ 1.000 |

A soma dos pontos "alto" dos indicadores ativos precisa fechar em
`config_mes.total_pontos_alto` (40). O recálculo devolve
`pontuacaoDesbalanceada` quando não fecha, e a tela de configuração vai
bloquear o salvamento na etapa em que ela existir.

### A gerente que também vende

`vendedora.recebe_bonus_vendedora = false` zera o bônus em R$ **sem apagar a
apuração**: os pontos e os percentuais dela continuam gravados e visíveis,
porque servem para a conversa da reunião. Ela também continua dentro do total
da loja e do rateio — os 11.000 fazem parte dos 55.000.

Como o seed não cria mais vendedoras, essa marcação passou a ser feita na tela
de gerenciar vendedoras (etapa 8). Até lá, é um `update` no banco.

---

## 7. Quando o CRM ainda não foi lançado

Se a vendedora teve boletos e ninguém lançou CRM, a proporção é `0 ÷ boletos`,
ou seja **0% — medição de verdade**, e o indicador pontua zero.

Isso é o comportamento correto pelo mapa dos denominadores, mas é fácil de
confundir com "o app está errado". A tela de lançar CRM é a etapa 8; até lá,
vale saber que os 3 pontos do CRM ficam zerados enquanto ninguém lançar.

---

## 8. Onde tudo isso vive

| Arquivo | O que faz |
|---|---|
| `src/lib/pontuacao.ts` | Funções puras: mapa dos denominadores, faixas, rateio, meta proporcional |
| `src/lib/apuracao.ts` | Roda o motor sobre o banco e grava `apuracao_dia` e `apuracao_loja_dia` |
| `/pontos` | A tela de conferência: meta do mês, meta até hoje, realizado, %, pontos |

O recálculo apaga o mês e refaz, e roda na mesma transação da importação — o
mês nunca fica com resultado novo e pontuação velha. Lançar CRM atrasado ou
corrigir uma meta também dispara o recálculo do mês inteiro.

---

## 9. Testes

**67 novos**, somando 159 de regra e 18 de navegador.

| Arquivo | Cobre |
|---|---|
| `tests/pontuacao.test.ts` | 14 fronteiras de faixa, o teto de 40, a meta proporcional, o mapa dos denominadores, `SEM_MEDICAO` × 0%, o fechamento, o rateio nos casos de Padre e Barra |
| `tests/apuracao.test.ts` | O motor sobre o arquivo de exemplo: metas gravadas, 38/152 na Padre, 60 na Park, P.A. 8÷7, a Verônica com P.A. sem medição e Conversão em 0%, CRM mudando a nota, a gerente com bônus zerado, idempotência, loja sem meta |

Um teste que vale citar: `a Conversão é boletos ÷ oportunidades, nunca o
inverso` confere 4/9 = 44,4% e rejeita 9/4. Se alguém inverter a fórmula um
dia, quebra ali.
