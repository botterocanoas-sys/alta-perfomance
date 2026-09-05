import { readFileSync } from "node:fs";
import { Indicador, SituacaoApuracao } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { semear } from "../prisma/seed";

import { recalcularApuracao } from "@/lib/apuracao";
import { diaUtc } from "@/lib/data";
import { prisma } from "@/lib/db";
import { confirmarImportacao, montarPrevia } from "@/lib/relatorio/importar";

/**
 * As telas da etapa 8 mexem no cadastro, e cada mudança precisa se propagar
 * pela pontuação do mês. Estes testes atacam a propagação, que é onde um
 * esquecimento passaria despercebido.
 */

const EXEMPLO = "tests/fixtures/relatorio-exemplo-18h39.xlsx";
const DIA_3 = diaUtc(2026, 9, 3);
const MES = diaUtc(2026, 9, 1);

async function limpar() {
  await prisma.apuracaoDia.deleteMany();
  await prisma.apuracaoLojaDia.deleteMany();
  await prisma.resultadoDiario.deleteMany();
  await prisma.acumuladoImportado.deleteMany();
  await prisma.importacao.deleteMany();
  await prisma.crmDiario.deleteMany();
  await prisma.vendedoraAlias.deleteMany();
  await prisma.vendedora.deleteMany();
}

beforeEach(async () => {
  await limpar();
  const conteudo = readFileSync(EXEMPLO);
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { username: "admin" } });
  const previa = await montarPrevia(conteudo, "exemplo.xlsx", DIA_3);
  await confirmarImportacao({
    conteudo,
    arquivoNome: "exemplo.xlsx",
    dataReferencia: DIA_3,
    usuarioId: admin.id,
    nomesAutorizados: previa.nomesNovos.map((novo) => novo.chave),
  });
});

afterAll(async () => {
  await limpar();
  await semear(prisma as never);
});

const barra = () => prisma.loja.findUniqueOrThrow({ where: { slug: "barra" } });

async function vendedora(slug: string, nome: string) {
  const loja = await prisma.loja.findUniqueOrThrow({ where: { slug } });
  return prisma.vendedora.findUniqueOrThrow({
    where: { lojaId_nome: { lojaId: loja.id, nome } },
  });
}

async function apuracao(vendedoraId: string, indicador: Indicador) {
  return prisma.apuracaoDia.findUniqueOrThrow({
    where: { vendedoraId_data_indicador: { vendedoraId, data: DIA_3, indicador } },
  });
}

describe("lançar CRM muda a pontuação do mês", () => {
  it("o CRM sai de 0% e vira pontos", async () => {
    const tereza = await vendedora("barra", "TEREZA");
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { username: "admin" } });

    const antes = await apuracao(tereza.id, Indicador.CRM);
    expect(antes.pct!.toNumber()).toBe(0);
    expect(antes.pontos.toNumber()).toBe(0);

    // 3 das 7 vendas dela vieram do CRM: 43%, contra a meta de 20%.
    await prisma.crmDiario.create({
      data: { vendedoraId: tereza.id, data: DIA_3, vendasInfluenciadas: 3, registradoPor: admin.id },
    });
    await recalcularApuracao(prisma, MES, [tereza.lojaId]);

    const depois = await apuracao(tereza.id, Indicador.CRM);
    expect(depois.acumulado!.toNumber()).toBeCloseTo(3 / 7, 4);
    expect(depois.pontos.toNumber()).toBe(3);
  });

  it("corrigir o lançamento refaz a conta, sem duplicar", async () => {
    const tereza = await vendedora("barra", "TEREZA");
    const admin = await prisma.usuario.findUniqueOrThrow({ where: { username: "admin" } });

    for (const quantidade of [3, 1]) {
      await prisma.crmDiario.upsert({
        where: { vendedoraId_data: { vendedoraId: tereza.id, data: DIA_3 } },
        update: { vendasInfluenciadas: quantidade },
        create: {
          vendedoraId: tereza.id,
          data: DIA_3,
          vendasInfluenciadas: quantidade,
          registradoPor: admin.id,
        },
      });
      await recalcularApuracao(prisma, MES, [tereza.lojaId]);
    }

    expect(await prisma.crmDiario.count({ where: { vendedoraId: tereza.id } })).toBe(1);
    const depois = await apuracao(tereza.id, Indicador.CRM);
    expect(depois.acumulado!.toNumber()).toBeCloseTo(1 / 7, 4);
  });
});

describe("as três chaves do cadastro", () => {
  it("'conta como vendedora' tira a pessoa do rateio e do total da loja", async () => {
    const loja = await barra();
    const tereza = await vendedora("barra", "TEREZA");

    const totalAntes = (
      await prisma.apuracaoLojaDia.findUniqueOrThrow({
        where: { lojaId_data_indicador: { lojaId: loja.id, data: DIA_3, indicador: Indicador.VALOR } },
      })
    ).acumulado!.toNumber();

    const paresAntes = (await apuracao((await vendedora("barra", "XIMENA")).id, Indicador.PARES))
      .meta!.toNumber();

    await prisma.vendedora.update({
      where: { id: tereza.id },
      data: { contaComoVendedora: false },
    });
    await recalcularApuracao(prisma, MES, [loja.id]);

    // Sai do total da loja...
    const totalDepois = (
      await prisma.apuracaoLojaDia.findUniqueOrThrow({
        where: { lojaId_data_indicador: { lojaId: loja.id, data: DIA_3, indicador: Indicador.VALOR } },
      })
    ).acumulado!.toNumber();
    expect(totalDepois).toBeLessThan(totalAntes);
    expect(totalAntes - totalDepois).toBeCloseTo(2014.24, 2);

    // ...e a meta de Pares das outras cresce, porque o rateio é entre menos gente.
    const paresDepois = (await apuracao((await vendedora("barra", "XIMENA")).id, Indicador.PARES))
      .meta!.toNumber();
    expect(paresDepois).toBeGreaterThan(paresAntes);

    // Ela própria fica fora da apuração.
    const dela = await apuracao(tereza.id, Indicador.VALOR);
    expect(dela.situacao).toBe(SituacaoApuracao.FORA_DA_APURACAO);
  });

  it("'recebe bônus individual' zera o dinheiro sem apagar a apuração", async () => {
    const loja = await barra();
    const tereza = await vendedora("barra", "TEREZA");

    await prisma.vendedora.update({
      where: { id: tereza.id },
      data: { recebeBonusVendedora: false },
    });
    await recalcularApuracao(prisma, MES, [loja.id]);

    const linhas = await prisma.apuracaoDia.findMany({
      where: { vendedoraId: tereza.id, data: DIA_3 },
    });

    // Os números continuam: servem para a conversa da reunião.
    expect(linhas).toHaveLength(6);
    expect(linhas.some((l) => l.pct !== null)).toBe(true);
    expect(linhas.every((l) => l.bonusReais.toNumber() === 0)).toBe(true);

    // E ela continua dentro do total da loja.
    const total = await prisma.apuracaoLojaDia.findUniqueOrThrow({
      where: { lojaId_data_indicador: { lojaId: loja.id, data: DIA_3, indicador: Indicador.VALOR } },
    });
    expect(total.acumulado!.toNumber()).toBeCloseTo(3863.67, 2);
  });

  it("arquivar não apaga o histórico", async () => {
    const tereza = await vendedora("barra", "TEREZA");

    await prisma.vendedora.update({
      where: { id: tereza.id },
      data: { arquivadaEm: DIA_3 },
    });
    await recalcularApuracao(prisma, MES, [tereza.lojaId]);

    expect(
      await prisma.apuracaoDia.count({ where: { vendedoraId: tereza.id, data: DIA_3 } }),
    ).toBe(6);
    expect(await prisma.resultadoDiario.count({ where: { vendedoraId: tereza.id } })).toBe(1);
  });
});

describe("mudar as metas refaz o mês", () => {
  it("dobrar a meta de Pares derruba o percentual pela metade", async () => {
    const loja = await barra();
    const tereza = await vendedora("barra", "TEREZA");

    const antes = await apuracao(tereza.id, Indicador.PARES);

    await prisma.metaMensal.update({
      where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: MES } },
      data: { paresLoja: 680 }, // era 340
    });
    await recalcularApuracao(prisma, MES, [loja.id]);

    const depois = await apuracao(tereza.id, Indicador.PARES);
    expect(depois.meta!.toNumber()).toBeCloseTo(antes.meta!.toNumber() * 2, 2);
    expect(depois.pct!.toNumber()).toBeCloseTo(antes.pct!.toNumber() / 2, 4);
  });

  it("mudar o modo de rateio para IGUAL redistribui as metas", async () => {
    const loja = await prisma.loja.findUniqueOrThrow({ where: { slug: "padre" } });
    const clarice = await vendedora("padre", "CLARICE");
    const elisa = await vendedora("padre", "ELISA");

    // No proporcional, 190 pares viram 38 e 152.
    expect((await apuracao(clarice.id, Indicador.PARES)).meta!.toNumber()).toBeCloseTo(38, 1);

    await prisma.metaMensal.update({
      where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: MES } },
      data: { modoRateio: "IGUAL" },
    });
    await recalcularApuracao(prisma, MES, [loja.id]);

    // No igual, 95 para cada.
    expect((await apuracao(clarice.id, Indicador.PARES)).meta!.toNumber()).toBeCloseTo(95, 1);
    expect((await apuracao(elisa.id, Indicador.PARES)).meta!.toNumber()).toBeCloseTo(95, 1);
  });

  it("mudar os pontos de um indicador muda o que ele paga", async () => {
    const loja = await barra();
    const tereza = await vendedora("barra", "TEREZA");

    // Deixa o Valor valer o dobro, tirando de Pares para o total continuar 40.
    await prisma.regraPontuacao.update({
      where: {
        lojaId_mesReferencia_indicador: { lojaId: loja.id, mesReferencia: MES, indicador: Indicador.VALOR },
      },
      data: { pontosBase: 20, pontosAlto: 22 },
    });
    await prisma.regraPontuacao.update({
      where: {
        lojaId_mesReferencia_indicador: { lojaId: loja.id, mesReferencia: MES, indicador: Indicador.PARES },
      },
      data: { pontosBase: 1, pontosAlto: 0 },
    });

    const resumo = await recalcularApuracao(prisma, MES, [loja.id]);

    // 22 + 0 + 7 + 5 + 3 + 3 = 40: continua fechando.
    expect(resumo.pontuacaoDesbalanceada).toHaveLength(0);

    const valor = await apuracao(tereza.id, Indicador.VALOR);
    // Ela está acima do ritmo em Valor, então recebe a base nova.
    if (valor.faixa === "BASE") expect(valor.pontos.toNumber()).toBe(20);
  });

  it("desligar um indicador tira ele da apuração de todo mundo", async () => {
    const loja = await barra();

    await prisma.regraPontuacao.update({
      where: {
        lojaId_mesReferencia_indicador: { lojaId: loja.id, mesReferencia: MES, indicador: Indicador.CRM },
      },
      data: { ativo: false, pontosAlto: 0 },
    });
    await recalcularApuracao(prisma, MES, [loja.id]);

    const linhas = await prisma.apuracaoDia.findMany({
      where: { data: DIA_3, indicador: Indicador.CRM, vendedora: { lojaId: loja.id } },
    });

    expect(linhas.length).toBeGreaterThan(0);
    expect(linhas.every((l) => l.situacao === SituacaoApuracao.FORA_DA_APURACAO)).toBe(true);
    expect(linhas.every((l) => l.pontos.toNumber() === 0)).toBe(true);
  });

  it("apagar a meta do mês para a apuração, e avisa qual loja", async () => {
    const loja = await barra();

    await prisma.metaMensal.delete({
      where: { lojaId_mesReferencia: { lojaId: loja.id, mesReferencia: MES } },
    });
    const resumo = await recalcularApuracao(prisma, MES, [loja.id]);

    expect(resumo.semMeta).toContain("Barra");
    expect(await prisma.apuracaoDia.count({ where: { vendedora: { lojaId: loja.id } } })).toBe(0);
    // Mas o resultado diário, que vem do relatório, continua intacto.
    expect(await prisma.resultadoDiario.count({ where: { vendedora: { lojaId: loja.id } } })).toBe(6);
  });
});
