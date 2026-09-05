# Etapa 6 — A tela da reunião

A tela mais importante do app: a gerente tem trinta segundos por vendedora.
A ordem é a ordem da conversa (seção 8.3 do brief).

---

## Antes: a cobertura da medição

O ritmo é média ponderada, mas indicador sem medição sai da conta — então **o
denominador varia de pessoa para pessoa**. Uma vendedora medida só em Valor e
Pares tem ritmo sobre 22 pontos de peso; outra medida nos seis, sobre 40. Os
dois números caíam na mesma coluna do ranking como se fossem comparáveis.

O que mudou:

1. **`ritmoDoMes` devolve a cobertura junto do número** — `{ valor, pesoMedido,
   pesoTotal, cobertura }`. Quem exibe o ritmo é obrigado a exibir sobre quanto
   ele foi calculado: o selo agora vem sempre acompanhado de
   *"22 de 40 pontos medidos"*, e o mesmo texto vai no `title` do selo.

2. **Piso de cobertura: metade do peso.** Abaixo de 50% o selo não é emitido —
   vira **"medição parcial"**, nem verde nem vermelho. Um selo verde sobre 15
   dos 40 pontos afirma mais do que os dados sustentam; um vermelho, também.

3. **O ranking continua ordenado por pontos**, que é a régua do programa e não
   varia com a cobertura. O ritmo só desempata.

O caso que motivou tudo está testado: 104% sobre 22 pontos contra 96% sobre 40.
As duas passam do piso e emitem selo, mas com coberturas visivelmente
diferentes na tela.

**Detalhe que vale registrar:** indicador com meta zero (`FORA_DA_APURACAO`)
não entra nem no peso total. Ele não é ausência de medição, é ausência de
programa — não faz sentido derrubar a cobertura de quem está fora dele.

---

## O achado da terceira extração

O arquivo das 15h54 trouxe uma **terceira ordem de blocos**:

| Extração | Ordem |
|---|---|
| 15h54 | Park → Padre → Barra |
| 17h50 | Padre → Barra → Park |
| 18h39 | Padre → Park → Barra |

Três extrações, três ordens. O teste das quatro ordens deixou de ser precaução
duas vezes.

### E um caso novo: vendeu sem ter meta

Na extração das 15h54, uma vendedora da Barra tem **Meta 0 e R$ 289,90 em
vendas**. Isso obrigou a decidir o que "total da loja" quer dizer.

O `Subtotal` do relatório **inclui** a venda dela (8.310,765 = 8.020,865 das
três com meta + 289,90). E você disse "da gerente é o total da loja". Então:

- o **realizado da loja** passou a incluir todo mundo que vendeu, tenha meta ou
  não. É o que o relatório soma, e é sobre o total da loja que a gerente é
  remunerada;
- ela **continua fora** da apuração individual e do rateio de Pares e Bolsas —
  sem meta, não está no programa;
- a trava manual `contaComoVendedora = false` continua tirando a linha do total
  da loja. É para isso que ela existe.

⚠️ **Isto muda o número da gerente** em relação à etapa 4, onde o total da loja
somava só quem estava no programa. Se a intenção era a outra, é uma linha em
`apuracao.ts` — mas o Subtotal do relatório concorda com a leitura atual.

---

## A tela

### a) O veredito, em uma frase

> Hoje está com **21,5 pontos**, **+3** em relação a ontem — **R$ 322,50** de
> bônus projetado no mês.

Abaixo, o selo com a cobertura e o lembrete de que é projeção.

### c) O que atacar hoje, por retorno marginal

> Faltam **3 peças** para passar de **100%** — vale **+2,5 pontos = +R$ 37,50**.

A escolha é por **retorno**: pontos ganhos por ponto percentual de esforço. Um
indicador a 40% pode ser inalcançável no mês; um a 99% precisa de um empurrão.

A distância é traduzida para a unidade que a gerente fala:

| Indicador | "Faltam..." |
|---|---|
| Valor | reais |
| Pares, Bolsas | unidades |
| P.A. | **peças**, com os boletos que ela já tem |
| Conversão | **vendas**, nos atendimentos que ela já teve |
| CRM | **vendas com CRM** |

**A linha que evita a tela parecer contraditória.** Quando o recomendado não é
o indicador mais fraco — e frequentemente não é —, o card diz:

> O indicador mais fraco dela hoje é **Valor**, não este. A recomendação é por
> **retorno**: aqui o esforço é curto e vira ponto hoje. O ritmo diz onde ela
> está; isto diz onde mexer agora.

Sem isso, a gerente veria "Valor crítico" na tabela e "ataque Conversão" no
card, e concluiria que o app se contradiz. Ele não se contradiz: são perguntas
diferentes.

### d) Últimos dias

Pontos projetados por dia, com o que ela vendeu naquele dia embaixo de cada
barra. Dia negativo (devolução) aparece em vermelho. O gráfico tem
`role="img"` com o texto completo, para quem usa leitor de tela.

### e) Os seis indicadores

Meta do mês, realizado, ritmo, **seta comparando com sete dias atrás**, média da
loja e pontos. A seta mostra "sem base" quando não havia apuração naquele dia
ou faltou medição em uma das pontas — nunca inventa uma direção.

### f) Consistência no mês

Em quantos dias o resultado **daquele dia** ficou acima de 110%, entre 100 e
110%, e abaixo de 95%. Usa `faixaDia`, que é diferente do ritmo: um mede o dia
isolado, o outro o acumulado.

### g) O registro da reunião

Pauta, acordos, observações e próximos passos. Uma reunião por vendedora e por
dia: salvar de novo atualiza a mesma.

**Acima do formulário, o acordo da última reunião em destaque** — o brief é
explícito: a gerente precisa cobrar o acordo anterior antes de fazer um novo.

Um bug que apareceu no teste e valeu a pena: eu datava a reunião pelo dia dos
**números** (a importação), não pelo dia em que ela **acontece**. A gerente
conversa hoje sobre o relatório de ontem, então o registro de hoje nunca era
encontrado. A reunião é datada pelo dia civil de Porto Alegre.

### h) Histórico

Colapsado, com as reuniões anteriores e quem registrou cada uma.

---

## Segurança

O `id` da vendedora vem da URL **e do formulário**. Os dois passam por
`exigirAcessoAVendedora`: a página responde 404 igual a uma vendedora
inexistente, e a ação de salvar recusa antes de gravar. Sem a segunda checagem,
dava para registrar reunião na vendedora de outra loja mandando o formulário
direto.

---

## Testes

188 de regra e 32 de navegador.

| Arquivo | Cobre |
|---|---|
| `tests/pontuacao.test.ts` | Cobertura e o piso do selo, o caso 104%/22 contra 96%/40, o próximo degrau em cada faixa, e o retorno marginal apontando para longe do indicador mais fraco |
| `tests/parser.test.ts` | As três extrações reais em ordens diferentes, e a vendedora com meta zero que vendeu |
| `tests/apuracao.test.ts` | O total da loja incluindo quem vendeu sem meta, e a trava manual tirando a linha |
| `e2e/04-reuniao.spec.ts` | O veredito, a cobertura ao lado do selo, o card de atacar hoje, a explicação da divergência, o gráfico, e o registro salvando e atualizando |
