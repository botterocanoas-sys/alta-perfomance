import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

import {
  conversaoEmFracao,
  lerRelatorio,
  RelatorioInvalido,
  somarBloco,
} from "@/lib/relatorio/parser";
import { normalizar } from "@/lib/texto";
import { CABECALHO, CHAVES, montarRelatorio } from "./planilha";

/**
 * Parser do relatório — item 5 dos testes obrigatórios da seção 11.
 *
 * A parte que roda contra o arquivo de exemplo (uma cópia do relatório real,
 * com os nomes trocados por fictícios e todos os números preservados) prova que
 * o parser aguenta a bagunça de verdade. A parte sintética prova o que o
 * arquivo de exemplo não traz: outra ordem de blocos, coluna faltando,
 * cabeçalho em outra altura.
 */

const ARQUIVO_DE_EXEMPLO = "tests/fixtures/relatorio-exemplo-18h39.xlsx";
const exemplo = () => readFileSync(ARQUIVO_DE_EXEMPLO);

describe("o arquivo de exemplo", () => {
  it("acha o cabeçalho, que não está na linha 1", () => {
    const relatorio = lerRelatorio(exemplo());
    expect(relatorio.linhaDoCabecalho).toBe(14);
    expect(relatorio.aba).toBe("Indicadores");
  });

  it("reconhece as três lojas", () => {
    const relatorio = lerRelatorio(exemplo());
    const chaves = relatorio.blocos.map((bloco) => bloco.chave);

    expect(chaves).toHaveLength(3);
    expect(chaves).toEqual(
      expect.arrayContaining([
        normalizar(CHAVES.padre),
        normalizar(CHAVES.park),
        normalizar(CHAVES.barra),
      ]),
    );
  });

  it("resolve o espaço na frente do nome da Barra", () => {
    const relatorio = lerRelatorio(exemplo());
    const barra = relatorio.blocos.find((bloco) => bloco.chave === normalizar(CHAVES.barra));

    expect(barra).toBeDefined();
    // O texto original é preservado, com espaço e tudo, para a mensagem de erro
    // mostrar o que estava escrito de fato.
    expect(barra!.chaveOriginal.startsWith(" ")).toBe(true);
  });

  it("arrasta a loja para baixo: toda linha do bloco pertence à loja certa", () => {
    const relatorio = lerRelatorio(exemplo());
    const porChave = new Map(relatorio.blocos.map((bloco) => [bloco.chave, bloco]));

    expect(porChave.get(normalizar(CHAVES.padre))!.vendedores).toHaveLength(3);
    expect(porChave.get(normalizar(CHAVES.park))!.vendedores).toHaveLength(7);
    expect(porChave.get(normalizar(CHAVES.barra))!.vendedores).toHaveLength(6);
  });

  it("tira a linha Subtotal de fora dos vendedores", () => {
    const relatorio = lerRelatorio(exemplo());

    for (const bloco of relatorio.blocos) {
      expect(bloco.subtotal, `${bloco.chave} ficou sem subtotal`).not.toBeNull();
      expect(bloco.vendedores.map((linha) => linha.nomeNormalizado)).not.toContain("SUBTOTAL");
    }
  });

  it("a soma de cada bloco bate com a linha Subtotal", () => {
    const relatorio = lerRelatorio(exemplo());

    for (const bloco of relatorio.blocos) {
      const soma = somarBloco(bloco);
      const subtotal = bloco.subtotal!;

      expect(Number(soma.valor.toFixed(2)), bloco.chave).toBe(Number(subtotal.valor.toFixed(2)));
      expect(soma.boletos, bloco.chave).toBe(subtotal.boletos);
      expect(soma.oportunidades, bloco.chave).toBe(subtotal.oportunidades);
      expect(soma.total, bloco.chave).toBe(subtotal.total);
      expect(soma.calcados, bloco.chave).toBe(subtotal.calcados);
    }
  });

  it("a linha Subtotal traz a meta da loja", () => {
    const relatorio = lerRelatorio(exemplo());
    const metaPorLoja = new Map(
      relatorio.blocos.map((bloco) => [bloco.chave, bloco.subtotal!.metaValor]),
    );

    expect(metaPorLoja.get(normalizar(CHAVES.padre))).toBe(55000);
    expect(metaPorLoja.get(normalizar(CHAVES.park))).toBe(70000);
    expect(metaPorLoja.get(normalizar(CHAVES.barra))).toBe(100000);
  });

  it('"Meta > 0" separa quem está no programa neste mês', () => {
    const relatorio = lerRelatorio(exemplo());
    const ativasPorLoja = new Map(
      relatorio.blocos.map((bloco) => [
        bloco.chave,
        bloco.vendedores.filter((linha) => linha.metaValor > 0).length,
      ]),
    );

    expect(ativasPorLoja.get(normalizar(CHAVES.padre))).toBe(2);
    expect(ativasPorLoja.get(normalizar(CHAVES.barra))).toBe(3);
    expect(ativasPorLoja.get(normalizar(CHAVES.park))).toBe(4);
  });

  it("a coluna Total é a soma de todas as categorias, e é o numerador do P.A.", () => {
    const relatorio = lerRelatorio(exemplo());

    for (const bloco of relatorio.blocos) {
      for (const linha of bloco.vendedores) {
        const somaDasCategorias =
          linha.calcados + linha.bolsas + linha.cintos + linha.carteiras + linha.meias + linha.kitCuidado;
        expect(linha.total, `${linha.nome} na linha ${linha.linhaOriginal}`).toBe(somaDasCategorias);

        if (linha.boletos > 0) {
          expect(linha.pa, `P.A. de ${linha.nome}`).toBeCloseTo(linha.total / linha.boletos, 3);
        }
      }
    }
  });

  it("a Conversão do relatório vem em pontos percentuais, não em fração", () => {
    const relatorio = lerRelatorio(exemplo());

    for (const bloco of relatorio.blocos) {
      for (const linha of bloco.vendedores) {
        if (linha.oportunidades === 0) continue;
        const esperada = (linha.boletos / linha.oportunidades) * 100;
        expect(linha.conversao, `conversão de ${linha.nome}`).toBeCloseTo(esperada, 1);
      }
    }

    expect(conversaoEmFracao(44.44)).toBeCloseTo(0.4444, 4);
  });

  it("preserva a grafia original e guarda a versão normalizada ao lado", () => {
    const relatorio = lerRelatorio(exemplo());
    const nomes = relatorio.blocos.flatMap((bloco) => bloco.vendedores);

    const comAcento = nomes.find((linha) => linha.nome.includes("Ô") || linha.nome.includes("Ã"));
    expect(comAcento, "o arquivo de exemplo precisa ter ao menos um nome acentuado").toBeDefined();
    expect(comAcento!.nomeNormalizado).not.toMatch(/[ÔÃ]/);
  });
});

describe("a ordem dos blocos não importa", () => {
  const linhasDaPadre = [{ nome: "CLARICE", meta: 11000, valor: 900, boletos: 2, oportunidades: 5, calcados: 2 }];
  const linhasDaBarra = [{ nome: "TEREZA", meta: 33333, valor: 2014.24, boletos: 7, oportunidades: 10, calcados: 7, carteiras: 1 }];
  const linhasDaPark = [{ nome: "IRENE", meta: 17500, valor: 1639.5, boletos: 3, oportunidades: 6, calcados: 5 }];

  it("lê igual em qualquer ordem", () => {
    const ordens = [
      [CHAVES.padre, CHAVES.park, CHAVES.barra],
      [CHAVES.padre, CHAVES.barra, CHAVES.park],
      [CHAVES.barra, CHAVES.park, CHAVES.padre],
      [CHAVES.park, CHAVES.padre, CHAVES.barra],
    ];

    const porChave = {
      [CHAVES.padre]: linhasDaPadre,
      [CHAVES.park]: linhasDaPark,
      [CHAVES.barra]: linhasDaBarra,
    } as Record<string, typeof linhasDaPadre>;

    for (const ordem of ordens) {
      const arquivo = montarRelatorio(ordem.map((loja) => ({ loja, linhas: porChave[loja] })));
      const relatorio = lerRelatorio(arquivo);

      const barra = relatorio.blocos.find((bloco) => bloco.chave === normalizar(CHAVES.barra));
      expect(barra, `ordem ${ordem.join(" → ")}`).toBeDefined();
      expect(barra!.vendedores[0].nome).toBe("TEREZA");
      expect(barra!.vendedores[0].valor).toBeCloseTo(2014.24, 2);
      expect(relatorio.blocos).toHaveLength(3);
    }
  });
});

describe("arquivos que devem ser recusados", () => {
  it("sem a linha de cabeçalho", () => {
    const arquivo = montarRelatorio([{ loja: CHAVES.padre, linhas: [{ nome: "CLARICE" }] }], {
      cabecalho: ["Alguma", "Outra", "Coisa"],
    });

    expect(() => lerRelatorio(arquivo)).toThrow(RelatorioInvalido);
  });

  it("faltando uma coluna esperada, e diz qual", () => {
    const semBoletos = CABECALHO.filter((coluna) => coluna !== "Boletos");
    const arquivo = montarRelatorio([{ loja: CHAVES.padre, linhas: [{ nome: "CLARICE" }] }], {
      cabecalho: semBoletos,
    });

    try {
      lerRelatorio(arquivo);
      throw new Error("deveria ter recusado");
    } catch (erro) {
      expect(erro).toBeInstanceOf(RelatorioInvalido);
      expect((erro as RelatorioInvalido).detalhes.join(" ")).toContain("BOLETOS");
    }
  });

  it("com cabeçalho mas nenhum bloco de loja", () => {
    const arquivo = montarRelatorio([]);
    expect(() => lerRelatorio(arquivo)).toThrow(RelatorioInvalido);
  });
});

describe("tolerância a variações do arquivo", () => {
  it("aceita o cabeçalho em outra altura", () => {
    for (const antes of [1, 5, 12, 20]) {
      const arquivo = montarRelatorio(
        [{ loja: CHAVES.park, linhas: [{ nome: "IRENE", meta: 17500, boletos: 3, calcados: 5 }] }],
        { linhasAntesDoCabecalho: antes },
      );

      const relatorio = lerRelatorio(arquivo);
      expect(relatorio.blocos[0].vendedores[0].nome, `com ${antes} linhas antes`).toBe("IRENE");
    }
  });

  it("aceita um bloco sem linha Subtotal", () => {
    const arquivo = montarRelatorio([
      { loja: CHAVES.park, linhas: [{ nome: "IRENE", meta: 17500 }], comSubtotal: false },
    ]);

    const relatorio = lerRelatorio(arquivo);
    expect(relatorio.blocos[0].subtotal).toBeNull();
    expect(relatorio.blocos[0].vendedores).toHaveLength(1);
  });
});
