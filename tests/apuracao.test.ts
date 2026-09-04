import { readFileSync } from "node:fs";
import { Indicador, SituacaoApuracao, TipoFaixa } from "@prisma/client";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { semear } from "../prisma/seed";

import { lerApuracao, recalcularApuracao } from "@/lib/apuracao";
import { diaUtc } from "@/lib/data";
import { prisma } from "@/lib/db";
import { confirmarImportacao, montarPrevia } from "@/lib/relatorio/importar";
import { CHAVES, montarRelatorio } from "./planilha";

/**
 * O motor de pontos rodando sobre o banco: importa, calcula o delta, apura e
 * grava. Os números conferidos aqui são os do arquivo de exemplo — o mesmo
 * relatório real, com os nomes trocados.
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

beforeEach(limpar);
afterAll(async () => {
  await limpar();
  await semear(prisma as never);
});

async function adminId() {
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { username: "admin" } });
  return admin.id;
}

async function importar(conteudo: Buffer, nome: string, data: Date) {
  const previa = await montarPrevia(conteudo, nome, data);
  expect(previa.erros, `erros ao importar ${nome}`).toEqual([]);

  return confirmarImportacao({
    conteudo,
    arquivoNome: nome,
    dataReferencia: data,
    usuarioId: await adminId(),
    nomesAutorizados: previa.nomesNovos.map((novo) => novo.chave),
  });
}

const lojaPorSlug = (slug: string) => prisma.loja.findUniqueOrThrow({ where: { slug } });

async function apuracaoDe(slug: string, nome: string, indicador: Indicador, data = DIA_3) {
  const loja = await lojaPorSlug(slug);
  const vendedora = await prisma.vendedora.findUniqueOrThrow({
    where: { lojaId_nome: { lojaId: loja.id, nome } },
  });
  return prisma.apuracaoDia.findUniqueOrThrow({
    where: { vendedoraId_data_indicador: { vendedoraId: vendedora.id, data, indicador } },
  });
}

describe("apuração sobre o arquivo de exemplo", () => {
  beforeEach(async () => {
    await importar(readFileSync(EXEMPLO), "exemplo.xlsx", DIA_3);
  });

  it("grava seis indicadores por vendedora e por loja", async () => {
    // 16 pessoas × 6 indicadores.
    expect(await prisma.apuracaoDia.count()).toBe(96);
    // 3 lojas × 6 indicadores.
    expect(await prisma.apuracaoLojaDia.count()).toBe(18);
  });

  it("a meta de Valor vem do relatório, nunca calculada", async () => {
    const tereza = await apuracaoDe("barra", "TEREZA", Indicador.VALOR);
    expect(tereza.meta!.toNumber()).toBe(33333);

    const clarice = await apuracaoDe("padre", "CLARICE", Indicador.VALOR);
    expect(clarice.meta!.toNumber()).toBe(11000);

    const elisa = await apuracaoDe("padre", "ELISA", Indicador.VALOR);
    expect(elisa.meta!.toNumber()).toBe(44000);
  });

  it("Pares e Bolsas seguem o peso da meta de Valor, e não a divisão igual", async () => {
    // Padre: meta de 190 pares, dividida 20/80 conforme 11.000 e 44.000.
    const clarice = await apuracaoDe("padre", "CLARICE", Indicador.PARES);
    const elisa = await apuracaoDe("padre", "ELISA", Indicador.PARES);

    expect(clarice.meta!.toNumber()).toBeCloseTo(38, 2);
    expect(elisa.meta!.toNumber()).toBeCloseTo(152, 2);
    // A divisão igual daria 95 para cada — o erro que isto evita.
    expect(clarice.meta!.toNumber()).not.toBeCloseTo(95, 0);
  });

  it("Park divide igual porque as metas de Valor já são iguais", async () => {
    // 240 pares entre 4 vendedoras de 17.500 cada.
    for (const nome of ["IRENE", "LARISSA", "BEATRIZ", "VERÔNICA".normalize("NFD").replace(/[̀-ͯ]/g, "")]) {
      const apurada = await apuracaoDe("park", nome, Indicador.PARES);
      expect(apurada.meta!.toNumber(), nome).toBeCloseTo(60, 2);
    }
  });

  it("P.A., Conversão e CRM têm a mesma meta da loja", async () => {
    const pa = await apuracaoDe("barra", "TEREZA", Indicador.PA);
    const conversao = await apuracaoDe("barra", "TEREZA", Indicador.CONVERSAO);
    const crm = await apuracaoDe("barra", "TEREZA", Indicador.CRM);

    expect(pa.meta!.toNumber()).toBe(1.6);
    expect(conversao.meta!.toNumber()).toBe(0.6);
    expect(crm.meta!.toNumber()).toBe(0.2);
  });

  it("quem tem meta zero fica fora da apuração em todos os indicadores", async () => {
    for (const indicador of Object.values(Indicador)) {
      const alvaro = await apuracaoDe("barra", "ALVARO", indicador);
      expect(alvaro.situacao, indicador).toBe(SituacaoApuracao.FORA_DA_APURACAO);
      expect(alvaro.pct, indicador).toBeNull();
      expect(alvaro.pontos.toNumber(), indicador).toBe(0);
    }
  });

  it("a meta de quantidade é proporcional aos dias corridos", async () => {
    // Dia 3 de setembro: 3 de 30 dias, ou um décimo da meta do mês.
    const tereza = await apuracaoDe("barra", "TEREZA", Indicador.VALOR);

    expect(tereza.diasDecorridos).toBe(3);
    expect(tereza.diasDoMes).toBe(30);
    expect(tereza.metaProporcional!.toNumber()).toBeCloseTo(3333.3, 1);
  });

  it("a meta de razão não é proporcional", async () => {
    const pa = await apuracaoDe("barra", "TEREZA", Indicador.PA);
    expect(pa.metaProporcional!.toNumber()).toBe(1.6);
  });

  it("o P.A. da Tereza é 8 peças ÷ 7 boletos, e passa da meta", async () => {
    const pa = await apuracaoDe("barra", "TEREZA", Indicador.PA);

    expect(pa.situacao).toBe(SituacaoApuracao.APURADA);
    expect(pa.acumulado!.toNumber()).toBeCloseTo(8 / 7, 3);
    expect(pa.pct!.toNumber()).toBeCloseTo(8 / 7 / 1.6, 3); // 71% da meta
    expect(pa.faixa).toBe(TipoFaixa.ZERO);
  });

  it("quem atendeu e não vendeu tem P.A. sem medição e Conversão em 0%", async () => {
    // No arquivo, VERÔNICA tem meta 17.500, 3 oportunidades e 0 boletos.
    const nome = "VERONICA";
    const pa = await apuracaoDe("park", nome, Indicador.PA);
    const conversao = await apuracaoDe("park", nome, Indicador.CONVERSAO);
    const crm = await apuracaoDe("park", nome, Indicador.CRM);

    expect(pa.situacao).toBe(SituacaoApuracao.SEM_MEDICAO);
    expect(pa.pct).toBeNull();

    // 0 boletos em 3 oportunidades é 0% de verdade — medição, não ausência.
    expect(conversao.situacao).toBe(SituacaoApuracao.APURADA);
    expect(conversao.pct!.toNumber()).toBe(0);
    expect(conversao.faixa).toBe(TipoFaixa.ZERO);

    // CRM divide por boletos: sem boleto, não há proporção.
    expect(crm.situacao).toBe(SituacaoApuracao.SEM_MEDICAO);
    expect(crm.pct).toBeNull();
  });

  it("sem medição e 0% rendem os mesmos pontos, com situações diferentes", async () => {
    const pa = await apuracaoDe("park", "VERONICA", Indicador.PA);
    const conversao = await apuracaoDe("park", "VERONICA", Indicador.CONVERSAO);

    expect(pa.pontos.toNumber()).toBe(0);
    expect(conversao.pontos.toNumber()).toBe(0);
    expect(pa.situacao).not.toBe(conversao.situacao);
  });

  it("a loja é apurada contra a meta cheia, só com quem está no programa", async () => {
    const barra = await lojaPorSlug("barra");
    const valor = await prisma.apuracaoLojaDia.findUniqueOrThrow({
      where: { lojaId_data_indicador: { lojaId: barra.id, data: DIA_3, indicador: Indicador.VALOR } },
    });

    expect(valor.meta!.toNumber()).toBe(100000);
    // 279,90 + 1.569,53 + 2.014,24 das três com meta. Quem tem meta zero fica fora.
    expect(valor.acumulado!.toNumber()).toBeCloseTo(3863.67, 2);
    expect(valor.metaProporcional!.toNumber()).toBeCloseTo(10000, 2);
  });

  it("o bônus da gerente vale R$ 25 por ponto", async () => {
    const barra = await lojaPorSlug("barra");
    const linhas = await prisma.apuracaoLojaDia.findMany({ where: { lojaId: barra.id, data: DIA_3 } });

    for (const linha of linhas) {
      expect(linha.bonusReais.toNumber()).toBeCloseTo(linha.pontos.toNumber() * 25, 2);
    }
  });

  it("o bônus da vendedora vale R$ 15 por ponto", async () => {
    const tereza = await apuracaoDe("barra", "TEREZA", Indicador.VALOR);
    expect(tereza.bonusReais.toNumber()).toBeCloseTo(tereza.pontos.toNumber() * 15, 2);
  });
});

describe("a gerente que também vende", () => {
  it("é apurada normalmente, com o bônus de vendedora zerado", async () => {
    await importar(readFileSync(EXEMPLO), "exemplo.xlsx", DIA_3);

    const padre = await lojaPorSlug("padre");
    const clarice = await prisma.vendedora.findUniqueOrThrow({
      where: { lojaId_nome: { lojaId: padre.id, nome: "CLARICE" } },
    });

    // Marca como a gerente que vende — na etapa 8 isto vira uma tela.
    await prisma.vendedora.update({
      where: { id: clarice.id },
      data: { recebeBonusVendedora: false },
    });
    await recalcularApuracao(prisma, MES, [padre.id]);

    const linhas = await prisma.apuracaoDia.findMany({
      where: { vendedoraId: clarice.id, data: DIA_3 },
    });

    // A apuração continua existindo: os números dela servem para a conversa.
    expect(linhas).toHaveLength(6);
    expect(linhas.some((linha) => linha.meta !== null)).toBe(true);
    // Só o dinheiro é zerado.
    expect(linhas.every((linha) => linha.bonusReais.toNumber() === 0)).toBe(true);

    // E ela continua dentro do total da loja: os 11.000 fazem parte dos 55.000.
    const valorDaLoja = await prisma.apuracaoLojaDia.findUniqueOrThrow({
      where: { lojaId_data_indicador: { lojaId: padre.id, data: DIA_3, indicador: Indicador.VALOR } },
    });
    expect(valorDaLoja.meta!.toNumber()).toBe(55000);
  });
});

describe("o CRM entra na conta", () => {
  it("lançar CRM muda a pontuação sem tocar no relatório", async () => {
    const conteudo = montarRelatorio([
      {
        loja: CHAVES.barra,
        linhas: [
          { nome: "TEREZA", meta: 33333, valor: 12000, boletos: 10, oportunidades: 16, calcados: 18 },
          { nome: "XIMENA", meta: 33334, valor: 11000, boletos: 9, oportunidades: 15, calcados: 15 },
          { nome: "JULIANA", meta: 33333, valor: 11000, boletos: 9, oportunidades: 15, calcados: 15 },
        ],
      },
    ]);
    await importar(conteudo, "com-vendas.xlsx", DIA_3);

    const antes = await apuracaoDe("barra", "TEREZA", Indicador.CRM);
    // Sem lançamento, a proporção é 0 de 10 boletos: medição de verdade, 0%.
    expect(antes.situacao).toBe(SituacaoApuracao.APURADA);
    expect(antes.pct!.toNumber()).toBe(0);
    expect(antes.pontos.toNumber()).toBe(0);

    const barra = await lojaPorSlug("barra");
    const tereza = await prisma.vendedora.findUniqueOrThrow({
      where: { lojaId_nome: { lojaId: barra.id, nome: "TEREZA" } },
    });
    const admin = await adminId();

    // 3 de 10 vendas influenciadas pelo CRM: 30%, contra a meta de 20%.
    await prisma.crmDiario.create({
      data: { vendedoraId: tereza.id, data: DIA_3, vendasInfluenciadas: 3, registradoPor: admin },
    });
    await recalcularApuracao(prisma, MES, [barra.id]);

    const depois = await apuracaoDe("barra", "TEREZA", Indicador.CRM);
    expect(depois.acumulado!.toNumber()).toBeCloseTo(0.3, 4);
    expect(depois.pct!.toNumber()).toBeCloseTo(1.5, 4);
    expect(depois.faixa).toBe(TipoFaixa.ALTO);
    expect(depois.pontos.toNumber()).toBe(3);
  });
});

describe("o acumulado do mês, dia a dia", () => {
  const dia = (valor: number, boletos: number, oportunidades: number, calcados: number) => [
    {
      loja: CHAVES.barra,
      linhas: [
        { nome: "TEREZA", meta: 33333, valor, boletos, oportunidades, calcados },
        { nome: "XIMENA", meta: 33334, valor: 0, boletos: 0, oportunidades: 0, calcados: 0 },
        { nome: "JULIANA", meta: 33333, valor: 0, boletos: 0, oportunidades: 0, calcados: 0 },
      ],
    },
  ];

  it("o percentual de cada dia é o da tendência daquele dia", async () => {
    // Meta de 33.333 no mês. Um terço dela em 10 dias é exatamente 100% do ritmo.
    await importar(montarRelatorio(dia(5000, 10, 20, 12)), "d5.xlsx", diaUtc(2026, 9, 5));
    await importar(montarRelatorio(dia(11111, 22, 44, 26)), "d10.xlsx", diaUtc(2026, 9, 10));

    const noDia10 = await apuracaoDe("barra", "TEREZA", Indicador.VALOR, diaUtc(2026, 9, 10));

    expect(noDia10.diasDecorridos).toBe(10);
    expect(noDia10.metaProporcional!.toNumber()).toBeCloseTo(11111, 0);
    expect(noDia10.pct!.toNumber()).toBeCloseTo(1, 3);
    expect(noDia10.faixa).toBe(TipoFaixa.BASE);
  });

  it("recalcular é idempotente", async () => {
    await importar(montarRelatorio(dia(5000, 10, 20, 12)), "d5.xlsx", diaUtc(2026, 9, 5));

    const barra = await lojaPorSlug("barra");
    const antes = await prisma.apuracaoDia.count();
    await recalcularApuracao(prisma, MES, [barra.id]);
    await recalcularApuracao(prisma, MES, [barra.id]);

    expect(await prisma.apuracaoDia.count()).toBe(antes);
  });

  it("o teto de 40 pontos vale por mês, não por dia", async () => {
    await importar(montarRelatorio(dia(50000, 60, 70, 200)), "estourou.xlsx", diaUtc(2026, 9, 5));

    const barra = await lojaPorSlug("barra");
    const tereza = await prisma.vendedora.findUniqueOrThrow({
      where: { lojaId_nome: { lojaId: barra.id, nome: "TEREZA" } },
    });
    const linhas = await prisma.apuracaoDia.findMany({
      where: { vendedoraId: tereza.id, data: diaUtc(2026, 9, 5) },
    });

    const pontos = linhas.reduce((soma, linha) => soma + linha.pontos.toNumber(), 0);
    expect(pontos).toBeLessThanOrEqual(40);
  });
});

describe("leitura para as telas", () => {
  it("devolve o ranking ordenado e a apuração da gerente", async () => {
    await importar(readFileSync(EXEMPLO), "exemplo.xlsx", DIA_3);

    const barra = await lojaPorSlug("barra");
    const apuracao = await lerApuracao(prisma, barra.id);

    expect(apuracao.data?.getTime()).toBe(DIA_3.getTime());
    expect(apuracao.diasDecorridos).toBe(3);
    expect(apuracao.diasDoMes).toBe(30);
    expect(apuracao.vendedoras.length).toBe(6);
    expect(apuracao.gerente).not.toBeNull();

    // Ordenado por pontos, do maior para o menor.
    const pontos = apuracao.vendedoras.map((v) => v.pontos);
    expect([...pontos].sort((a, b) => b - a)).toEqual(pontos);

    for (const vendedora of apuracao.vendedoras) {
      expect(vendedora.porIndicador).toHaveLength(6);
    }
  });

  it("sem apuração nenhuma, devolve vazio em vez de quebrar", async () => {
    const barra = await lojaPorSlug("barra");
    const apuracao = await lerApuracao(prisma, barra.id);

    expect(apuracao.data).toBeNull();
    expect(apuracao.vendedoras).toEqual([]);
    expect(apuracao.gerente).toBeNull();
  });
});

describe("quando falta cadastro", () => {
  it("loja sem meta do mês não apura, e o recálculo avisa qual", async () => {
    await importar(readFileSync(EXEMPLO), "exemplo.xlsx", DIA_3);

    const park = await lojaPorSlug("park");
    await prisma.metaMensal.delete({
      where: { lojaId_mesReferencia: { lojaId: park.id, mesReferencia: MES } },
    });

    const resumo = await recalcularApuracao(prisma, MES, [park.id]);

    expect(resumo.semMeta).toContain("Park");
    expect(await prisma.apuracaoDia.count({ where: { vendedora: { lojaId: park.id } } })).toBe(0);
  });

  it("avisa quando a soma dos pontos alto não fecha em 40", async () => {
    await importar(readFileSync(EXEMPLO), "exemplo.xlsx", DIA_3);

    const barra = await lojaPorSlug("barra");
    await prisma.regraPontuacao.update({
      where: {
        lojaId_mesReferencia_indicador: {
          lojaId: barra.id,
          mesReferencia: MES,
          indicador: Indicador.VALOR,
        },
      },
      data: { pontosAlto: 20 },
    });

    const resumo = await recalcularApuracao(prisma, MES, [barra.id]);

    expect(resumo.pontuacaoDesbalanceada).toHaveLength(1);
    expect(resumo.pontuacaoDesbalanceada[0]).toMatchObject({ loja: "Barra", soma: 45, esperado: 40 });
  });
});
