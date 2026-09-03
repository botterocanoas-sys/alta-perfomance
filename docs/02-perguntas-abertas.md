# Perguntas abertas — bloqueiam a etapa 4 (motor de pontos)

O brief pede que eu pergunte antes de assumir. Estas quatro mudam a conta do
bônus, então preciso da sua resposta antes de escrever o motor de pontos.

---

## P1. Os pontos são contados por dia ou uma vez por mês?

**Por que isso importa:** muda o valor do bônus por um fator de ~30.

A seção 7 pede "pontos do dia" e "pontos acumulados no mês", o que sugere que
cada dia é avaliado contra a meta diária e os pontos somam ao longo do mês.
Mas somando assim, uma vendedora que bate tudo todos os dias faria
`30 dias × 40 pontos = 1.200 pontos = R$ 18.000` de bônus no mês.

Se a avaliação for uma vez só, no fim do mês (acumulado do mês contra a meta
do mês), o teto é `40 pontos = R$ 600`, que é a ordem de grandeza normal de um
programa de incentivo.

O exemplo do próprio brief ("Ontem fez 45 pontos... R$ 675 de bônus acumulado
no mês") mistura os dois: 45 pontos em um dia, mas R$ 675 = 45 × 15 chamado de
acumulado do mês. Por isso preciso perguntar.

**Opções:**
- **A — Diário e soma.** Cada dia pontua contra a meta diária; o mês é a soma.
- **B — Mensal, uma vez.** O acumulado do mês é comparado à meta do mês. O
  "ganhou/perdeu de ontem" passa a ser a variação da *projeção* de pontos.
- **C — Os dois.** Pontos diários existem só como termômetro na reunião; o
  bônus pago é o mensal.

**Resposta:** _(pendente)_

---

## P2. Onde ficam exatamente as fronteiras das faixas?

A tabela diz "Até 95% → 0", "De 95% a 100% → 0,5", "De 100% a 110% → base",
"Acima de 110% → alto". Os limites aparecem nas duas faixas vizinhas, então
preciso fechar cada um. O teste da seção 11 (94,9% / 95% / 100% / 110%) depende
disso.

**Opções:**
- **A — O limite entra na faixa de cima.** `<95` = 0 · `95 ≤ x < 100` = 0,5 ·
  `100 ≤ x ≤ 110` = base · `>110` = alto. (110% exato paga base.)
- **B — 110% exato já paga alto.** `100 ≤ x < 110` = base · `x ≥ 110` = alto.

Em qualquer das duas, as faixas ficam na tabela `faixa_pontuacao` e podem ser
mudadas por tela, sem código.

**Resposta:** _(pendente)_

---

## P3. A meta de CRM é 0,20 de quê?

P.A. (1,6) e Conversão (0,60) são razões, e 0,20 tem cara de razão também. Mas
a seção 4 diz que a gerente digita a **quantidade** de CRM por dia. Quantidade
não se compara com 0,20.

**Opções:**
- **A — Proporção sobre boletos.** `CRM ÷ boletos do dia ≥ 0,20`: 20% das
  vendas viram cadastro.
- **B — Proporção sobre oportunidades.** `CRM ÷ oportunidades do dia ≥ 0,20`.
- **C — Quantidade absoluta.** A meta 0,20 está errada e o número certo é uma
  quantidade por dia ou por mês (ex.: 20 cadastros no mês).

**Resposta:** _(pendente)_

---

## P4. O bônus da gerente (R$ 25/ponto) é calculado sobre quais pontos?

O brief fixa o valor do ponto da gerente mas não diz de onde vêm os pontos
dela, e não há tela para isso na seção 8.

**Opções:**
- **A — Média** dos pontos das vendedoras da loja.
- **B — Soma** dos pontos das vendedoras da loja.
- **C — A loja pontua como se fosse uma vendedora:** realizado da loja contra
  a meta da loja, nas mesmas faixas.
- **D — Fora do escopo por enquanto.** Guardo o campo configurável e não
  mostro tela.

**Resposta:** _(pendente)_
