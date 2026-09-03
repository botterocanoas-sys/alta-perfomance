import { execSync } from "node:child_process";

/**
 * Deixa o banco de TESTE com o schema atual e o cadastro do seed, uma vez por
 * execução da suíte.
 *
 * Três passos, nesta ordem:
 *  1. `migrate deploy` aplica as migrações que faltam. É o mesmo comando da
 *     publicação: só avança, nunca apaga.
 *  2. `TRUNCATE` limpa as tabelas do app, para que um teste nunca herde sujeira
 *     da rodada anterior.
 *  3. o seed recria o cadastro fixo.
 *
 * Note que não usamos `prisma migrate reset`: ele derruba o banco inteiro, e um
 * comando desses não deve existir num script que roda sozinho.
 */
export default function preparar() {
  const bancoDeTeste = process.env.DATABASE_URL_TEST;
  if (!bancoDeTeste) throw new Error("DATABASE_URL_TEST não está definida.");

  if (bancoDeTeste === process.env.DATABASE_URL_DESENVOLVIMENTO) {
    throw new Error("DATABASE_URL_TEST aponta para o banco de desenvolvimento.");
  }

  const ambiente = { ...process.env, DATABASE_URL: bancoDeTeste };
  const rodar = (comando: string) => execSync(comando, { stdio: "inherit", env: ambiente });

  rodar("npx prisma migrate deploy");
  rodar("npx tsx tests/limpar-banco.ts");
  rodar("npx tsx prisma/seed.ts");
}
