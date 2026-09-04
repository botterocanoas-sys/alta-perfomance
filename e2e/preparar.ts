import { execSync } from "node:child_process";

/**
 * Deixa o banco de teste no ponto de partida antes da suíte do navegador.
 * Sem isto, a segunda execução herdaria a importação da primeira e o teste
 * "o mesmo arquivo não entra duas vezes" passaria por engano.
 */
export default function preparar() {
  const bancoDeTeste = process.env.DATABASE_URL_TEST;
  if (!bancoDeTeste) throw new Error("DATABASE_URL_TEST não está definida.");

  const ambiente = { ...process.env, DATABASE_URL: bancoDeTeste };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env: ambiente });
  execSync("npx tsx tests/limpar-banco.ts", { stdio: "inherit", env: ambiente });
  execSync("npx tsx prisma/seed.ts", { stdio: "inherit", env: ambiente });
  execSync("npx tsx e2e/vendedoras-de-teste.ts", { stdio: "inherit", env: ambiente });
}
