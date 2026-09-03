# Alta Performance Bottero

Acompanhamento diário do programa de incentivo das três lojas Bottero no Rio
Grande do Sul — Barra, Padre e Park.

A gerente abre a página da vendedora e vê, em trinta segundos, quanto ela
ganhou ou perdeu de bônus, como está o mês e qual indicador atacar hoje.

**Estado atual: etapa 2 de 10.** Login, os quatro usuários e o isolamento por
loja estão funcionando e testados. A importação do relatório e o motor de
pontos vêm nas etapas 3 e 4.

---

## Documentos de decisão

| Arquivo | O que tem |
|---|---|
| [`docs/01-stack-e-modelo-de-dados.md`](docs/01-stack-e-modelo-de-dados.md) | Por que cada peça foi escolhida e o desenho do banco |
| [`docs/02-regras-confirmadas.md`](docs/02-regras-confirmadas.md) | As regras do bônus: faixas, pontos, metas, apuração mensal |
| [`docs/03-correcoes-da-revisao.md`](docs/03-correcoes-da-revisao.md) | O que mudou depois de conferir o relatório real |

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
npm run db:seed             # cria as lojas, os 4 logins e as metas
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

O teste que mais importa é o de isolamento: ele prova que, logada como gerente
da Barra, nenhuma consulta devolve dado de Padre ou Park, nem quando o id da
outra loja é colocado à mão no endereço.

---

## Como o app é organizado

```
prisma/schema.prisma   o banco inteiro, com comentários explicando cada tabela
prisma/seed.ts         lojas, logins, vendedoras, metas e regras de pontuação

src/lib/escopo.ts      ⭐ o isolamento por loja. Toda consulta passa por aqui
src/lib/sessao.ts      login e ciclo de vida do token (sem depender do Next)
src/lib/sessao-cookie.ts  a ponte com o cookie do navegador
src/lib/senha.ts       hash Argon2id
src/lib/texto.ts       normalização dos nomes vindos da planilha

src/app/entrar/        tela de login
src/app/(privado)/     tudo que exige sessão válida

tests/                 testes de regra (Vitest)
e2e/                   testes pelo navegador (Playwright)
```

### As duas regras que não podem ser quebradas

1. **Nenhuma consulta monta um filtro de loja por conta própria.** Toda leitura
   usa `escopoDeLojas(sessao)` e toda escrita passa por `exigirAcessoALoja`. Se
   uma tela nova precisar de dados, ela pede o escopo primeiro.

2. **O que veio do relatório nunca é alterado.** Delta, pontos e bônus são
   recalculados a partir da linha crua. Corrigir uma meta refaz o mês inteiro
   sozinho, em vez de deixar números velhos para trás.

---

## O que falta

| Etapa | |
|---|---|
| 1 | ✅ Stack, modelo de dados e regras do bônus |
| 2 | ✅ Login, os 4 usuários e isolamento por loja |
| 3 | Importação do relatório, parser e cálculo do delta |
| 4 | Metas, motor de pontos e bônus |
| 5 | Painel da loja |
| 6 | Página da vendedora e registro da reunião |
| 7 | Insights |
| 8 | CRM manual e gerenciar vendedoras |
| 9 | Acabamento visual, responsivo, estados vazios |
| 10 | Publicação, com passo a passo e checklist de segurança |
