# Correções da revisão da etapa 1

Vieram da conferência contra o relatório real
(`2074-Relatorio_Performance_por_Vendedor-18h39.xlsx`, extraído em 03/09/2026)
e substituem o que estava em `01` e `02` onde houver conflito.

---

## O que o arquivo real mostrou

Confirmações e surpresas úteis:

| Achado | Consequência |
|---|---|
| Cabeçalho na linha 14, com 11 linhas em branco e um título antes | Procurar a célula "Loja", nunca índice fixo — como o brief já mandava |
| Aba única, chamada `Indicadores` | Não depender do nome da aba |
| Blocos na ordem **Padre, Park, Barra** | A ordem das lojas no arquivo não é fixa. Nunca assumir posição |
| A célula da Barra vem com **espaço na frente** (`" PORTO A. - RS - BARRA SHOPPING"`) | Comparar sempre normalizado: sem acento, sem espaço sobrando, em maiúsculas |
| `Conversao` vem em pontos percentuais (`44.44`), não em fração | Dividir por 100 antes de comparar com a meta 0,60 |
| `PA` = `Total ÷ Boletos` e `Conversao` = `Boletos ÷ Oportunidades` | Bate com o recálculo previsto. Confirmado com Irene: 5 ÷ 3 = 1,6667 |
| A linha `Subtotal` traz a **meta da loja** (55.000 / 70.000 / 100.000) | Serve de conferência dupla na importação, além da soma |
| Verônica tem 3 oportunidades e 0 boletos | O caso de divisão por zero acontece já no primeiro arquivo. Grava `null` |

---

## 1. A meta de VALOR nunca é calculada

É dado de entrada: vem da coluna `Meta` do relatório, sempre.

A conferência derrubou a ideia de "meta da loja ÷ vendedoras":

| Loja | Vendedoras com meta | Metas | Divisão |
|---|---|---|---|
| Park | 4 | 17.500 × 4 | igual |
| Barra | 3 | 33.334 / 33.333 / 33.333 | igual |
| **Padre** | 2 | **11.000 e 44.000** | **desigual, 20/80** |

Uma regra de divisão igual daria 27.500 para cada uma na Padre — errado nas
duas pontas.

## 2. Pares e Bolsas são rateados pelo peso da meta de Valor

```
meta_pares_vendedora = meta_pares_loja × (meta_valor_vendedora ÷ meta_valor_loja)
```

Na Padre isso dá **38 pares** para quem tem meta de 11.000 e **152** para quem
tem 44.000, em vez de 95 para cada.

Onde a divisão de Valor já é igual (Park e Barra), a fórmula devolve a divisão
igual sozinha. É um caso só, sem exceção escrita no código.

Configurável por loja e mês em `meta_mensal.modoRateio`:
`PROPORCIONAL` (padrão) ou `IGUAL`.

## 3. Vendedora ativa no mês é quem tem Meta > 0

Meta zero no relatório significa fora do programa naquele mês. Quem está com
meta zero:

- não é apurada e não pontua;
- não entra no rateio de Pares e Bolsas;
- não entra nas médias nem nos totais da loja;
- não aparece na carteira.

Isso resolve sozinho as linhas que não são vendedoras. No arquivo real, o
critério acerta as três lojas:

| Loja | Meta > 0 | Meta = 0 |
|---|---|---|
| Barra | TEREZA, XIMENA, JULIANA | MARILIA, CAMILA, ALVARO |
| Padre | CLARICE, ELISA | ALVARO |
| Park | IRENE, LARISSA, BEATRIZ, VERÔNICA | ANA CAROLINA, SIMÃO VITOR, ALVARO |

O campo manual `vendedora.contaComoVendedora` continua existindo como trava
para o que escapar do critério automático — o ALVARO já vem com ele em `false`
no seed, das três lojas.

**Nenhum cálculo de percentual divide por meta zero.** Meta zero produz `null`
(sem resultado), nunca `0` nem infinito.

## 4. A soma dos pontos "alto" tem de fechar em 40

A distribuição entre os seis indicadores pode mudar todo mês conforme a
estratégia, mas o total é fixo. A tela de configuração **bloqueia o salvamento**
se não fechar. O valor exigido fica em `config_mes.totalPontosAlto`, e o seed
já valida ao rodar.

## 5. A tela da reunião diz que os pontos são projeção

A apuração é mensal; o que aparece no meio do mês é projeção, não ganho
garantido. No começo do mês um único dia bom joga a projeção acima de 110%, e a
gerente não pode prometer bônus em cima disso.

Por isso `apuracao_dia` e `apuracao_loja_dia` guardam `diasDecorridos` e
`diasDoMes`: a tela mostra "projeção com 3 de 30 dias corridos" junto do número,
para a fragilidade ficar visível em vez de implícita.

## 6. CRM: a gerente digita quantidade, o app calcula a razão

O campo se chama `crm_diario.vendasInfluenciadas` e é um **inteiro**. A gerente
nunca digita 0,20 — o app divide pelos boletos do período e compara com a meta.

---

## As duas pendências, agora resolvidas

**Barra.** Fica dividido entre as 3 vendedoras atuais; a quarta será contratada.
Como o rateio é proporcional à meta de Valor e só entra quem tem meta > 0, a
quarta pessoa passa a contar sozinha no mês em que aparecer com meta no
relatório. Nada a mudar quando isso acontecer.

**Padre.** A meta de 11.000 é da própria gerente, que também vende. Ela ganha
bônus **apenas pelo resultado da loja**.

Como fica no modelo:

- `vendedora.usuarioId` liga a pessoa ao login de gerente;
- `vendedora.recebeBonusVendedora = false` zera o bônus individual dela;
- ela **continua** sendo apurada individualmente — os números aparecem na tela,
  úteis para a conversa — e **continua** dentro dos totais da loja e do rateio,
  porque a meta de 11.000 faz parte dos 55.000 da loja.

Os dois cálculos ficam separados: a apuração individual dela em `apuracao_dia`
(com bônus zero) e a da loja em `apuracao_loja_dia` (com bônus a R$ 25/ponto).
Se um dia a regra mudar e ela passar a acumular os dois, é uma linha:
`recebeBonusVendedora = true`.
