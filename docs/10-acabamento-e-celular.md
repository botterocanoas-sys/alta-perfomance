# 10 — Acabamento, celular e estados vazios

Etapa 9. Três coisas: a tipografia de verdade, o app funcionando na tela onde
ele vai ser usado, e o que aparece quando ainda não há dado nenhum.

Nada aqui muda um número. Mas duas correções desta etapa nasceram justamente de
números errados na tela — e estão descritas no fim, porque são as mais
importantes do documento.

---

## As três fontes

| Papel | Fonte | Por quê |
|---|---|---|
| Títulos | Fraunces (variável) | Serifada com peso, como o brief pede. Sendo variável, o navegador interpola o peso e o app carrega um arquivo só |
| Texto | Archivo | Grotesca de leitura confortável em corpo pequeno |
| Números | IBM Plex Mono | Dígito de largura fixa: em coluna, os números alinham e a gerente compara linha com linha de relance |

A classe `.numeros` carrega `font-variant-numeric: tabular-nums` além da fonte.
Isso vale também onde o número aparece no meio de uma frase — `3 pontos`,
`R$ 45,00` — para o olho achar o número sem ler a frase.

O fundo é creme (`#efe9dd`), os blocos de leitura são papel quase branco
(`#fffdf9`) e a tinta é quase preta com um toque de marrom (`#1a1713`). O vinho
da marca aparece só no que exige decisão.

---

## Celular

A gerente usa o app em pé, no chão de loja, com o celular numa mão. Isso decide
três regras:

1. **Nada vaza na horizontal.** `body { overflow-x: hidden }` é a rede de
   segurança, mas a regra de verdade é que toda tabela larga rola dentro do
   próprio bloco (`.tabela-rolante`), nunca a página inteira.

2. **A coluna do nome fica parada.** Nas tabelas largas o primeiro `td` leva a
   classe `col-fixa` e gruda na esquerda enquanto o resto corre. Sem isso a
   gerente rola até a coluna Pontos e não sabe mais de qual indicador é a linha
   que está lendo.

3. **A tabela avisa que rola.** O componente `Rolagem` mede a diferença entre
   `scrollWidth` e `clientWidth` e mostra "arraste para o lado →" só quando há
   mesmo coluna escondida — sumindo assim que ela chega ao fim. É o aviso que
   faltava: Ritmo e Pontos, que é o que ela procura, são as últimas colunas.

Alvo de toque mínimo de 44px em botão, link, `summary` e campo de digitar, sob
`@media (pointer: coarse)`. A caixa de marcar é a exceção: quem cresce é o
rótulo em volta dela, porque é nele que o dedo acerta. A primeira tentativa
aumentou a própria caixa com `transform: scale()`, e o resultado foi uma caixa
azul gigante por cima do texto — está no histórico como lembrete.

A auditoria está em `scripts/auditoria-celular.mjs`: 390px de largura, toque, pt-BR, sete
telas. Ela mede em uma passagem e fotografa em outra, de propósito — a captura
`fullPage` do Playwright mexe nas métricas do dispositivo e derruba a emulação
de toque para o resto da sessão, o que dava falso positivo em todo alvo medido
depois dela.

---

## Estados vazios

Banco semeado, nenhuma importação. Cada tela diz o que falta e quem faz:

| Tela | O que diz |
|---|---|
| Painel | "Aguardando a primeira importação do mês. Peça ao administrador para subir o relatório de hoje." |
| Pontos | "Nada apurado ainda. Assim que o administrador importar o primeiro relatório do mês, os pontos aparecem aqui." |
| Conferência | "Aguardando a primeira importação do mês." |
| CRM | "Nenhuma vendedora na carteira desta loja. Elas aparecem depois da primeira importação do relatório." |
| Vendedoras | "Nenhuma vendedora ainda. Elas nascem sozinhas na primeira importação do relatório." |

Nenhuma diz "sem dados". Todas dizem qual é o próximo passo e de quem ele é.

Erro inesperado tem tela própria (`error.tsx`), e ela promete uma coisa só que
importa: **"Nenhum dado foi alterado."** Como toda escrita acontece dentro de
uma transação, isso é verdade — e é a primeira pergunta de quem viu a tela
quebrar depois de clicar em Salvar.

---

## As duas correções que mudavam número na tela

### O esqueleto de carregamento mostrava a loja errada

A etapa começou com um `loading.tsx` em cada tela — o esqueleto cinza que
aparece enquanto o servidor responde. Parecia acabamento puro. Não era.

Com o esqueleto no painel, o administrador clicava em Park e o navegador
trocava a URL para a da Park **mantendo os números da Padre na tela**. Medido:
a troca demorava ~900ms e, da segunda troca em diante, o `h1` simplesmente não
mudava mais. Sem os `loading.tsx`, a mesma troca leva ~100ms e sempre mostra a
loja certa.

Números de uma loja sob o nome de outra é o pior defeito possível neste app.
Os esqueletos saíram, todos. A 100ms de navegação eles não acrescentavam nada
que valesse esse risco. O teste `o admin troca de loja e vê as três` faz três
trocas seguidas de propósito — a terceira é a que pegava o problema.

Um `loading.tsx` também custava o **404** da página da vendedora: o esqueleto
faz o Next despachar o cabeçalho com status 200 antes de o código chegar em
`notFound()`. Vendedora de outra loja precisa responder igualzinho a vendedora
que não existe, e o status faz parte disso. Por isso `vendedora/[id]` não tem
esqueleto, e o motivo está escrito no código, ao lado do `notFound()`.

### Arquivar uma vendedora não confirmava nada

A confirmação de "salvo" morava dentro da linha da vendedora. Ao marcar
*arquivada*, a linha sai da lista de ativas — e a confirmação ia junto. A
gerente clicava, a pessoa sumia da tela e nada dizia que tinha dado certo.

O aviso subiu para o topo da carteira, num componente só (`Carteira`), acima
das duas listas. Ele sobrevive à lista se remontar. O teste
`arquivar tira a linha da lista sem levar a confirmação junto` guarda isso.

---

## Duas frases que eram falsas

A revisão em tela pegou dois erros de texto nos insights:

- **"a maior distância dela hoje"** aparecia em todo indicador abaixo de 80%.
  Numa vendedora com Bolsas, CRM e Valor no vermelho, as três frases se diziam
  a maior. Agora o superlativo é de um só, e quando dois empatam no pior ritmo
  ninguém leva — a frase seria falsa nos dois.

- **"faltam 1 bolsa"**. O verbo agora concorda com o número: falta 1, faltam 3.
