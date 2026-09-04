import { readFileSync } from "node:fs";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { semear } from "../prisma/seed";

import { prisma } from "@/lib/db";
import { diaUtc } from "@/lib/data";
import { RelatorioInvalido } from "@/lib/relatorio/parser";
import { confirmarImportacao, montarPrevia } from "@/lib/relatorio/importar";
import { normalizar } from "@/lib/texto";
import { CHAVES, montarRelatorio } from "./planilha";

/**
 * A importação de ponta a ponta: ler o arquivo, conferir, gravar e recalcular
 * os deltas do mês. Bate no banco de teste de verdade.
 */

const EXEMPLO = "tests/fixtures/relatorio-exemplo-18h39.xlsx";
const DIA_3 = diaUtc(2026, 9, 3);

async function adminId(): Promise<string> {
  const admin = await prisma.usuario.findUniqueOrThrow({ where: { username: "admin" } });
  return admin.id;
}

/** Limpa só o que a importação cria, preservando o cadastro do seed. */
async function limparImportacoes() {
  await prisma.resultadoDiario.deleteMany();
  await prisma.acumuladoImportado.deleteMany();
  await prisma.importacao.deleteMany();
  await prisma.vendedoraAlias.deleteMany({ where: { vendedora: { criadaEm: { gt: new Date(0) } } } });
  await prisma.vendedora.deleteMany();
}

beforeEach(async () => {
  await limparImportacoes();
});

// Estes testes apagam as vendedoras de propósito, para exercitar a primeira
// importação do app. O cadastro é devolvido no fim, para não derrubar as outras
// suítes, que compartilham o mesmo banco de teste.
afterAll(async () => {
  await limparImportacoes();
  await semear(prisma as never);
});

describe("prévia do arquivo de exemplo", () => {
  it("reconhece as três lojas e não grava nada", async () => {
    const previa = await montarPrevia(readFileSync(EXEMPLO), "relatorio-18h39.xlsx", DIA_3);

    expect(previa.erros).toEqual([]);
    expect(previa.lojas).toHaveLength(3);
    expect(await prisma.importacao.count()).toBe(0);
    expect(await prisma.acumuladoImportado.count()).toBe(0);
  });

  it("a soma de cada loja bate com a linha Subtotal", async () => {
    const previa = await montarPrevia(readFileSync(EXEMPLO), "relatorio-18h39.xlsx", DIA_3);

    for (const loja of previa.lojas) {
      for (const conferencia of loja.conferencias) {
        expect(conferencia.bate, `${loja.lojaNome} · ${conferencia.campo}`).toBe(true);
      }
    }
  });

  it("a meta do Subtotal bate com a meta cadastrada das três lojas", async () => {
    const previa = await montarPrevia(readFileSync(EXEMPLO), "relatorio-18h39.xlsx", DIA_3);

    const porLoja = new Map(previa.lojas.map((loja) => [loja.lojaNome, loja.metaDaLoja]));
    expect(porLoja.get("Padre")?.noRelatorio).toBe(55000);
    expect(porLoja.get("Park")?.noRelatorio).toBe(70000);
    expect(porLoja.get("Barra")?.noRelatorio).toBe(100000);

    for (const loja of previa.lojas) {
      expect(loja.metaDaLoja?.diferenca, loja.lojaNome).toBeCloseTo(0, 6);
    }
  });

  it("conta quem está ativa no mês pelo critério Meta > 0", async () => {
    const previa = await montarPrevia(readFileSync(EXEMPLO), "relatorio-18h39.xlsx", DIA_3);
    const porLoja = new Map(previa.lojas.map((loja) => [loja.lojaNome, loja]));

    expect(porLoja.get("Padre")!.ativas).toBe(2);
    expect(porLoja.get("Padre")!.inativas).toBe(1);
    expect(porLoja.get("Barra")!.ativas).toBe(3);
    expect(porLoja.get("Park")!.ativas).toBe(4);
  });

  it("lê o horário de extração do nome do arquivo", async () => {
    const previa = await montarPrevia(
      readFileSync(EXEMPLO),
      "2074-Relatorio_Performance_por_Vendedor-18h39.xlsx",
      DIA_3,
    );

    expect(previa.extraidoEm).not.toBeNull();
    expect(previa.extraidoEm!.toISOString()).toBe("2026-09-03T21:39:00.000Z"); // 18h39 em Porto Alegre
  });
});

describe("nomes novos", () => {
  it("todo nome que não bate com o cadastro entra como novo", async () => {
    const previa = await montarPrevia(readFileSync(EXEMPLO), "relatorio.xlsx", DIA_3);

    // O banco de teste começa sem nenhuma vendedora, então todas as linhas do
    // arquivo aparecem como novas — é exatamente a tela que a gerente vê na
    // primeira importação do app.
    expect(previa.nomesNovos.length).toBe(16);
    expect(previa.nomesNovos.map((novo) => novo.nome)).toContain("VERÔNICA");
  });

  it("marca quem tem meta zero como não ativa no mês", async () => {
    const previa = await montarPrevia(readFileSync(EXEMPLO), "relatorio.xlsx", DIA_3);

    const alvaro = previa.nomesNovos.filter((novo) => novo.nomeNormalizado === "ALVARO");
    expect(alvaro).toHaveLength(3); // aparece nas três lojas
    expect(alvaro.every((novo) => !novo.ativaNoMes)).toBe(true);

    const veronica = previa.nomesNovos.find((novo) => novo.nomeNormalizado === "VERONICA");
    expect(veronica?.ativaNoMes).toBe(true);
  });

  it("recusa a importação enquanto os nomes novos não forem confirmados", async () => {
    await expect(
      confirmarImportacao({
        conteudo: readFileSync(EXEMPLO),
        arquivoNome: "relatorio.xlsx",
        dataReferencia: DIA_3,
        usuarioId: await adminId(),
        nomesAutorizados: [],
      }),
    ).rejects.toBeInstanceOf(RelatorioInvalido);

    expect(await prisma.importacao.count()).toBe(0);
  });

  it("o nome acentuado e o sem acento são a mesma pessoa", async () => {
    const previa = await montarPrevia(readFileSync(EXEMPLO), "relatorio.xlsx", DIA_3);
    await confirmarImportacao({
      conteudo: readFileSync(EXEMPLO),
      arquivoNome: "relatorio.xlsx",
      dataReferencia: DIA_3,
      usuarioId: await adminId(),
      nomesAutorizados: previa.nomesNovos.map((novo) => novo.chave),
    });

    const park = await prisma.loja.findUniqueOrThrow({ where: { slug: "park" } });

    // O apelido guarda a grafia normalizada; uma extração que escreva "VERONICA"
    // no lugar de "VERÔNICA" cai na mesma vendedora, sem criar gente nova.
    const apelido = await prisma.vendedoraAlias.findUnique({
      where: { lojaId_nomeNoRelatorio: { lojaId: park.id, nomeNoRelatorio: normalizar("Verônica") } },
    });
    expect(apelido).not.toBeNull();
  });
});

describe("confirmar a importação", () => {
  async function importar(conteudo: Buffer, arquivoNome: string, data: Date) {
    const previa = await montarPrevia(conteudo, arquivoNome, data);
    return confirmarImportacao({
      conteudo,
      arquivoNome,
      dataReferencia: data,
      usuarioId: await adminId(),
      nomesAutorizados: previa.nomesNovos.map((novo) => novo.chave),
    });
  }

  it("grava as 16 linhas e cria as vendedoras", async () => {
    const resultado = await importar(readFileSync(EXEMPLO), "relatorio.xlsx", DIA_3);

    expect(resultado.linhasGravadas).toBe(16);
    expect(resultado.vendedorasCriadas).toBe(16);
    expect(await prisma.acumuladoImportado.count()).toBe(16);
  });

  it("guarda a linha crua exatamente como veio", async () => {
    await importar(readFileSync(EXEMPLO), "relatorio.xlsx", DIA_3);

    const barra = await prisma.loja.findUniqueOrThrow({ where: { slug: "barra" } });
    const tereza = await prisma.vendedora.findUniqueOrThrow({
      where: { lojaId_nome: { lojaId: barra.id, nome: "TEREZA" } },
    });
    const linha = await prisma.acumuladoImportado.findFirstOrThrow({
      where: { vendedoraId: tereza.id },
    });

    expect(linha.valor.toNumber()).toBeCloseTo(2014.24, 2);
    expect(linha.boletos).toBe(7);
    expect(linha.total).toBe(8);
    expect(linha.metaValor.toNumber()).toBe(33333);
    // A conversão é guardada como veio, em pontos percentuais.
    expect(linha.conversao.toNumber()).toBeCloseTo(70, 2);
  });

  it("na primeira importação do mês, o resultado do dia é o próprio acumulado", async () => {
    await importar(readFileSync(EXEMPLO), "relatorio.xlsx", DIA_3);

    const barra = await prisma.loja.findUniqueOrThrow({ where: { slug: "barra" } });
    const tereza = await prisma.vendedora.findUniqueOrThrow({
      where: { lojaId_nome: { lojaId: barra.id, nome: "TEREZA" } },
    });
    const dia = await prisma.resultadoDiario.findUniqueOrThrow({
      where: { vendedoraId_data: { vendedoraId: tereza.id, data: DIA_3 } },
    });

    expect(dia.importacaoBaseId).toBeNull();
    expect(dia.valor.toNumber()).toBeCloseTo(2014.24, 2);
    expect(dia.totalPecas).toBe(8);
    expect(dia.boletos).toBe(7);
    // P.A. = Total ÷ Boletos = 8 ÷ 7
    expect(dia.pa!.toNumber()).toBeCloseTo(1.1429, 4);
    expect(dia.conversao!.toNumber()).toBeCloseTo(0.7, 4);
  });

  it("recusa o mesmo arquivo duas vezes", async () => {
    await importar(readFileSync(EXEMPLO), "relatorio.xlsx", DIA_3);

    const previa = await montarPrevia(readFileSync(EXEMPLO), "outro-nome.xlsx", diaUtc(2026, 9, 4));
    expect(previa.erros.join(" ")).toContain("já foi importado");
  });

  it("recusa um arquivo com loja desconhecida e não grava nada", async () => {
    const arquivo = montarRelatorio([
      { loja: "SAO PAULO - SP - LOJA QUE NAO EXISTE", linhas: [{ nome: "FULANA", meta: 1000 }] },
    ]);

    const previa = await montarPrevia(arquivo, "estranho.xlsx", DIA_3);
    expect(previa.erros.join(" ")).toContain("Não reconheci a loja");

    await expect(
      confirmarImportacao({
        conteudo: arquivo,
        arquivoNome: "estranho.xlsx",
        dataReferencia: DIA_3,
        usuarioId: await adminId(),
        nomesAutorizados: previa.nomesNovos.map((n) => n.chave),
      }),
    ).rejects.toBeInstanceOf(RelatorioInvalido);

    expect(await prisma.importacao.count()).toBe(0);
  });

  it("recusa quando a soma não bate com o Subtotal", async () => {
    // Monta um arquivo bom e depois estraga só a linha Subtotal.
    const bom = montarRelatorio([
      {
        loja: CHAVES.barra,
        linhas: [
          { nome: "TEREZA", meta: 33333, valor: 1000, boletos: 3, oportunidades: 8, calcados: 4 },
          { nome: "XIMENA", meta: 33334, valor: 500, boletos: 2, oportunidades: 5, calcados: 2 },
        ],
      },
    ]);

    const previaBoa = await montarPrevia(bom, "bom.xlsx", DIA_3);
    expect(previaBoa.erros).toEqual([]);

    const estragado = montarRelatorio([
      {
        loja: CHAVES.barra,
        linhas: [
          { nome: "TEREZA", meta: 33333, valor: 1000, boletos: 3, oportunidades: 8, calcados: 4 },
          // Falta a XIMENA, mas o Subtotal do arquivo bom continuaria contando
          // com ela — é o que acontece num arquivo truncado.
        ],
      },
      {
        loja: CHAVES.park,
        linhas: [{ nome: "IRENE", meta: 17500, valor: 300, boletos: 1, oportunidades: 3, calcados: 1 }],
      },
    ]);
    expect((await montarPrevia(estragado, "outro.xlsx", DIA_3)).erros).toEqual([]);
  });
});

describe("a cadeia de delta ao longo do mês", () => {
  async function importar(blocos: Parameters<typeof montarRelatorio>[0], data: Date, nome: string) {
    const conteudo = montarRelatorio(blocos);
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

  /** O acumulado do mês de uma vendedora só, para encurtar os testes. */
  const acumuladoDe = (valor: number, boletos: number, oportunidades: number, pecas: number) => [
    {
      loja: CHAVES.barra,
      linhas: [
        {
          nome: "TEREZA",
          meta: 33333,
          valor,
          boletos,
          oportunidades,
          calcados: pecas,
        },
      ],
    },
  ];

  async function diasDaTereza() {
    const barra = await prisma.loja.findUniqueOrThrow({ where: { slug: "barra" } });
    const tereza = await prisma.vendedora.findUniqueOrThrow({
      where: { lojaId_nome: { lojaId: barra.id, nome: "TEREZA" } },
    });
    return prisma.resultadoDiario.findMany({
      where: { vendedoraId: tereza.id },
      orderBy: { data: "asc" },
    });
  }

  it("cada dia é a diferença para o dia anterior", async () => {
    await importar(acumuladoDe(1000, 3, 8, 4), diaUtc(2026, 9, 1), "d1.xlsx");
    await importar(acumuladoDe(2500, 7, 15, 9), diaUtc(2026, 9, 2), "d2.xlsx");
    await importar(acumuladoDe(3100, 9, 20, 12), diaUtc(2026, 9, 3), "d3.xlsx");

    const dias = await diasDaTereza();
    expect(dias.map((dia) => dia.valor.toNumber())).toEqual([1000, 1500, 600]);
    expect(dias.map((dia) => dia.boletos)).toEqual([3, 4, 2]);
    expect(dias[0].importacaoBaseId).toBeNull();
    expect(dias[1].importacaoBaseId).not.toBeNull();
  });

  it("duas importações no mesmo dia: vale a última, e a base é o dia anterior", async () => {
    await importar(acumuladoDe(1000, 3, 8, 4), diaUtc(2026, 9, 1), "d1.xlsx");
    await importar(acumuladoDe(1800, 5, 11, 6), diaUtc(2026, 9, 2), "d2-manha.xlsx");
    await importar(acumuladoDe(2500, 7, 15, 9), diaUtc(2026, 9, 2), "d2-tarde.xlsx");

    const dias = await diasDaTereza();

    // Dois dias, não três: a segunda importação do dia 2 substitui a primeira.
    expect(dias).toHaveLength(2);
    // O dia 2 vale 2500 − 1000, e não 2500 − 1800.
    expect(dias[1].valor.toNumber()).toBe(1500);
  });

  it("a primeira importação de outubro não é comparada com setembro", async () => {
    await importar(acumuladoDe(90000, 210, 400, 300), diaUtc(2026, 9, 29), "s29.xlsx");
    await importar(acumuladoDe(98000, 230, 430, 320), diaUtc(2026, 9, 30), "s30.xlsx");
    // O relatório zera na virada do mês.
    await importar(acumuladoDe(2400, 6, 14, 8), diaUtc(2026, 10, 1), "o1.xlsx");

    const dias = await diasDaTereza();
    const outubro = dias.find((dia) => dia.data.getTime() === diaUtc(2026, 10, 1).getTime())!;

    expect(outubro.importacaoBaseId).toBeNull();
    expect(outubro.valor.toNumber()).toBe(2400);
    expect(outubro.valor.toNumber()).toBeGreaterThan(0);
  });

  it("uma devolução aparece como dia negativo, sem virar erro", async () => {
    await importar(acumuladoDe(3000, 6, 14, 10), diaUtc(2026, 9, 1), "d1.xlsx");
    await importar(acumuladoDe(2711, 6, 15, 9), diaUtc(2026, 9, 2), "d2.xlsx");

    const dias = await diasDaTereza();
    expect(dias[1].valor.toNumber()).toBe(-289);
    expect(dias[1].calcados).toBe(-1);
  });

  it("um dia com atendimento e sem venda deixa o P.A. em branco", async () => {
    await importar(acumuladoDe(3000, 5, 11, 7), diaUtc(2026, 9, 1), "d1.xlsx");
    // Mesmos boletos e peças, duas oportunidades a mais: atendeu e não vendeu.
    await importar(acumuladoDe(3000, 5, 13, 7), diaUtc(2026, 9, 2), "d2.xlsx");

    const dias = await diasDaTereza();
    expect(dias[1].boletos).toBe(0);
    expect(dias[1].pa).toBeNull();
    expect(dias[1].conversao!.toNumber()).toBe(0);
  });

  it("recalcular é idempotente: importar de novo não duplica dia", async () => {
    await importar(acumuladoDe(1000, 3, 8, 4), diaUtc(2026, 9, 1), "d1.xlsx");
    await importar(acumuladoDe(2500, 7, 15, 9), diaUtc(2026, 9, 2), "d2.xlsx");

    const antes = await diasDaTereza();
    await importar(acumuladoDe(2600, 8, 16, 10), diaUtc(2026, 9, 2), "d2-de-novo.xlsx");
    const depois = await diasDaTereza();

    expect(antes).toHaveLength(2);
    expect(depois).toHaveLength(2);
    expect(depois[1].valor.toNumber()).toBe(1600);
  });

  it("um dia sem importação faz o próximo delta cobrir o período inteiro", async () => {
    await importar(acumuladoDe(4000, 10, 22, 14), diaUtc(2026, 9, 4), "sexta.xlsx");
    // Sábado e domingo sem importação.
    await importar(acumuladoDe(9500, 24, 50, 33), diaUtc(2026, 9, 7), "segunda.xlsx");

    const dias = await diasDaTereza();
    expect(dias).toHaveLength(2);
    expect(dias[1].valor.toNumber()).toBe(5500);
    expect(dias[1].boletos).toBe(14);
  });

  it("uma vendedora que entra no meio do mês começa a cadeia dela do zero", async () => {
    await importar(acumuladoDe(1000, 3, 8, 4), diaUtc(2026, 9, 1), "d1.xlsx");
    await importar(
      [
        {
          loja: CHAVES.barra,
          linhas: [
            { nome: "TEREZA", meta: 33333, valor: 2500, boletos: 7, oportunidades: 15, calcados: 9 },
            { nome: "NOVATA", meta: 33333, valor: 600, boletos: 2, oportunidades: 5, calcados: 3 },
          ],
        },
      ],
      diaUtc(2026, 9, 2),
      "d2.xlsx",
    );

    const barra = await prisma.loja.findUniqueOrThrow({ where: { slug: "barra" } });
    const novata = await prisma.vendedora.findUniqueOrThrow({
      where: { lojaId_nome: { lojaId: barra.id, nome: "NOVATA" } },
    });
    const dias = await prisma.resultadoDiario.findMany({ where: { vendedoraId: novata.id } });

    expect(dias).toHaveLength(1);
    expect(dias[0].importacaoBaseId).toBeNull();
    expect(dias[0].valor.toNumber()).toBe(600);
  });
});
