# Etapa 3 — Importação, parser e delta

---

## Antes de tudo: duas divergências entre o que você conferiu e o arquivo

Reconferi célula a célula o `.xlsx` que você enviou
(`2074-Relatorio_Performance_por_Vendedor-18h39.xlsx`, agora anonimizado como
`tests/fixtures/relatorio-exemplo-18h39.xlsx`). Dois pontos não batem com a sua
revisão. Registro aqui para você conferir na fonte, porque a diferença sugere
que você olhou uma extração diferente desta.

**1. A ordem dos blocos neste arquivo é Padre → Park → Barra.**

| Linha | Célula "Loja" |
|---|---|
| 15 | `PORTO A. - RS - PADRE CHAGAS` |
| 19 | `CANOAS - RS - PARK SHOPPING` |
| 27 | `" PORTO A. - RS - BARRA SHOPPING"` (com espaço na frente) |

Como você disse, não muda nada: o parser acha o bloco pelo texto da célula e
nunca por posição. Há teste que lê o mesmo conteúdo nas quatro ordens
possíveis e exige resultado idêntico.

**2. Neste arquivo a Verônica (agora "VERÔNICA") tem 3 oportunidades e 0
boletos, com Meta 17.500.**

Linha 20: `Meta 17500 · Oportunidades 3 · Boletos 0 · Valor 0`.

Ou seja: **existe** uma vendedora ativa com divisão por zero já no arquivo
cheio. A conferência do Subtotal da Padre também dá 9 oportunidades e 4
boletos (44,44%), não 7/12 = 58,33%.

Nada disso muda o que você pediu — eu fiz as duas mudanças de qualquer forma,
porque elas são as certas:

- o teste de divisão por zero agora é **sintético e sobre o delta**, que é onde
  o caso é comum: uma vendedora ativa que atendeu e não vendeu naquele dia;
- o teste do arquivo real continua existindo, mas conferindo a forma do
  arquivo, não um caso de borda específico.

Se você estiver olhando uma extração mais nova, me mande que eu rodo o parser
contra ela — leva um minuto e o teste passa a cobrir as duas.

---

## O que ficou pronto

| Arquivo | O que faz |
|---|---|
| `src/lib/relatorio/parser.ts` | Lê o .xlsx e valida a forma. Não conhece o banco |
| `src/lib/relatorio/importar.ts` | Prévia (não grava) e confirmação (grava tudo de uma vez) |
| `src/lib/relatorio/recalcular.ts` | Refaz `resultado_diario` de um mês inteiro |
| `src/lib/delta.ts` | O cálculo do delta. Funções puras, sem banco |
| `src/lib/data.ts` | Datas no fuso de Porto Alegre |
| `/importar` | Tela do admin: upload, prévia, confirmação |
| `/conferencia` | A tela desta etapa: acumulado e resultado do dia lado a lado |

---

## O parser

Achados do arquivo real que viraram regra:

| O arquivo faz | O parser faz |
|---|---|
| Cabeçalho na linha 14, com título e 11 linhas em branco antes | Procura a linha que tenha "Loja" **e** "Vendedor". Só "Loja" pegaria o título |
| Aba única chamada `Indicadores` | Usa a primeira aba, sem depender do nome |
| Blocos em ordem qualquer | Reconhece cada bloco pelo texto da célula, nunca por posição |
| Coluna "Loja" só na primeira linha do bloco | Arrasta o valor para baixo |
| A célula da Barra vem com espaço na frente | Compara normalizado: sem acento, sem espaço sobrando, maiúsculas |
| Linha `Subtotal` fechando cada bloco | Vira conferência, nunca vendedora |
| `Conversao` em pontos percentuais (44,44) | Guarda como veio; converte só ao comparar com a meta |
| `Total` = soma de todas as categorias | É o numerador do P.A. |

As colunas são localizadas **pelo nome no cabeçalho**, nunca pelo índice. Se o
sistema da loja inserir uma coluna nova no meio, nada quebra; se remover uma
esperada, a importação é recusada dizendo qual falta.

### P.A. e Conversão, confirmados no arquivo

- `TEREZA`: Total 8, Boletos 7 → o relatório traz P.A. 1,1429 = 8 ÷ 7. **É a
  coluna Total, não Calçados.** Há teste que falha de propósito se alguém trocar.
- `IRENE`: Total 5, Boletos 3 → 1,6667. Confere.
- `ELISA`: Boletos 4, Oportunidades 9 → 44,44%. Confere.

---

## A importação, em dois passos

**Passo 1 — prévia.** Lê, casa com o cadastro e mostra o que aconteceria. Não
grava nada. Traz por loja: quantas linhas, quantas com meta maior que zero,
quantos nomes novos, e a conferência da soma contra a linha `Subtotal`.

**Passo 2 — confirmação.** Grava tudo numa transação só. O arquivo é lido de
novo no servidor: a prévia serviu para você decidir, não como fonte de dados.

O que **impede** a gravação (erro):

- alguma loja do arquivo não reconhecida;
- alguma coluna esperada faltando;
- a soma de um bloco não bater com o `Subtotal` dele;
- o mesmo arquivo já ter sido importado (conferido por `sha256`);
- algum nome novo sem confirmação.

O que **avisa** mas não impede:

- meta ainda não cadastrada para o mês;
- a meta somada no relatório divergir mais de 1% da cadastrada;
- a coluna `Total` não bater com a soma das categorias numa linha.

### Nomes novos

Todo nome que não bate com nenhum apelido cadastrado aparece na prévia com a
loja, a linha do arquivo e a meta, e precisa de confirmação. O apelido guarda a
grafia **normalizada**, então uma extração que escreva `VERONICA` no lugar de
`VERÔNICA` cai na mesma pessoa — sem partir o histórico em dois.

---

## O delta

`resultado_do_dia = acumulado da importação oficial de hoje − acumulado da
oficial anterior`. Oficial de um dia = a mais recente daquele dia; guardamos
todas, mas só uma entra na conta.

### A virada do mês

O acumulado zera quando o mês muda. A cadeia é montada **por mês** e nunca
atravessa a fronteira: a primeira importação de um mês tem base nula. Sem isso,
o dia 1º de outubro viria com um delta negativo do tamanho de setembro inteiro
— o teste guarda os dois lados dessa conta, inclusive o estrago que seria.

O mês vem da **data da importação**, escolhida na tela (padrão: hoje em Porto
Alegre, editável para subir relatório atrasado).

### Delta negativo

É legítimo e vai acontecer: devolução ou cancelamento derruba o acumulado. O
app **não força para zero e não esconde**. A tela mostra o valor em vermelho e
explica em uma linha que é queda no dia, provavelmente devolução.

Como a apuração é mensal e sempre recalculada sobre o acumulado, um dia
negativo não corrompe a pontuação — aparece só na leitura daquele dia. Há teste
provando que a soma dos dias, com a devolução no meio, continua batendo com o
acumulado final.

### Dia sem importação

Loja fechada ou admin esquecido: a base é a última importação disponível **do
mesmo mês**, não "ontem". O delta do próximo dia cobre o período inteiro, em
vez de o movimento sumir.

### Razão com denominador zero

Grava vazio, nunca `0` nem infinito. Um dia com 2 oportunidades e 0 boletos tem
P.A. vazio (não houve venda) e Conversão `0` (zero de duas oportunidades é zero
de verdade). A tela escreve `—` e explica a diferença.

### Vendedora que entra no meio do mês

A cadeia dela começa no primeiro dia em que aparece, com base nula. Não
inventamos zero para os dias anteriores, e uma pessoa que suma de um relatório
não gera delta negativo fantasma.

---

## Recálculo

`recalcularMes` apaga o mês e refaz a partir das linhas cruas. É idempotente:
rodar duas vezes dá o mesmo resultado. Roda dentro da transação da importação,
então ou o mês inteiro fica consistente, ou nada muda.

Isso é o que faz uma correção se propagar sozinha: subir de novo o relatório de
um dia no meio do mês recalcula dali para a frente, sem números velhos
sobrando.

---

## Testes

92 de regra e 16 de navegador. Os desta etapa:

| Arquivo | Cobre |
|---|---|
| `tests/delta.test.ts` | Os 3 casos da seção 5, P.A. e Conversão recalculadas, denominador zero, delta negativo, virada do mês, dia sem importação |
| `tests/parser.test.ts` | O arquivo de exemplo inteiro, as 4 ordens de blocos, cabeçalho em outra altura, coluna faltando, bloco sem Subtotal |
| `tests/importacao.test.ts` | Prévia, conferência do Subtotal, nomes novos, gravação, dedupe, e a cadeia de delta ao longo do mês no banco |
| `e2e/importacao.spec.ts` | A tela: só admin importa, prévia não grava, erro claro, confirmação, conferência |

Um teste que vale citar: `subtrair as razões do relatório daria resultado
errado` monta um caso em que a conversão acumulada cai de 50% para 30%, mas o
dia teve 16,67%. Se alguém um dia "simplificar" o código subtraindo as razões,
esse teste quebra na hora.

---

## Sobre o arquivo de exemplo

`tests/fixtures/relatorio-exemplo-18h39.xlsx` é o relatório real com os
**nomes trocados por fictícios** e todos os números preservados. As armadilhas
de grafia foram mantidas de propósito: um nome acentuado (`VERÔNICA`), um com
til (`SIMÃO VITOR`) e dois compostos com espaço.

⚠️ **O arquivo original, com os nomes de verdade, ainda está no histórico do
Git** (commit `c43a751`). Tirar do commit atual não o remove do histórico. Para
apagar de vez é preciso reescrever a história do branch e forçar o envio — não
fiz isso por conta própria porque é irreversível e você pode ter o branch
baixado em outra máquina. Diga se quer que eu faça.

O `prisma/seed.ts` também continua com os nomes reais das vendedoras. Ali eles
são cadastro operacional de verdade — o app precisa deles —, então deixei como
está. Se preferir que o seed também fique só com lojas, logins e metas, e que
as pessoas sejam criadas na primeira importação, é uma mudança pequena; o único
detalhe é que o `recebeBonusVendedora = false` da gerente da Padre passaria a
ser marcado na tela de gerenciar vendedoras, que é a etapa 8.
