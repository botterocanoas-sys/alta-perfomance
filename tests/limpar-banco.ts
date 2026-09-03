import { PrismaClient } from "@prisma/client";

/**
 * Esvazia as tabelas do app no banco de TESTE, antes do seed.
 *
 * Trava de segurança: recusa rodar se a URL não terminar em `_test`. Um
 * descuido aqui apagaria dados de verdade.
 */
const url = process.env.DATABASE_URL ?? "";
const nomeDoBanco = url.split("/").pop()?.split("?")[0] ?? "";

if (!nomeDoBanco.endsWith("_test")) {
  throw new Error(
    `Recusando limpar "${nomeDoBanco}": este script só roda em banco cujo nome termina em _test.`,
  );
}

const TABELAS = [
  "apuracao_dia",
  "apuracao_loja_dia",
  "resultado_diario",
  "acumulado_importado",
  "importacao",
  "crm_diario",
  "reuniao",
  "vendedora_alias",
  "vendedora",
  "sessao",
  "usuario",
  "faixa_pontuacao",
  "regra_pontuacao",
  "config_mes",
  "meta_mensal",
  "loja",
];

const prisma = new PrismaClient();

const alvo = TABELAS.map((tabela) => `"${tabela}"`).join(", ");
await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${alvo} RESTART IDENTITY CASCADE`);
await prisma.$disconnect();

console.log(`Banco de teste "${nomeDoBanco}" limpo.`);
