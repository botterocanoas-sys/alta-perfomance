/**
 * Define a senha de um usuário pela linha de comando.
 *
 * Último recurso, para o caso em que quem esqueceu a senha é o próprio admin —
 * aí não sobra ninguém dentro do app para redefinir. No dia a dia use a tela
 * "Trocar senha": o admin redefine a de qualquer gerente por lá.
 *
 * Uso:
 *   DATABASE_URL="..." npx tsx scripts/definir-senha.ts admin "a senha nova"
 *
 * Como toda redefinição, derruba todas as sessões daquele login.
 */
import { PrismaClient } from "@prisma/client";

import { gerarHashDeSenha } from "../src/lib/senha";
import { MINIMO_DA_SENHA } from "../src/lib/sessao";

const [username, senha] = process.argv.slice(2);

if (!username || !senha) {
  console.error('Uso: npx tsx scripts/definir-senha.ts <usuario> "<senha nova>"');
  process.exit(1);
}

if (senha.length < MINIMO_DA_SENHA) {
  console.error(`A senha precisa ter pelo menos ${MINIMO_DA_SENHA} caracteres.`);
  process.exit(1);
}

const prisma = new PrismaClient();

try {
  const usuario = await prisma.usuario.findUnique({ where: { username } });
  if (!usuario) {
    const todos = await prisma.usuario.findMany({ select: { username: true } });
    console.error(
      `Não existe o usuário "${username}". Os que existem: ${todos.map((u) => u.username).join(", ")}.`,
    );
    process.exit(1);
  }

  await prisma.$transaction([
    prisma.usuario.update({
      where: { id: usuario.id },
      data: { senhaHash: await gerarHashDeSenha(senha) },
    }),
    prisma.sessao.deleteMany({ where: { usuarioId: usuario.id } }),
  ]);

  console.log(`Senha de "${username}" definida. Todas as sessões dele caíram.`);
} finally {
  await prisma.$disconnect();
}
