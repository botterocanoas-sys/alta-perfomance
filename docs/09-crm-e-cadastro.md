# Etapa 8 — CRM, vendedoras e metas do mês

Três telas que completam o ciclo: agora dá para operar o programa inteiro sem
mexer no banco.

**A regra que atravessa as três:** toda gravação **recalcula o mês inteiro da
loja**, na mesma transação. Não adianta corrigir o cadastro e deixar a
pontuação velha para trás — e é isso que faz um lançamento atrasado ou uma meta
corrigida se propagarem sozinhos.

---

## Lançar CRM (`/crm`)

A gerente digita a **quantidade de vendas influenciadas pelo CRM**. O app é que
divide pelos boletos e compara com a meta de 20% — ela nunca digita 0,20.

Duas decisões de tela:

1. **As vendas do dia aparecem ao lado de cada campo.** É o denominador. Ver os
   dois juntos evita lançar 8 num dia de 3 vendas sem perceber.
2. **Os últimos sete dias viram botões.** Lançar atrasado é o caso comum — a
   gerente esquece na correria —, e digitar data é fricção desnecessária.

O campo é `type=number` com `step=1` e `min=0`: o navegador impede fração, e o
servidor recusa de novo, para quem mandar o formulário sem passar pela tela.

Um aviso permanente no rodapé, porque é a dúvida que vai aparecer:

> Enquanto ninguém lançar, o CRM conta como **0%** — que é medição de verdade,
> não ausência: a vendedora teve vendas e nenhuma veio do CRM. São 3 pontos
> parados até o primeiro lançamento do mês.

---

## Gerenciar vendedoras (`/vendedoras`)

Três chaves que se parecem e fazem coisas diferentes. A tela explica cada uma
**antes** de deixar mexer:

| Chave | O que faz |
|---|---|
| **conta como vendedora** | Tira a linha da carteira, das médias da loja e da divisão das metas de Pares e Bolsas. É a trava para linhas do relatório que não são vendedoras |
| **recebe bônus individual** | Mantém a apuração na tela — os números servem para a conversa — e zera o bônus em reais. É a gerente que também vende |
| **arquivada** | Quem saiu da loja. O histórico continua guardado; ela some das telas do dia a dia |

Aqui é onde o `recebeBonusVendedora = false` da gerente da Padre finalmente
tem tela — até a etapa 7 era um `update` no banco.

Cadastrar à mão existe, mas a tela diz que normalmente não é preciso: as
vendedoras nascem sozinhas na primeira importação em que aparecem.

### Um detalhe de formulário que valeu um comentário no código

Caixa de seleção desmarcada **não é enviada** pelo navegador. Cada uma vem
acompanhada de um campo escondido com `"nao"`, e o servidor lê com
`getAll(campo).includes("sim")` — assim a leitura não depende de qual campo veio
primeiro no formulário. A primeira versão dependia da ordem no DOM, o que
funcionava por acidente.

---

## Metas do mês (`/metas`)

Metas da loja, valor do ponto e a distribuição dos pontos entre os seis
indicadores, por loja e por mês. Dá para navegar dois meses para trás e um para
frente, para corrigir o passado ou preparar o próximo.

**A trava dos 40 pontos**, que o brief pede na seção 7: a soma dos pontos
"alto" dos indicadores ativos precisa fechar no total configurado. A tela
confere **enquanto a pessoa digita**, e o servidor confere de novo antes de
gravar:

> Soma dos pontos "alto" dos indicadores no programa: **45** de **40**. Não
> fecha — ajuste antes de salvar.

Outras recusas: meta zerada em qualquer indicador (zero deixaria a loja inteira
fora da apuração sem ninguém perceber) e pontos "alto" menores que os "base".

Duas coisas que **não** são editáveis aqui, de propósito:

- **A meta de Valor de cada vendedora** — vem da coluna "Meta" do relatório. O
  campo de Valor nesta tela é o da loja, usado para apurar a gerente e conferir
  a soma na importação. A tela diz isso.
- **Rateio e proporcional aos dias** — são propriedade do indicador, não da
  estratégia do mês. Quantidades rateiam e encolhem com os dias; razões não.

Quando o mês ainda não tem metas, os campos vêm com os valores do programa como
sugestão, e um aviso deixa claro que ninguém é apurada até salvar.

---

## Isolamento

As três telas recebem a loja pela URL e as ações recebem `lojaId` ou
`vendedoraId` **pelo formulário**. Todos passam por `exigirAcessoALoja` ou
`exigirAcessoAVendedora` antes de qualquer escrita.

A ação de CRM ainda confere que cada `vendedoraId` do formulário pertence à
loja informada — sem isso, dava para lançar CRM na vendedora de outra loja
mandando um campo a mais.

---

## Testes

222 de regra e 44 de navegador.

| Arquivo | Cobre |
|---|---|
| `tests/cadastro.test.ts` | A propagação: CRM virando pontos, corrigir sem duplicar, as três chaves mudando rateio e total da loja, dobrar meta derrubando o percentual, trocar o modo de rateio, desligar indicador, e apagar a meta parando a apuração sem tocar no resultado diário |
| `e2e/05-cadastro.spec.ts` | As telas: o denominador ao lado do campo, a trava dos 40 pontos bloqueando o salvamento, a recusa de meta zerada e de nome repetido, e a gerente não alcançando outra loja pelo endereço |

Uma nota sobre os testes de navegador: o Next mantém um `<div role="alert">`
para anunciar mudanças de rota, e ele colidia com os alertas do app. Todos os
specs passaram a escopar `getByRole("alert")` ao `<main>`.
