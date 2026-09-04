import { Prisma, PrismaClient, StatusImportacao } from "@prisma/client";

import { calcularMes, type Acumulado, type ImportacaoOficial } from "@/lib/delta";
import { fimDoMes, mesDe } from "@/lib/data";

/** Aceita tanto o cliente normal quanto o de dentro de uma transação. */
export type Banco = PrismaClient | Prisma.TransactionClient;

/**
 * Refaz `resultado_diario` de um mês inteiro, a partir das linhas cruas.
 *
 * É idempotente de propósito: apaga o mês e recalcula. Rodar duas vezes dá o
 * mesmo resultado, e qualquer correção posterior (uma importação nova, uma
 * importação descartada) se propaga sozinha para o mês todo.
 *
 * A cadeia de delta é montada por vendedora e nunca sai deste mês — o
 * acumulado do relatório zera na virada, e comparar através da fronteira
 * produziria um delta negativo do tamanho do mês inteiro.
 */
export async function recalcularMes(
  banco: Banco,
  mesReferencia: Date,
  lojaIds?: string[],
): Promise<{ diasCalculados: number; vendedoras: number }> {
  const inicio = mesDe(mesReferencia);
  const fim = fimDoMes(inicio);

  // As importações confirmadas do mês. Para cada dia, a oficial é a mais
  // recente — guardamos todas, mas só uma por dia entra na conta.
  const importacoes = await banco.importacao.findMany({
    where: {
      status: StatusImportacao.CONFIRMADA,
      dataReferencia: { gte: inicio, lte: fim },
    },
    orderBy: [{ dataReferencia: "asc" }, { criadaEm: "asc" }],
    select: { id: true, dataReferencia: true },
  });

  const oficialPorDia = new Map<number, string>();
  for (const importacao of importacoes) {
    // Como a lista vem em ordem crescente de criação, a última gravada para
    // cada dia é a mais recente.
    oficialPorDia.set(importacao.dataReferencia.getTime(), importacao.id);
  }
  const idsOficiais = [...oficialPorDia.values()];

  const filtroDeLoja = lojaIds?.length ? { lojaId: { in: lojaIds } } : {};

  // Apaga antes de recalcular: assim uma vendedora que sumiu do relatório não
  // deixa resultado velho para trás.
  await banco.resultadoDiario.deleteMany({
    where: {
      data: { gte: inicio, lte: fim },
      ...(lojaIds?.length ? { vendedora: { lojaId: { in: lojaIds } } } : {}),
    },
  });

  if (idsOficiais.length === 0) return { diasCalculados: 0, vendedoras: 0 };

  const linhas = await banco.acumuladoImportado.findMany({
    where: { importacaoId: { in: idsOficiais }, ...filtroDeLoja },
    include: { importacao: { select: { id: true, dataReferencia: true } } },
  });

  // Agrupa por vendedora. Uma pessoa que só aparece a partir do dia 5 tem a
  // cadeia dela começando no dia 5, com base nula — é a primeira importação
  // DELA no mês, e o acumulado dela até ali é o próprio resultado.
  const porVendedora = new Map<string, ImportacaoOficial<{ importacaoId: string; metaValor: Prisma.Decimal }>[]>();

  for (const linha of linhas) {
    const acumulado: Acumulado = {
      valor: linha.valor.toNumber(),
      calcados: linha.calcados,
      bolsas: linha.bolsas,
      cintos: linha.cintos,
      carteiras: linha.carteiras,
      meias: linha.meias,
      kitCuidado: linha.kitCuidado,
      total: linha.total,
      boletos: linha.boletos,
      oportunidades: linha.oportunidades,
    };

    const serie = porVendedora.get(linha.vendedoraId) ?? [];
    serie.push({
      data: linha.importacao.dataReferencia,
      acumulado,
      referencia: { importacaoId: linha.importacao.id, metaValor: linha.metaValor },
    });
    porVendedora.set(linha.vendedoraId, serie);
  }

  const aGravar: Prisma.ResultadoDiarioCreateManyInput[] = [];

  for (const [vendedoraId, serie] of porVendedora) {
    for (const dia of calcularMes(serie)) {
      aGravar.push({
        vendedoraId,
        data: dia.data,
        importacaoId: dia.origem.importacaoId,
        importacaoBaseId: dia.base?.importacaoId ?? null,
        valor: new Prisma.Decimal(dia.resultado.valor.toFixed(4)),
        calcados: dia.resultado.calcados,
        bolsas: dia.resultado.bolsas,
        boletos: dia.resultado.boletos,
        oportunidades: dia.resultado.oportunidades,
        totalPecas: dia.resultado.total,
        pa: dia.resultado.pa === null ? null : new Prisma.Decimal(dia.resultado.pa.toFixed(4)),
        conversao:
          dia.resultado.conversao === null
            ? null
            : new Prisma.Decimal(dia.resultado.conversao.toFixed(4)),
        metaValorMes: dia.origem.metaValor,
      });
    }
  }

  if (aGravar.length > 0) {
    await banco.resultadoDiario.createMany({ data: aGravar });
  }

  return { diasCalculados: aGravar.length, vendedoras: porVendedora.size };
}
