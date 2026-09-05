# Alta Performance Bottero

Acompanhamento diário do programa de incentivo das três lojas Bottero no Rio
Grande do Sul — Barra, Padre e Park.

A gerente abre a página da vendedora e vê, em trinta segundos, quanto ela
ganhou ou perdeu de bônus, como está o mês e qual indicador atacar hoje.

**Estado atual: etapa 8 de 10.** Login e isolamento por loja funcionando; a
importação lê o relatório, confere contra a linha Subtotal e calcula o
resultado de cada dia por diferença; o motor de pontos apura metas, faixas,
pontos e bônus; o painel mostra o resumo do mês e o ranking; e a tela da
reunião traz o veredito do dia, os insights, o que atacar hoje e o registro da
conversa; e o CRM, o cadastro de vendedoras e as metas do mês têm tela própria.
Falta o acabamento visual (etapa 9) e a publicação (etapa 10).

---

## Documentos de decisão

| Arquivo | O que tem |
|---|---|
| [`docs/01-stack-e-modelo-de-dados.md`](docs/01-stack-e-modelo-de-dados.md) | Por que cada peça foi escolhida e o desenho do banco |
| [`docs/02-regras-confirmadas.md`](docs/02-regras-confirmadas.md) | As regras do bônus: faixas, pontos, metas, apuração mensal |
| [`docs/03-correcoes-da-revisao.md`](docs/03-correcoes-da-revisao.md) | O que mudou depois de conferir o relatório real |
| [`docs/04-importacao-e-delta.md`](docs/04-importacao-e-delta.md) | Como o arquivo é lido e como o resultado do dia é calculado |
| [`docs/05-motor-de-pontos.md`](docs/05-motor-de-pontos.md) | Metas, faixas, pontos, bônus e o mapa dos denominadores |
| [`docs/06-painel-da-loja.md`](docs/06-painel-da-loja.md) | As duas leituras de percentual, o ritmo e os selos |
| [`docs/07-tela-da-reuniao.md`](docs/07-tela-da-reuniao.md) | A cobertura da medição, o retorno marginal e a tela da reunião |
| [`docs/08-insights.md`](docs/08-insights.md) | Como cada frase nasce de uma distância numérica |
| [`docs/09-crm-e-cadastro.md`](docs/09-crm-e-cadastro.md) | CRM, as três chaves do cadastro e a trava dos 40 pontos |

Se um número na tela parecer errado, a resposta está no `02`.

---

## Como rodar na sua máquina

Você precisa de [Node.js 20 ou mais novo](https://nodejs.org) e de um banco
Postgres. Para desenvolver, o mais fácil é criar um banco gratuito na
[Neon](https://neon.tech) e usar a URL dele.

```bash
npm install                 # baixa as dependências
cp .env.example .env        # e preencha DATABASE_URL e SESSAO_SECRET
npx prisma migrate deploy   # cria as tabelas
npm run db:seed             # cria as lojas, os 4 logins, as metas e as regras
npm run dev                 # abre em http://localhost:3000
```

Para gerar o `SESSAO_SECRET`, rode `openssl rand -base64 32` e cole o resultado.

### Os quatro logins

| Usuário | Senha | Enxerga |
|---|---|---|
| `gerentebarra` | `barra123` | só a Barra |
| `gerentepadre` | `padre123` | só a Padre |
| `gerentepark` | `park123` | só a Park |
| `admin` | `trocarsenha123` | as três lojas, e importa o relatório |

> ⚠️ **Troque a senha do `admin` antes de colocar no ar.** Ela é provisória e
> está escrita neste arquivo, que fica no GitHub.

---

## Testes

```bash
npm test          # regras: sessão, senha, isolamento por loja
npm run test:e2e  # o mesmo pelo navegador, com o app rodando
```

Os testes usam um banco separado (`DATABASE_URL_TEST`), que é limpo e semeado
a cada execução. O script se recusa a rodar em banco cujo nome não termine em
`_test` — é a trava que impede apagar dados de verdade por engano.

Dois testes valem por muitos:

- **isolamento por loja** — logada como gerente da Barra, nenhuma consulta
  devolve dado de Padre ou Park, nem com o id da outra loja colado no endereço;
- **delta** — os três casos da seção 5 do brief, a virada do mês, o dia
  negativo por devolução e a divisão por zero;
- **pontos** — as fronteiras das faixas (94,9 / 95 / 100 / 110 / 110,1), o
  rateio desigual da Padre e a diferença entre "sem medição" e 0%.

---

## Como o app é organizado

```
prisma/schema.prisma   o banco inteiro, com comentários explicando cada tabela
prisma/seed.ts         lojas, logins, metas e regras. NÃO cria vendedoras:
                       elas nascem na primeira importação do relatório

src/lib/escopo.ts      ⭐ o isolamento por loja. Toda consulta passa por aqui
src/lib/delta.ts       ⭐ o resultado do dia por diferença. Funções puras
src/lib/pontuacao.ts   ⭐ faixas, rateio, mapa dos denominadores, ritmo e degraus
src/lib/reuniao.ts     tudo que a tela da reunião precisa, numa leitura só
src/lib/insights.ts    as frases da conversa, cada uma com um número atrás
src/lib/apuracao.ts    roda o motor sobre o banco e grava a apuração do dia
src/lib/sessao.ts      login e ciclo de vida do token (sem depender do Next)
src/lib/sessao-cookie.ts  a ponte com o cookie do navegador
src/lib/senha.ts       hash Argon2id
src/lib/texto.ts       normalização dos nomes vindos da planilha
src/lib/data.ts        datas no fuso de Porto Alegre
src/lib/relatorio/     parser do .xlsx, importação e recálculo do mês

src/app/entrar/        tela de login
src/app/(privado)/     tudo que exige sessão válida
  painel/              home da gerente
  importar/            upload com prévia (só admin)
  conferencia/         acumulado e resultado do dia lado a lado
  pontos/              metas, percentuais, pontos e bônus do mês
  vendedora/[id]/      a tela da reunião: veredito, o que atacar, registro
  crm/                 lançar as vendas influenciadas pelo CRM, com data retroativa
  vendedoras/          carteira: conta como vendedora, bônus individual, arquivar
  metas/               metas da loja, valor do ponto e pontos por indicador

src/components/        pedaços de tela compartilhados (tabela, selo, formatos)

tests/                 testes de regra (Vitest)
tests/fixtures/        o relatório de exemplo, com nomes fictícios
e2e/                   testes pelo navegador (Playwright)
```

### As duas regras que não podem ser quebradas

1. **Nenhuma consulta monta um filtro de loja por conta própria.** Toda leitura
   usa `escopoDeLojas(sessao)` e toda escrita passa por `exigirAcessoALoja`. Se
   uma tela nova precisar de dados, ela pede o escopo primeiro.

2. **O que veio do relatório nunca é alterado.** Delta, pontos e bônus são
   recalculados a partir da linha crua. Corrigir uma meta refaz o mês inteiro
   sozinho, em vez de deixar números velhos para trás.

3. **Ausência de medição nunca vira zero.** Sem denominador, o indicador fica
   `SEM_MEDICAO` e a tela mostra "sem medição" — nunca 0%, que é medição de
   verdade. As duas rendem 0 ponto, mas dizem coisas diferentes.

4. **Todo número agregado carrega o quanto ele mede.** O ritmo é média
   ponderada de quem foi medido, então vem sempre com "X de 40 pontos
   medidos". Abaixo de metade, o selo nem é emitido.

5. **Nenhuma frase sem número atrás.** Os insights saem de distâncias entre
   meta, realizado e ritmo. Hipótese aparece marcada como hipótese, e a
   decisão volta para quem estava na loja.

6. **Toda gravação recalcula o mês.** Lançar CRM, mudar uma chave do cadastro
   ou corrigir uma meta refaz a pontuação da loja inteira, na mesma transação.

---

## O que falta

| Etapa | |
|---|---|
| 1 | ✅ Stack, modelo de dados e regras do bônus |
| 2 | ✅ Login, os 4 usuários e isolamento por loja |
| 3 | ✅ Importação do relatório, parser e cálculo do delta |
| 4 | ✅ Metas, motor de pontos e bônus |
| 5 | ✅ Painel da loja |
| 6 | ✅ Página da vendedora e registro da reunião |
| 7 | ✅ Insights |
| 8 | ✅ CRM manual, gerenciar vendedoras e metas do mês |
| 9 | Acabamento visual, responsivo, estados vazios |
| 10 | Publicação, com passo a passo e checklist de segurança |
