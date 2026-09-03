import { PrismaClient } from "@prisma/client";

// Em desenvolvimento o Next recarrega os módulos a cada alteração. Sem este
// cache global, cada recarga abriria uma nova pool de conexões até estourar o
// limite do Postgres.
const globalParaPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalParaPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["warn", "error"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalParaPrisma.prisma = prisma;
