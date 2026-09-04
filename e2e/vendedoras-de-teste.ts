import { PrismaClient } from "@prisma/client";

/**
 * O seed cria só a configuração; vendedoras nascem na importação.
 *
 * Os testes de isolamento precisam de alguém em cada loja antes de qualquer
 * importação, para provar que a gerente da Barra não enxerga as outras. Estes
 * três nomes existem só aqui e não aparecem no arquivo de exemplo, então nada
 * depende da ordem em que as suítes rodam.
 */
const MARCADORES: Record<string, string> = {
  barra: "ROSANGELA",
  padre: "SOLANGE",
  park: "TATIANE",
};

const prisma = new PrismaClient();

for (const [slug, nome] of Object.entries(MARCADORES)) {
  const loja = await prisma.loja.findUniqueOrThrow({ where: { slug } });
  await prisma.vendedora.upsert({
    where: { lojaId_nome: { lojaId: loja.id, nome } },
    update: {},
    create: { lojaId: loja.id, nome },
  });
}

await prisma.$disconnect();
console.log("Vendedoras de teste criadas:", Object.values(MARCADORES).join(", "));
