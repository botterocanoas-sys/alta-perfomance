/**
 * Roda antes de cada arquivo de teste, e antes de qualquer import do Prisma.
 * Aponta o cliente para o banco de teste, para que nenhum teste toque no banco
 * de desenvolvimento.
 */
const bancoDeTeste = process.env.DATABASE_URL_TEST;

if (!bancoDeTeste) {
  throw new Error(
    "DATABASE_URL_TEST não está definida. Copie .env.example para .env e aponte para um banco separado.",
  );
}

process.env.DATABASE_URL = bancoDeTeste;
