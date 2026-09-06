# 11 — Publicação

Etapa 10. Como colocar o app no ar, o que conferir antes, e o que fazer todo
dia 1º.

O passo a passo está escrito para ser seguido sem saber programar. Onde algo
pode dar errado, está dito o que aparece na tela quando dá.

---

## O desenho

Duas contas gratuitas, e é só:

- **Neon** guarda o banco de dados. É onde ficam as lojas, os logins, as metas,
  as importações e a pontuação.
- **Vercel** roda o app. É quem serve as páginas e recebe o upload do relatório.

O código fica no GitHub. Toda vez que ele muda, a Vercel publica sozinha.

---

## Antes de começar

Tenha em mãos:

- a conta do GitHub onde está este repositório;
- um e-mail para criar as contas Neon e Vercel (dá para entrar com o GitHub nas
  duas, o que é mais simples).

Reserve uns 30 minutos. Nada aqui é irreversível.

---

## Passo 1 — o banco na Neon

1. Abra <https://neon.tech> e clique em **Sign up**. Escolha *Continue with
   GitHub*.
2. Ela pede para criar um projeto. Preencha:
   - **Project name**: `alta-performance`
   - **Postgres version**: deixe o que vier
   - **Region**: escolha a mais perto do Brasil na lista (normalmente
     *AWS US East* — não existe região no Brasil no plano gratuito, e a
     diferença é de milésimos de segundo).
3. Clique em **Create project**.
4. A tela seguinte mostra uma caixa **Connection string** com um endereço longo
   começando em `postgresql://`. Clique no ícone de copiar.
5. **Guarde esse endereço num lugar seguro.** Ele é a senha do banco inteiro.
   Não mande por WhatsApp nem cole em e-mail.

> Se você fechar a tela antes de copiar: no painel da Neon, menu **Dashboard**,
> botão **Connect**, e a caixa aparece de novo.

---

## Passo 2 — o app na Vercel

1. Abra <https://vercel.com> e clique em **Sign up**. Escolha *Continue with
   GitHub*.
2. No painel, clique em **Add New… → Project**.
3. A Vercel lista seus repositórios do GitHub. Ache `alta-perfomance` e clique
   em **Import**.
4. Ela detecta sozinha que é um projeto Next.js. **Não mude nada** em Framework
   Preset, Build Command nem Output Directory.
5. Antes de clicar em Deploy, abra **Environment Variables** e cadastre uma
   variável, só:

   | Name | Value |
   |---|---|
   | `DATABASE_URL` | o endereço que você copiou da Neon |

   Deixe as três caixinhas marcadas (*Production*, *Preview*, *Development*).

   > **Não cadastre `TZ`.** A Vercel reserva esse nome e recusa com *"O nome da
   > sua variável de ambiente está reservado"*. E não faz falta: o app decide o
   > dia sempre em Porto Alegre, fixo no código, seja qual for o fuso do
   > servidor. O servidor da Vercel roda em UTC e a suíte de testes passa
   > inteira assim.

6. Clique em **Deploy** e espere. Leva uns dois minutos.

Quando terminar, a Vercel mostra um endereço parecido com
`alta-perfomance.vercel.app`. Abra: você vai cair na tela de login. Ainda não
tente entrar — falta o passo 3.

> **Se o deploy falhar** com uma mensagem falando em `P1001` ou
> `Can't reach database server`, o `DATABASE_URL` está errado ou incompleto.
> Copie de novo da Neon, cole em **Settings → Environment Variables**, e clique
> em **Redeploy**.

---

## Passo 3 — criar as lojas e os logins

O banco subiu vazio. Falta criar as três lojas, os quatro logins, as metas do
mês e as regras de pontuação. Isso é uma linha de comando, uma vez só.

Na própria Vercel:

1. Abra o projeto, aba **Storage** não; vá em **Settings → General** e ache o
   botão **Open in Terminal**. Se ele não existir no seu plano, use o caminho
   alternativo abaixo.
2. No terminal, rode:

   ```bash
   npm run db:seed
   ```

**Caminho alternativo (funciona sempre), no seu computador:**

1. Instale o [Node.js](https://nodejs.org) (versão 20 ou mais nova).
2. Baixe o repositório: no GitHub, botão verde **Code → Download ZIP**, e
   descompacte.
3. Abra o Terminal (Mac) ou o Prompt de Comando (Windows) dentro da pasta.
4. Rode, uma linha de cada vez:

   ```bash
   npm install
   npx prisma migrate deploy
   npm run db:seed
   ```

   Antes disso, crie um arquivo chamado `.env` na pasta com uma linha só:

   ```
   DATABASE_URL="cole aqui o endereço da Neon"
   ```

Ao final ele imprime:

```
Seed concluído: { lojas: 3, usuarios: 4, metas: 3, regras: 18, faixas: 12 }
Lembrete: troque a senha do usuário "admin" antes de publicar.
```

**O seed pode ser rodado de novo sem medo.** Ele nunca sobrescreve senha
trocada, meta editada nem regra alterada — só cria o que estiver faltando.

---

## Passo 4 — trocar as quatro senhas

Este passo não é opcional. As senhas iniciais estão escritas no `README.md`,
que está no GitHub.

Para cada um dos quatro logins:

1. Entre no app com o usuário e a senha inicial;
2. clique em **Trocar senha**, no canto superior direito;
3. digite a senha atual, a nova duas vezes, e salve.

Regras da senha nova: no mínimo 10 caracteres, e diferente da antiga. Uma frase
curta funciona bem e é mais fácil de lembrar que uma sequência de símbolos.

Ao trocar, **todas as outras sessões daquele login caem** — se a gerente
estivesse logada no celular, ela vai precisar entrar de novo com a senha nova.
Isso é de propósito: senha comprometida com sessão viva não resolve nada.

| Usuário | Senha inicial | Quem usa |
|---|---|---|
| `admin` | `trocarsenha123` | você — é quem importa o relatório |
| `gerentebarra` | `barra123` | gerente da Barra |
| `gerentepadre` | `padre123` | gerente da Padre |
| `gerentepark` | `park123` | gerente da Park |

Depois de trocadas, apague a tabela acima do `README.md`. Ela só existe para
este momento.

---

## Passo 5 — a primeira importação

1. Entre como `admin`.
2. **Metas do mês**: confira Valor, Pares e Bolsas de cada loja. O seed põe os
   valores do brief; se o mês corrente for outro, ajuste.
3. **Importar relatório**: escolha o `.xlsx`, diga de que dia ele é, e clique em
   *Ler e conferir*.
4. A prévia mostra as três lojas, a conferência contra a linha Subtotal e a
   lista de nomes novos. **Nada foi gravado ainda.** Confira os nomes e confirme.
5. Na Padre, abra **Gerenciar vendedoras** e desmarque *recebe bônus individual*
   na gerente que também vende — ela é remunerada pelo resultado da loja.

Daí em diante o dia a dia é: importar o relatório, lançar o CRM, abrir a página
de cada vendedora para a reunião.

---

## O que fazer todo dia 1º

Uma coisa só: abrir **Metas do mês** em cada loja e preencher Valor, Pares e
Bolsas do mês novo.

Todo o resto já vem preenchido — P.A. 1,6, Conversão 60%, CRM 20%, R$ 15 por
ponto da vendedora, R$ 25 do da gerente, 40 pontos no total e a distribuição por
indicador. Só os três números da loja mudam de mês para mês.

Sem isso, a apuração do mês novo fica zerada e ninguém entende por quê.

---

## Checklist de segurança

Marque tudo antes de considerar o app publicado.

### O que já vem pronto no código

- [x] **Senha nunca guardada em texto.** Argon2id com os parâmetros do OWASP
      (19 MiB, 2 iterações). Um vazamento do banco não entrega senha nenhuma.
- [x] **O cookie de sessão não guarda senha nem dado do usuário** — só um número
      aleatório de 32 bytes. O banco guarda apenas o hash SHA-256 dele: quem
      ler a tabela de sessões não consegue se passar por ninguém.
- [x] **Cookie `httpOnly`, `SameSite=Lax` e `Secure` em produção.** Fora do
      alcance de JavaScript, não viaja em requisição vinda de outro site, e só
      trafega por HTTPS.
- [x] **Sessão expira em 7 dias** e some do banco quando vence.
- [x] **Trocar a senha derruba as outras sessões daquele login.**
- [x] **Isolamento por loja em um módulo só** (`src/lib/escopo.ts`). Toda
      leitura passa por `escopoDeLojas` e toda escrita por `exigirAcessoALoja`.
      Colar o id de outra loja no endereço não funciona: para a gerente, o
      parâmetro é ignorado, não obedecido.
- [x] **Vendedora de outra loja responde 404**, igualzinho a vendedora que não
      existe — nem a mensagem nem o status contam a diferença.
- [x] **A mensagem de login errado é sempre a mesma** para usuário inexistente,
      senha errada e usuário desativado, e leva o mesmo tempo nos três casos.
- [x] **Cabeçalhos de segurança** em toda resposta: `X-Frame-Options: DENY`,
      `nosniff`, `Referrer-Policy: same-origin`, `noindex`, HSTS e
      `Permissions-Policy` desligando câmera, microfone e localização.
- [x] **O app não é indexável.** `noindex` no HTML e no cabeçalho.
- [x] **Nenhum nome real no repositório.** O relatório de exemplo em
      `tests/fixtures/` tem nomes fictícios, e o histórico do Git foi reescrito
      para tirar os reais.
- [x] **O seed não cria vendedora nenhuma.** Elas nascem da primeira importação.

### O que depende de você

- [ ] **Trocar as quatro senhas** (passo 4) e apagar a tabela do `README.md`.
- [ ] **Guardar o `DATABASE_URL` num gerenciador de senhas**, não em conversa.
- [ ] **Ativar a verificação em duas etapas** nas contas GitHub, Vercel e Neon.
      São elas que dão acesso a tudo; a senha do app é a última porta, não a
      primeira.
- [ ] **Conferir se o repositório está privado** no GitHub (Settings →
      General → Danger Zone → Change visibility).
- [ ] **Guardar a senha do `admin` num lugar de onde você a recupere.** É o
      único login que, se perdido, exige linha de comando para voltar.
- [ ] **Não usar o login `admin` no dia a dia.** Ele enxerga as três lojas.
      Para conversar com a equipe de uma loja, use o login daquela loja.
- [ ] **Quem sai da loja, arquive** em Gerenciar vendedoras no mesmo dia. Sem
      isso ela continua entrando nas médias e no rateio das metas.
- [ ] **Backup.** A Neon guarda o histórico dos últimos dias no plano gratuito
      (*Restore*, no painel). Se um dia o programa virar coisa séria de
      auditoria, vale exportar o banco uma vez por mês.

### O que este app deliberadamente não faz

Está escrito aqui para não parecer esquecimento:

- **Não tem recuperação de senha por e-mail.** São quatro pessoas, e um fluxo
  de e-mail seria mais superfície de ataque do que ajuda. Quem esquece a senha
  é atendido pelo admin, na própria tela "Trocar senha" (veja abaixo).
- **Não tem log de auditoria de quem viu o quê.** Registra quem importou e quem
  registrou cada reunião, e para. 
- **Não tem verificação em duas etapas no próprio app.** A porta de entrada real
  são as contas Vercel e Neon; é lá que ela importa.
- **Não limita tentativas de login por minuto.** O app não está indexado, e o
  Argon2id faz cada tentativa custar caro por si só.

---

## Quando alguém esquece a senha

**Gerente esqueceu:** o admin entra, abre **Trocar senha**, e usa o bloco
*Alguém esqueceu a senha* no fim da página. Escolhe a pessoa, digita a senha
nova duas vezes e salva. Combine a senha pessoalmente e peça para ela trocar
assim que entrar.

Ao definir, **todas as sessões dela caem**, inclusive no celular. Quem não
sabia a senha antiga não deve continuar dentro em aparelho nenhum.

**O admin esqueceu:** aí não sobra ninguém dentro do app, e é preciso a linha de
comando, no seu computador, com o `.env` apontando para o banco de produção:

```bash
npx tsx scripts/definir-senha.ts admin "a senha nova aqui"
```

Ele recusa senha com menos de 10 caracteres, avisa se o usuário não existe e
derruba todas as sessões daquele login.

---

## Se algo der errado

| O que aparece | O que é | O que fazer |
|---|---|---|
| Tela branca com "Alguma coisa quebrou" | Erro inesperado no servidor | **Nenhum dado foi alterado** — toda escrita acontece dentro de uma transação. Clique em *Tentar de novo*. Se repetir, mande o código que aparece embaixo (`digest`) |
| "Esta página não existe" | Endereço errado, ou dado de outra loja | Volte ao painel |
| "Sua sessão expirou" | Passaram-se 7 dias, ou a senha foi trocada em outro aparelho | Entre de novo |
| "Aguardando a primeira importação do mês" | Ninguém subiu o relatório ainda | Peça ao admin |
| Números zerados no mês novo | As metas do mês ainda não foram preenchidas | Metas do mês, em cada loja |
| Deploy falhou com `P1001` | `DATABASE_URL` errado na Vercel | Settings → Environment Variables → corrigir → Redeploy |
| "O nome da sua variável de ambiente está reservado" | Você tentou cadastrar `TZ` | Não cadastre. O app não usa variável de fuso |

---

## Duas variáveis que sumiram

**`SESSAO_SECRET`.** Versões anteriores do `.env.example` pediam um. Ele nunca
foi usado por nada: o token de sessão é aleatório e o banco guarda só o hash
dele, então não há o que assinar. Pedir um segredo que não faz nada é pior do
que não pedir — dá a impressão de proteção onde não há mecanismo.

**`TZ`.** Também saiu, por dois motivos que se somam. A Vercel reserva esse
nome e recusa cadastrá-lo. E o app nunca a leu: `src/lib/data.ts` fixa
`America/Sao_Paulo` e faz toda conversão com `Intl` passando o fuso
explicitamente, justamente para não depender de como o servidor está
configurado. `tests/data.test.ts` prova isso — o mesmo instante devolve o mesmo
dia com `TZ` valendo UTC, Tóquio, Los Angeles ou nada.

Isso importa mais do que parece: a extração do relatório sai às 17h50 ou 18h39,
que em UTC é perto da virada do dia. Se o app decidisse o dia pelo fuso do
servidor, a importação da noite cairia no dia seguinte — e o "resultado do dia",
que é a diferença entre duas importações, sairia todo errado.
